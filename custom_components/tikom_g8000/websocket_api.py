"""Websocket commands used by the panel. Every command needs an admin user."""

from __future__ import annotations

import math
from collections.abc import Callable, Coroutine
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DIRECTIONS, DOMAIN
from .controller import CLEAN_MODES, Controller

NAME = vol.All(str, vol.Length(min=1, max=40))
ROOM_ID = vol.All(str, vol.Length(min=1, max=60), vol.Match(r"^[a-z0-9_]+$"))
COLOR = vol.All(str, vol.Match(r"^#[0-9a-fA-F]{6}$"))
MODE = vol.In(CLEAN_MODES)
ENTRY = {vol.Optional("entry_id"): str}


def _controller(hass: HomeAssistant, entry_id: str | None) -> Controller:
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    for entry in entries:
        if entry_id is None or entry.entry_id == entry_id:
            return entry.runtime_data
    raise HomeAssistantError("Tikom G8000 ist nicht eingerichtet.")


def _command(
    schema: dict[Any, Any],
) -> Callable[[Callable[..., Coroutine[Any, Any, Any]]], Callable[..., Any]]:
    """Register an admin-only, schema-checked command that returns a result."""

    def decorator(func: Callable[..., Coroutine[Any, Any, Any]]) -> Callable[..., Any]:
        @websocket_api.require_admin
        @websocket_api.websocket_command({**schema, **ENTRY})
        @websocket_api.async_response
        async def handler(
            hass: HomeAssistant,
            connection: websocket_api.ActiveConnection,
            msg: dict[str, Any],
        ) -> None:
            try:
                controller = _controller(hass, msg.get("entry_id"))
                result = await func(hass, controller, msg)
            except HomeAssistantError as err:
                connection.send_error(msg["id"], "failed", str(err))
                return
            connection.send_result(msg["id"], result)

        return handler

    return decorator


@_command({vol.Required("type"): f"{DOMAIN}/snapshot"})
async def ws_snapshot(hass, c, msg):
    """Everything the panel shows."""
    return c.snapshot()


FLOOR_ID = vol.All(str, vol.Length(min=1, max=24), vol.Match(r"^[A-Za-z0-9_-]+$"))


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/get_image",
        vol.Required("floor_id"): FLOOR_ID,
    }
)
async def ws_get_image(hass, c, msg):
    """The background image of a floor."""
    return {"image": c.image_of(msg["floor_id"])}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/floor",
        vol.Required("action"): vol.In(["save", "add", "delete", "robot_here"]),
        vol.Optional("floor"): dict,
        vol.Optional("image"): vol.Any(None, dict),
        vol.Optional("floor_id"): FLOOR_ID,
        vol.Optional("name"): NAME,
    }
)
async def ws_floor(hass, c, msg):
    """Save a floor, add or delete one, or say on which floor the robot stands."""
    action = msg["action"]
    if action == "save":
        if "floor" not in msg:
            raise HomeAssistantError("Stockwerk fehlt.")
        floor_id = c.save_floor(msg["floor"], msg.get("image"), set_image="image" in msg)
        return {"floor_id": floor_id}
    if action == "add":
        if "name" not in msg:
            raise HomeAssistantError("Name fehlt.")
        return {"floor_id": c.add_floor(msg["name"])}
    if "floor_id" not in msg:
        raise HomeAssistantError("floor_id fehlt.")
    if action == "delete":
        c.delete_floor(msg["floor_id"])
    else:
        c.set_robot_floor(msg["floor_id"])
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/room",
        vol.Required("action"): vol.In(["add", "update", "delete"]),
        vol.Optional("room_id"): ROOM_ID,
        vol.Optional("name"): NAME,
        vol.Optional("color"): COLOR,
        vol.Optional("minutes"): vol.All(vol.Coerce(float), vol.Range(min=1, max=90)),
        vol.Optional("target"): vol.Any(
            None, vol.All([vol.All(vol.Coerce(int), vol.Range(min=-5000, max=10000))], vol.Length(2, 2))
        ),
        vol.Optional("use_recorded"): bool,
    }
)
async def ws_room(hass, c, msg):
    """Create, change or delete a room."""
    action = msg["action"]
    if action == "add":
        if "name" not in msg:
            raise HomeAssistantError("Name fehlt.")
        room_id = c.add_room(msg["name"], minutes=msg.get("minutes"))
        fields = {k: msg[k] for k in ("color",) if k in msg}
        if fields:
            c.update_room(room_id, **fields)
        return {"room_id": room_id}
    if "room_id" not in msg:
        raise HomeAssistantError("room_id fehlt.")
    if action == "delete":
        c.delete_room(msg["room_id"])
        return {}
    fields = {
        k: msg[k] for k in ("name", "color", "minutes", "target", "use_recorded") if k in msg
    }
    c.update_room(msg["room_id"], **fields)
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/preview",
        vol.Required("room_id"): ROOM_ID,
        vol.Optional("mode", default="sweep_and_mop"): MODE,
    }
)
async def ws_preview(hass, c, msg):
    """Route and expected path for a room."""
    return c.preview(msg["room_id"], msg["mode"])


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/clean",
        vol.Required("rooms"): vol.All([ROOM_ID], vol.Length(min=1, max=35)),
        vol.Optional("mode"): MODE,
        vol.Optional("dry_run", default=False): bool,
    }
)
async def ws_clean(hass, c, msg):
    """Start cleaning rooms (or a test drive)."""
    if msg["dry_run"]:
        c.start_dry_run(msg["rooms"][0])
    else:
        c.start_rooms(msg["rooms"], msg.get("mode"))
    return {}


