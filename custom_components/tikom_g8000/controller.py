"""Logic: plan, rooms, calibration, driving and room cleaning."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import slugify

from . import planner
from .const import (
    BATTERY_WAIT,
    CODE_TO_DIRECTION,
    CONF_VACUUM,
    DEFAULT_MIN_BATTERY,
    DEFAULT_ROOM_MINUTES,
    DEFAULT_STEP_SECONDS,
    DIRECTIONS,
    DOCK_WAIT,
    DOMAIN,
    MAX_ROUTE_LENGTH,
    ROOM_COLORS,
    START_CHECK_DELAY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
CLEAN_MODES = ("sweep", "mop", "sweep_and_mop")
FEEDBACK_STEP = 0.05
# Suffix of the Tuya Local unique_id ("<device>-<config_id>") for every tile
TUYA_ENTITY_KEYS = {
    "water": "select_mopping",
    "mode": "select_cleaning_mode",
    "carpet_boost": "switch_carpet_boost",
    "carpet_detection": "switch_carpet_detection",
    "volume": "select_volume",
    "language": "select_language",
    "battery": "sensor_battery",
    "filter": "sensor_filter_life",
    "edge_brush": "sensor_edge_brush_life",
    "roll_brush": "sensor_roll_brush_life",
    "area": "sensor_cleaning_area",
    "time": "sensor_cleaning_time",
    "problem": "binary_sensor_problem",
    "reset_filter": "button_filter_reset",
    "reset_edge_brush": "button_reset_edge_brush",
    "reset_roll_brush": "button_reset_roll_brush",
}


def parse_route(route: str | None) -> list[tuple[str, float]]:
    """Turn "f6.5,l1.2,f3" into [("forward", 6.5), ("left", 1.2), ("forward", 3.0)].

    Invalid tokens are skipped; seconds are limited to the safety maximum.
    """
    steps: list[tuple[str, float]] = []
    for token in (route or "").split(","):
        token = token.strip().lower()
        if len(token) < 2 or token[0] not in CODE_TO_DIRECTION:
            continue
        try:
            seconds = float(token[1:])
        except ValueError:
            continue
        if not 0 < seconds <= planner.MAX_STEP_SECONDS:
            continue
        steps.append((CODE_TO_DIRECTION[token[0]], seconds))
    return steps[: planner.MAX_STEPS * 2]


def format_step(direction: str, seconds: float) -> str:
    """Format one route step, e.g. ("left", 1.2) -> "l1.2"."""
    return f"{DIRECTIONS[direction][0]}{seconds:.1f}"


def steps_to_string(steps: list[tuple[str, float]]) -> str:
    """Compact text form of a step list."""
    return ",".join(format_step(direction, seconds) for direction, seconds in steps)


def install_device_file(config_dir: str) -> str:
    """Copy the Tuya Local device file; return "missing", "updated" or "ok".

    Only fixed file names from this integration are written, only into the
    real (non-symlinked) Tuya Local devices folder inside the config directory.
    """
    source_dir = Path(__file__).parent / "tuya_local_devices"
    base = Path(config_dir).resolve()
    target_dir = base / "custom_components" / "tuya_local" / "devices"
    if not target_dir.is_dir() or target_dir.is_symlink():
        return "missing"
    if base not in target_dir.resolve().parents:
        return "missing"
    changed = False
    for file in source_dir.glob("*.yaml"):
        if not re.fullmatch(r"[a-z0-9_]+\.yaml", file.name):
            continue
        target = target_dir / file.name
        if target.is_symlink():
            continue
        content = file.read_bytes()
        if target.exists() and target.read_bytes() == content:
            continue
        fd, tmp_name = tempfile.mkstemp(dir=target_dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as tmp:
                tmp.write(content)
            os.replace(tmp_name, target)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        changed = True
    return "updated" if changed else "ok"


class Controller:
    """Holds all state and logic of one wrapped vacuum."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialise."""
        self.hass = hass
        self.entry = entry
        self.vacuum_id: str = entry.data[CONF_VACUUM]
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry.entry_id}"
        )
        self.data: dict[str, Any] = {}
        self._motion_lock = asyncio.Lock()
        self._job: asyncio.Task[None] | None = None
        self.current_room: str | None = None
        self.queue: list[str] = []
        self.phase: str = ""
        self.job_mode: str = "sweep_and_mop"
        self.last_run: dict[str, Any] | None = None

        self.signal_update = f"{DOMAIN}_update_{entry.entry_id}"
        self.signal_room_added = f"{DOMAIN}_room_added_{entry.entry_id}"
        self.signal_room_removed = f"{DOMAIN}_room_removed_{entry.entry_id}"

    # ------------------------------------------------------------------
    # storage
    # ------------------------------------------------------------------
    async def async_load(self) -> None:
        """Load stored data and fill in defaults."""
        stored = await self._store.async_load() or {}
        settings = {
            "step_seconds": DEFAULT_STEP_SECONDS,
            "min_battery": DEFAULT_MIN_BATTERY,
            "start_mode": "clean",
            "selected_room": None,
            "clean_mode": "sweep_and_mop",
        }
        settings.update(stored.get("settings", {}))
        calibration = {"speed_cm_s": 25.0, "turn_deg_s": 60.0, "calibrated": False}
        calibration.update(stored.get("calibration", {}))
        plan = None
        if stored.get("plan"):
            try:
                plan = planner.clean_plan(stored["plan"])
            except planner.PlanError:
                _LOGGER.warning("Gespeicherter Plan ist ungültig und wird ignoriert")
        image = None
        if stored.get("image"):
            try:
                image = planner.clean_image(stored["image"])
            except planner.PlanError:
                image = None
        rooms = {}
        for room_id, room in stored.get("rooms", {}).items():
            rooms[room_id] = {
                "name": room.get("name", room_id),
                "minutes": room.get("minutes", DEFAULT_ROOM_MINUTES),
                "route": room.get("route", ""),
                "idx": room.get("idx"),
                "color": room.get("color"),
                "target": room.get("target"),
                "use_recorded": bool(room.get("use_recorded", False)),
            }
        self.data = {
            "settings": settings,
            "calibration": calibration,
            "recording": stored.get("recording", ""),
            "new_room_name": stored.get("new_room_name", ""),
            "rooms": rooms,
            "plan": plan,
            "image": image,
        }
        for room_id in rooms:
            self._ensure_room_identity(room_id)

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1)

    @callback
    def _changed(self) -> None:
        self._save()
        async_dispatcher_send(self.hass, self.signal_update)

    async def async_unload(self) -> None:
        """Stop jobs and write data."""
        self._cancel_job()
        await self._store.async_save(self.data)

    # ------------------------------------------------------------------
    # device and entity lookup
    # ------------------------------------------------------------------
    @property
    def device_info(self) -> DeviceInfo:
        """Attach to the Tuya Local device so that all tiles share one page."""
        registry = er.async_get(self.hass)
        entity = registry.async_get(self.vacuum_id)
        if entity is not None and entity.device_id is not None:
            device = dr.async_get(self.hass).async_get(entity.device_id)
            if device is not None and device.identifiers:
                return DeviceInfo(identifiers=set(device.identifiers))
        return DeviceInfo(
            identifiers={(DOMAIN, self.entry.entry_id)},
            name=self.entry.title,
            manufacturer="Tikom",
            model="G8000",
        )

    def entity_map(self) -> dict[str, str]:
        """Entity ids of the Tuya Local tiles that belong to this robot."""
        registry = er.async_get(self.hass)
        vacuum = registry.async_get(self.vacuum_id)
        found: dict[str, str] = {}
        if vacuum is None or vacuum.device_id is None:
            return found
        for candidate in er.async_entries_for_device(registry, vacuum.device_id):
            if candidate.platform != vacuum.platform:
                continue
            unique_id = candidate.unique_id or ""
            for key, suffix in TUYA_ENTITY_KEYS.items():
                if unique_id.endswith(f"-{suffix}"):
                    found[key] = candidate.entity_id
            device_class = candidate.device_class or candidate.original_device_class
            if candidate.domain == "sensor" and device_class == "battery":
                found["battery"] = candidate.entity_id
        return found

    def battery_entity(self) -> str | None:
        """Battery sensor that belongs to the same device as the vacuum."""
        return self.entity_map().get("battery")

    # ------------------------------------------------------------------
    # settings
    # ------------------------------------------------------------------
    def get_setting(self, key: str) -> Any:
        """Return a setting."""
        return self.data["settings"][key]

    @callback
    def set_setting(self, key: str, value: Any) -> None:
        """Change a setting."""
        self.data["settings"][key] = value
        self._changed()

    @property
    def recording(self) -> str:
        """Current recorded route."""
        return self.data["recording"]

    @callback
    def set_recording(self, value: str) -> None:
        """Replace the recording."""
        self.data["recording"] = value[:MAX_ROUTE_LENGTH]
        self._changed()

    @property
    def new_room_name(self) -> str:
        """Name typed for the next new room."""
        return self.data["new_room_name"]

    @callback
    def set_new_room_name(self, value: str) -> None:
        """Remember the typed room name."""
        self.data["new_room_name"] = value
        self._changed()

    # ------------------------------------------------------------------
    # calibration
    # ------------------------------------------------------------------
    @property
    def calibration(self) -> dict[str, Any]:
        """Speed, turn rate and whether they were measured."""
        return self.data["calibration"]

    @callback
    def set_calibration(
        self, speed_cm_s: float | None = None, turn_deg_s: float | None = None
    ) -> None:
        """Store measured values."""
        cal = self.calibration
        if speed_cm_s is not None:
            cal["speed_cm_s"] = round(min(max(float(speed_cm_s), 5.0), 80.0), 2)
        if turn_deg_s is not None:
            cal["turn_deg_s"] = round(min(max(float(turn_deg_s), 10.0), 360.0), 2)
        cal["calibrated"] = True
        self._changed()

    @callback
    def feedback(self, kind: str) -> None:
        """Nudge the calibration after a run: too_short, too_long, over_turn, under_turn."""
        cal = self.calibration
        if kind == "too_short":
            cal["speed_cm_s"] = round(max(5.0, cal["speed_cm_s"] * (1 - FEEDBACK_STEP)), 2)
        elif kind == "too_long":
            cal["speed_cm_s"] = round(min(80.0, cal["speed_cm_s"] * (1 + FEEDBACK_STEP)), 2)
        elif kind == "over_turn":
            cal["turn_deg_s"] = round(min(360.0, cal["turn_deg_s"] * (1 + FEEDBACK_STEP)), 2)
        elif kind == "under_turn":
            cal["turn_deg_s"] = round(max(10.0, cal["turn_deg_s"] * (1 - FEEDBACK_STEP)), 2)
        else:
            raise HomeAssistantError("Unbekannte Rückmeldung")
        self._changed()

    # ------------------------------------------------------------------
    # plan and rooms
    # ------------------------------------------------------------------
    @property
    def plan(self) -> dict[str, Any] | None:
        """The floor plan, if any."""
        return self.data["plan"]

    @property
    def image(self) -> dict[str, Any] | None:
        """Background image of the plan."""
        return self.data["image"]

    @callback
    def save_plan(
        self,
        plan_raw: Any,
        image_raw: Any = None,
        set_image: bool = False,
    ) -> None:
        """Validate and store the plan (and optionally the background image)."""
        try:
            plan = planner.clean_plan(plan_raw)
            image = planner.clean_image(image_raw) if set_image else self.image
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        used = {ch for row in plan["rows"] for ch in row}
        known = {planner.ROOM_CHARS[r["idx"]] for r in self.rooms.values() if r.get("idx")}
        if used - known - {"0"}:
            raise HomeAssistantError("Der Plan enthält Räume, die es nicht gibt.")
        self.data["plan"] = plan
        self.data["image"] = image
        self._changed()

    def _free_index(self) -> int:
        used = {room.get("idx") for room in self.rooms.values()}
        for index in range(1, len(planner.ROOM_CHARS)):
            if index not in used:
                return index
        raise HomeAssistantError(f"Es sind höchstens {planner.MAX_ROOMS} Räume möglich.")

    def _ensure_room_identity(self, room_id: str) -> None:
        room = self.rooms[room_id]
        if not room.get("idx"):
            room["idx"] = self._free_index()
        if not room.get("color") or not COLOR_RE.match(room["color"]):
            room["color"] = ROOM_COLORS[(room["idx"] - 1) % len(ROOM_COLORS)]

    @property
    def rooms(self) -> dict[str, dict[str, Any]]:
        """All rooms: id -> {name, minutes, route, idx, color, target, use_recorded}."""
        return self.data["rooms"]

    @callback
    def add_room(self, name: str, route: str = "", minutes: float | None = None) -> str:
        """Create a room, or return the existing one with the same name."""
        name = name.strip()[:40]
        room_id = slugify(name)
        if not room_id:
            raise HomeAssistantError("Der Raumname ist leer.")
        if room_id in self.rooms:
            return room_id
        self.rooms[room_id] = {
            "name": name,
            "minutes": minutes if minutes is not None else DEFAULT_ROOM_MINUTES,
            "route": route,
            "idx": None,
            "color": None,
            "target": None,
            "use_recorded": bool(route),
        }
        self._ensure_room_identity(room_id)
        self._changed()
        async_dispatcher_send(self.hass, self.signal_room_added, room_id)
        return room_id

    @callback
    def save_room(self, name: str, route: str, minutes: float | None = None) -> str:
        """Create a room from a recording, or overwrite the route of an existing room."""
        if not parse_route(route):
            raise HomeAssistantError("Die Aufnahme ist leer. Erst eine Route fahren.")
        room_id = slugify(name.strip())
        if room_id in self.rooms:
            self.rooms[room_id]["route"] = route
            self.rooms[room_id]["use_recorded"] = True
            self._changed()
            return room_id
        return self.add_room(name, route, minutes)

    @callback
    def update_room(self, room_id: str, **fields: Any) -> None:
        """Change name, color, minutes, target or route source of a room."""
        room = self.rooms.get(room_id)
        if room is None:
            raise HomeAssistantError("Raum nicht gefunden.")
        if "name" in fields:
            name = str(fields["name"]).strip()[:40]
            if not name:
                raise HomeAssistantError("Der Raumname ist leer.")
            room["name"] = name  # the id stays, only the label changes
        if "color" in fields:
            if not COLOR_RE.match(str(fields["color"])):
                raise HomeAssistantError("Farbe ungültig.")
            room["color"] = fields["color"]
        if "minutes" in fields:
            room["minutes"] = min(max(float(fields["minutes"]), 1.0), 90.0)
        if "use_recorded" in fields:
            room["use_recorded"] = bool(fields["use_recorded"])
        if "target" in fields:
            target = fields["target"]
            if target is not None:
                plan = self.plan
                if plan is None:
                    raise HomeAssistantError("Es gibt noch keinen Plan.")
                x, y = int(target[0]), int(target[1])
                if not (0 <= x < plan["w"] and 0 <= y < plan["h"]):
                    raise HomeAssistantError("Ziel liegt außerhalb des Plans.")
                target = [x, y]
            room["target"] = target
        self._changed()

    @callback
    def set_room_value(self, room_id: str, key: str, value: Any) -> None:
        """Change minutes or route of a room (used by the entities)."""
        if room_id not in self.rooms:
            return
        if key == "minutes":
            self.update_room(room_id, minutes=value)
        elif key == "route":
            self.rooms[room_id]["route"] = str(value)[:MAX_ROUTE_LENGTH]
            self._changed()

    @callback
    def delete_room(self, room_id: str) -> None:
        """Delete a room, its painted cells and its entities."""
        room = self.rooms.get(room_id)
        if room is None:
            return
        plan = self.plan
        if plan is not None and room.get("idx"):
            char = planner.ROOM_CHARS[room["idx"]]
            plan["rows"] = [row.replace(char, "0") for row in plan["rows"]]
        del self.rooms[room_id]
        if self.get_setting("selected_room") == room_id:
            self.data["settings"]["selected_room"] = None
        self._changed()
        async_dispatcher_send(self.hass, self.signal_room_removed, room_id)

    # ------------------------------------------------------------------
    # routes
    # ------------------------------------------------------------------
    def route_for_room(self, room_id: str, mode: str) -> dict[str, Any]:
        """Steps to drive from the dock to a room.

        Uses the recorded route when the room is set to it (or has no plan),
        otherwise the route computed from the floor plan.
        """
        room = self.rooms.get(room_id)
        if room is None:
            raise HomeAssistantError("Raum nicht gefunden.")
        recorded = parse_route(room.get("route"))
        plan = self.plan
        planned_possible = bool(plan and plan.get("dock") and room.get("idx"))
        if recorded and (room.get("use_recorded") or not planned_possible):
            return {"source": "recorded", "steps": recorded, "path": None}
        if not planned_possible:
            raise HomeAssistantError(
                "Für diesen Raum gibt es weder eine Aufnahme noch einen Plan mit Station."
            )
        cal = self.calibration
        if not cal.get("calibrated"):
            raise HomeAssistantError(
                "Erst kalibrieren (Geschwindigkeit und Drehrate messen), "
                "damit die Route aus dem Plan stimmt."
            )
        assert plan is not None
        target = room.get("target")
        try:
            found = planner.plan_path(
                plan,
                room["idx"],
                tuple(target) if target else None,
                block_carpet=mode in ("mop", "sweep_and_mop"),
            )
            steps = planner.steps_from_path(
                plan, found["path"], cal["speed_cm_s"], cal["turn_deg_s"]
            )
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        return {"source": "plan", "steps": steps, "path": found["path"]}

    def preview(self, room_id: str, mode: str) -> dict[str, Any]:
        """Route plus the polyline the robot is expected to drive (for the map)."""
        route = self.route_for_room(room_id, mode)
        line = None
        if self.plan and self.plan.get("dock"):
            cal = self.calibration
            line = planner.simulate(
                self.plan, route["steps"], cal["speed_cm_s"], cal["turn_deg_s"]
            )
        return {
            "source": route["source"],
            "steps": route["steps"],
            "route": steps_to_string(route["steps"]),
            "seconds": round(sum(seconds for _, seconds in route["steps"]), 1),
            "line": [[round(x, 2), round(y, 2)] for x, y in line] if line else None,
        }

    def recording_line(self) -> list[list[float]] | None:
        """Expected path of the current recording on the plan."""
        steps = parse_route(self.recording)
        if not steps or not (self.plan and self.plan.get("dock")):
            return None
        cal = self.calibration
        line = planner.simulate(self.plan, steps, cal["speed_cm_s"], cal["turn_deg_s"])
        return [[round(x, 2), round(y, 2)] for x, y in line]

    # ------------------------------------------------------------------
    # snapshot for the panel
    # ------------------------------------------------------------------
    def snapshot(self) -> dict[str, Any]:
        """Everything the panel needs, without the (large) background image."""
        rooms = {}
        for room_id, room in self.rooms.items():
            rooms[room_id] = {
                **room,
                "has_route": bool(parse_route(room.get("route"))),
            }
        return {
            "entry_id": self.entry.entry_id,
            "title": self.entry.title,
            "vacuum": self.vacuum_id,
            "entities": self.entity_map(),
            "settings": self.data["settings"],
            "calibration": self.calibration,
            "recording": self.recording,
            "recording_line": self.recording_line(),
            "plan": self.plan,
            "has_image": self.image is not None,
            "image_meta": (
                {k: v for k, v in self.image.items() if k != "data"} if self.image else None
            ),
            "rooms": rooms,
            "job": {
                "running": self.job_running,
                "room": self.current_room,
                "queue": self.queue,
                "phase": self.phase,
                "mode": self.job_mode,
            },
            "last_run": self.last_run,
        }

    # ------------------------------------------------------------------
    # talking to the vacuum
    # ------------------------------------------------------------------
    def vacuum_state(self) -> str | None:
        """State of the real vacuum."""
        state = self.hass.states.get(self.vacuum_id)
        return state.state if state else None

    async def _send(self, service: str, **data: Any) -> None:
        await self.hass.services.async_call(
            "vacuum",
            service,
            {"entity_id": self.vacuum_id, **data},
            blocking=True,
        )

    async def _wait_for(self, predicate: Callable[[], bool], timeout: float) -> bool:
        """Wait until predicate is true; False on timeout."""
        if predicate():
            return True
        future: asyncio.Future[bool] = self.hass.loop.create_future()

        @callback
        def _on_change(event: Event[Any]) -> None:
            if not future.done() and predicate():
                future.set_result(True)

        entity_ids = [self.vacuum_id]
        battery = self.battery_entity()
        if battery:
            entity_ids.append(battery)
        unsubscribe = async_track_state_change_event(self.hass, entity_ids, _on_change)
        try:
            await asyncio.wait_for(future, timeout)
            return True
        except TimeoutError:
            return False
        finally:
            unsubscribe()

    def _notify(self, title: str, message: str) -> None:
        persistent_notification.async_create(
            self.hass, message, title, notification_id=f"{DOMAIN}_{slugify(title)}"
        )

    def _set_phase(self, phase: str) -> None:
        self.phase = phase
        async_dispatcher_send(self.hass, self.signal_update)

    async def _apply_clean_mode(self, mode: str) -> None:
        """Set sweep / mop / both on the robot (Tuya Local select)."""
        entity_id = self.entity_map().get("mode")
        if entity_id is None or mode not in CLEAN_MODES:
            return
        await self.hass.services.async_call(
            "select",
            "select_option",
            {"entity_id": entity_id, "option": mode},
            blocking=True,
        )

    # ------------------------------------------------------------------
    # driving
    # ------------------------------------------------------------------
    async def async_drive(
        self, direction: str, seconds: float | None = None, record: bool = True
    ) -> None:
        """Drive one step and optionally append it to the recording."""
        if direction not in DIRECTIONS:
            raise HomeAssistantError(f"Unbekannte Richtung {direction}")
        duration = float(seconds if seconds is not None else self.get_setting("step_seconds"))
        if not 0 < duration <= planner.MAX_STEP_SECONDS:
            raise HomeAssistantError("Fahrzeit muss zwischen 0 und 30 Sekunden liegen.")
        if self.vacuum_state() == "cleaning" and not self.job_running:
            raise HomeAssistantError("Der Roboter saugt gerade. Erst anhalten.")
        step = format_step(direction, duration)
        new = ""
        if record:
            new = f"{self.recording},{step}" if self.recording else step
            if len(new) > MAX_ROUTE_LENGTH:
                raise HomeAssistantError(
                    "Die Aufnahme passt nicht mehr in 255 Zeichen. "
                    "Speichere sie als Raum oder fahre größere Schritte."
                )
        async with self._motion_lock:
            try:
                await self._send("send_command", command=direction)
                await asyncio.sleep(duration)
            finally:
                await self._send("send_command", command="stop")
        if record:
            self.set_recording(new)

    async def async_run_steps(self, steps: list[tuple[str, float]]) -> None:
        """Drive a list of steps (safety limits are applied again here)."""
        try:
            steps = planner.limit_steps(steps)
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        for direction, seconds in steps:
            await self.async_drive(direction, seconds, record=False)
            await asyncio.sleep(0.7)

    async def async_test_recording(self) -> None:
        """Drive the current recording."""
        steps = parse_route(self.recording)
        if not steps:
            raise HomeAssistantError("Die Aufnahme ist leer.")
        await self.async_run_steps(steps)

    @callback
    def clear_recording(self) -> None:
        """Empty the recording."""
        self.set_recording("")

    # ------------------------------------------------------------------
    # room jobs
    # ------------------------------------------------------------------
    @property
    def job_running(self) -> bool:
        """Whether a room job is running."""
        return self._job is not None and not self._job.done()

    @callback
    def start_rooms(self, room_ids: list[str], mode: str | None = None) -> None:
        """Clean rooms one after the other in the background."""
        if self.job_running:
            raise HomeAssistantError(
                "Es läuft bereits ein Raumauftrag. Erst abbrechen oder abwarten."
            )
        rooms = [room for room in room_ids if room in self.rooms]
        if not rooms:
            raise HomeAssistantError("Kein gültiger Raum ausgewählt.")
        mode = mode or self.get_setting("clean_mode")
        if mode not in CLEAN_MODES:
            raise HomeAssistantError("Unbekannter Modus.")
        # fail early, before anything moves: every route must be computable
        for room_id in rooms:
            self.route_for_room(room_id, mode)
        self.job_mode = mode
        self.queue = list(rooms)
        self._job = self.hass.async_create_background_task(
            self._run_rooms(rooms, mode, dry=False), name=f"{DOMAIN} room job"
        )

    @callback
    def start_dry_run(self, room_id: str) -> None:
        """Drive the route of one room without cleaning (to check the plan)."""
        if self.job_running:
            raise HomeAssistantError("Es läuft bereits ein Auftrag.")
        if room_id not in self.rooms:
            raise HomeAssistantError("Raum nicht gefunden.")
        mode = self.get_setting("clean_mode")
        self.route_for_room(room_id, mode)
        self.job_mode = mode
        self.queue = [room_id]
        self._job = self.hass.async_create_background_task(
            self._run_rooms([room_id], mode, dry=True), name=f"{DOMAIN} dry run"
        )

    async def _run_rooms(self, rooms: list[str], mode: str, dry: bool) -> None:
        try:
            for room_id in rooms:
                self.current_room = room_id
                self._set_phase("Starte")
                await self._clean_room(room_id, mode, dry)
                self.queue = [r for r in self.queue if r != room_id]
        except asyncio.CancelledError:
            raise
        except HomeAssistantError as err:
            _LOGGER.warning("Raumauftrag beendet: %s", err)
            self.last_run = {
                "room": self.current_room,
                "ok": False,
                "error": str(err),
                "ts": time.time(),
            }
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Raumauftrag fehlgeschlagen")
        finally:
            self.current_room = None
            self.queue = []
            self.phase = ""
            async_dispatcher_send(self.hass, self.signal_update)

    async def _clean_room(self, room_id: str, mode: str, dry: bool) -> None:
        room = self.rooms[room_id]
        name = room["name"]
        title = f"Tikom: {name}"

        if self.vacuum_state() != "docked":
            self._notify(
                title,
                "Der Roboter muss auf der Ladestation stehen (Status docked), "
                f'ist aber "{self.vacuum_state()}".',
            )
            raise HomeAssistantError("Roboter nicht auf der Station")
        route = self.route_for_room(room_id, mode)

        battery = self.battery_entity()
        minimum = float(self.get_setting("min_battery"))
        if battery:

            def battery_ok() -> bool:
                state = self.hass.states.get(battery)
                try:
                    return state is not None and float(state.state) >= minimum
                except ValueError:
                    return True  # unavailable/unknown: do not wait forever

            if not battery_ok():
                self._set_phase("Warte auf Akku")
            if not await self._wait_for(battery_ok, BATTERY_WAIT):
                self._notify(title, f"Der Akku hat {minimum:.0f} % nicht erreicht.")
                raise HomeAssistantError("Akku zu niedrig")

        self._set_phase("Fahre zum Raum")
        await self.async_run_steps(route["steps"])

        if dry:
            self.last_run = {"room": room_id, "ok": True, "dry": True, "ts": time.time()}
            self._notify(
                title,
                "Testfahrt beendet. Prüfe, wo der Roboter steht, gib im Panel "
                "eine Rückmeldung und schicke ihn dann zur Station.",
            )
            return

        await self._apply_clean_mode(mode)
        self._set_phase("Reinige")
        await self._send("send_command", command=self.get_setting("start_mode"))
        await asyncio.sleep(START_CHECK_DELAY)
        if self.vacuum_state() != "cleaning":
            await self._send("return_to_base")
            self._notify(
                title,
                f'Der Roboter saugt nicht. Status nach dem Start: "{self.vacuum_state()}".',
            )
            raise HomeAssistantError("Start fehlgeschlagen")

        minutes = float(room["minutes"])
        await self._wait_for(lambda: self.vacuum_state() != "cleaning", minutes * 60)
        self._set_phase("Zurück zur Station")
        if self.vacuum_state() == "cleaning":
            await self._send("return_to_base")
        if not await self._wait_for(lambda: self.vacuum_state() == "docked", DOCK_WAIT):
            self._notify(
                title,
                f"Nicht zurück an der Station (Status {self.vacuum_state()}).",
            )
            raise HomeAssistantError("Nicht angedockt")
        self.last_run = {"room": room_id, "ok": True, "dry": False, "ts": time.time()}

    def _cancel_job(self) -> None:
        if self.job_running and self._job is not None:
            self._job.cancel()
        self._job = None
        self.current_room = None
        self.queue = []
        self.phase = ""

    async def async_abort(self) -> None:
        """Cancel everything and send the robot home."""
        self._cancel_job()
        async_dispatcher_send(self.hass, self.signal_update)
        await self._send("send_command", command="stop")
        await self._send("return_to_base")