@_command({vol.Required("type"): f"{DOMAIN}/abort"})
async def ws_abort(hass, c, msg):
    """Stop everything and go home."""
    await c.async_abort()
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/drive",
        vol.Required("direction"): vol.In(list(DIRECTIONS)),
        vol.Optional("seconds"): vol.All(vol.Coerce(float), vol.Range(min=0.1, max=30)),
        vol.Optional("record", default=True): bool,
    }
)
async def ws_drive(hass, c, msg):
    """Drive one step."""
    await c.async_drive(msg["direction"], msg.get("seconds"), msg["record"])
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/recording",
        vol.Required("action"): vol.In(["clear", "test", "save_as_room", "save_to_room"]),
        vol.Optional("name"): NAME,
        vol.Optional("room_id"): ROOM_ID,
    }
)
async def ws_recording(hass, c, msg):
    """Work with the recorded route."""
    action = msg["action"]
    if action == "clear":
        c.clear_recording()
    elif action == "test":
        await c.async_test_recording()
    elif action == "save_as_room":
        if "name" not in msg:
            raise HomeAssistantError("Name fehlt.")
        room_id = c.save_room(msg["name"], c.recording)
        c.clear_recording()
        return {"room_id": room_id}
    elif action == "save_to_room":
        room = c.rooms.get(msg.get("room_id", ""))
        if room is None:
            raise HomeAssistantError("Raum nicht gefunden.")
        c.save_room(room["name"], c.recording)
        c.clear_recording()
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/calibration",
        vol.Required("action"): vol.In(["set", "measure_speed", "measure_turn", "feedback"]),
        vol.Optional("speed_cm_s"): vol.All(vol.Coerce(float), vol.Range(min=5, max=80)),
        vol.Optional("turn_deg_s"): vol.All(vol.Coerce(float), vol.Range(min=10, max=360)),
        vol.Optional("seconds"): vol.All(vol.Coerce(float), vol.Range(min=0.5, max=30)),
        vol.Optional("measured"): vol.All(vol.Coerce(float), vol.Range(min=1, max=2000)),
        vol.Optional("kind"): vol.In(["too_short", "too_long", "over_turn", "under_turn"]),
    }
)
async def ws_calibration(hass, c, msg):
    """Measure or adjust speed and turn rate."""
    action = msg["action"]
    if action == "set":
        c.set_calibration(msg.get("speed_cm_s"), msg.get("turn_deg_s"))
    elif action == "measure_speed":
        if "seconds" not in msg or "measured" not in msg:
            raise HomeAssistantError("Sekunden und Strecke fehlen.")
        c.set_calibration(speed_cm_s=msg["measured"] / msg["seconds"])
    elif action == "measure_turn":
        if "seconds" not in msg or "measured" not in msg:
            raise HomeAssistantError("Sekunden und Winkel fehlen.")
        c.set_calibration(turn_deg_s=msg["measured"] / msg["seconds"])
    elif action == "feedback":
        if "kind" not in msg:
            raise HomeAssistantError("Art der Rückmeldung fehlt.")
        c.feedback(msg["kind"])
    return {}


@_command(
    {
        vol.Required("type"): f"{DOMAIN}/setting",
        vol.Required("key"): vol.In(["clean_mode", "start_mode", "min_battery", "step_seconds"]),
        vol.Required("value"): vol.Any(str, int, float),
    }
)
async def ws_setting(hass, c, msg):
    """Change one of the few settings."""
    key, value = msg["key"], msg["value"]
    if key == "clean_mode" and value not in CLEAN_MODES:
        raise HomeAssistantError("Unbekannter Modus.")
    if key == "start_mode" and value not in ("clean", "wall_follow", "random"):
        raise HomeAssistantError("Unbekannter Modus.")
    if key in ("min_battery", "step_seconds"):
        try:
            number = float(value)
        except (TypeError, ValueError) as err:
            raise HomeAssistantError("Ungültiger Zahlenwert.") from err
        if not math.isfinite(number):
            raise HomeAssistantError("Ungültiger Zahlenwert.")
        value = min(max(number, 20.0), 100.0) if key == "min_battery" else min(
            max(number, 0.5), 30.0
        )
    c.set_setting(key, value)
    return {}


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe", **ENTRY})
@websocket_api.async_response
async def ws_subscribe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Send a fresh snapshot whenever something changes."""
    try:
        c = _controller(hass, msg.get("entry_id"))
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "failed", str(err))
        return

    @callback
    def push() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], c.snapshot()))

    unsubscribe = async_dispatcher_connect(hass, c.signal_update, push)
    unsubscribe_added = async_dispatcher_connect(hass, c.signal_room_added, lambda _: push())
    unsubscribe_removed = async_dispatcher_connect(hass, c.signal_room_removed, lambda _: push())

    @callback
    def cleanup() -> None:
        unsubscribe()
        unsubscribe_added()
        unsubscribe_removed()

    connection.subscriptions[msg["id"]] = cleanup
    connection.send_result(msg["id"])
    push()


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register all commands once."""
    for handler in (
        ws_snapshot,
        ws_get_image,
        ws_floor,
        ws_room,
        ws_preview,
        ws_clean,
        ws_abort,
        ws_drive,
        ws_recording,
        ws_calibration,
        ws_setting,
        ws_subscribe,
    ):
        websocket_api.async_register_command(hass, handler)
