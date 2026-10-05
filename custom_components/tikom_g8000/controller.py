"""Logic: plan, rooms, calibration, driving and room cleaning."""

from __future__ import annotations

import asyncio
import copy
import logging
import math
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

from . import floorplan, planner
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
    LEAVE_DOCK_WAIT,
    MAX_ROUTE_LENGTH,
    ROOM_COLORS,
    START_CHECK_DELAY,
    STORAGE_VERSION,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
CLEAN_MODES = ("sweep", "mop", "sweep_and_mop")
REJECTED_KEEP = 5
TRACE_MAX = 60
REPEAT_INTERVAL = 1.0  # seconds between repeated direction commands
START_MODE_KEYS = ("clean", "wall_follow", "random")
BOOL_SETTINGS = ("verify_leave_dock", "carpet_sweep_only", "repeat_drive")
EXPORT_FORMAT = "tikom_g8000_export"
EXPORT_VERSION = 1
# settings that travel with an export (selected_room is only a UI memory)
EXPORT_SETTINGS = (
    "clean_mode",
    "start_mode",
    "min_battery",
    "step_seconds",
    "robot_floor",
    "verify_leave_dock",
    "carpet_sweep_only",
    "repeat_drive",
)
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


def clean_setting(key: str, value: Any) -> Any:
    """Validate one setting value; raise HomeAssistantError when it is not allowed."""
    if key == "clean_mode":
        if value not in CLEAN_MODES:
            raise HomeAssistantError("Unbekannter Modus.")
        return value
    if key == "start_mode":
        if value not in START_MODE_KEYS:
            raise HomeAssistantError("Unbekannter Modus.")
        return value
    if key in BOOL_SETTINGS:
        if not isinstance(value, bool):
            raise HomeAssistantError("Ungültiger Wert (an oder aus).")
        return value
    if key in ("min_battery", "step_seconds"):
        if isinstance(value, bool):
            raise HomeAssistantError("Ungültiger Zahlenwert.")
        try:
            number = float(value)
        except (TypeError, ValueError) as err:
            raise HomeAssistantError("Ungültiger Zahlenwert.") from err
        if not math.isfinite(number):
            raise HomeAssistantError("Ungültiger Zahlenwert.")
        if key == "min_battery":
            return min(max(number, 20.0), 100.0)
        return min(max(number, 0.5), 30.0)
    raise HomeAssistantError("Unbekannte Einstellung.")


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
        self._trace: list[str] = []
        self._trace_t0 = time.monotonic()

        self.signal_update = f"{DOMAIN}_update_{entry.entry_id}"
        self.signal_room_added = f"{DOMAIN}_room_added_{entry.entry_id}"
        self.signal_room_removed = f"{DOMAIN}_room_removed_{entry.entry_id}"

    # ------------------------------------------------------------------
    # storage
    # ------------------------------------------------------------------
    async def async_load(self) -> None:
        """Load stored data and fill in defaults."""
        stored = await self._store.async_load() or {}
        await self._backup_before_update(stored)
        settings = {
            "step_seconds": DEFAULT_STEP_SECONDS,
            "min_battery": DEFAULT_MIN_BATTERY,
            "start_mode": "clean",
            "selected_room": None,
            "clean_mode": "sweep_and_mop",
            "verify_leave_dock": True,
            "carpet_sweep_only": False,
            "repeat_drive": False,
        }
        settings.update(stored.get("settings", {}))
        calibration = {"speed_cm_s": 25.0, "turn_deg_s": 60.0, "calibrated": False}
        calibration.update(stored.get("calibration", {}))
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
        floors: list[dict[str, Any]] = []
        # Floors that cannot be read are never thrown away: the raw data is kept
        # in the store (and in the backup), so a bug can be fixed later.
        rejected: list[dict[str, Any]] = list(stored.get("rejected_floors", []))[-REJECTED_KEEP:]
        for raw in stored.get("floors", []):
            try:
                floor = floorplan.clean_floor(raw)
                floor["image"] = planner.clean_image(raw.get("image"))
            except planner.PlanError as err:
                _LOGGER.warning("Ein gespeichertes Stockwerk kann nicht gelesen werden: %s", err)
                rejected = (rejected + [{"error": str(err), "floor": raw}])[-REJECTED_KEEP:]
                self._notify(
                    "Tikom: Stockwerk nicht lesbar",
                    f"Ein gespeichertes Stockwerk konnte nicht gelesen werden ({err}). "
                    "Die Daten sind nicht gelöscht, sondern in der Speicherdatei und in "
                    "der Sicherung aufgehoben.",
                )
                continue
            floors.append(floor)
        if not floors and stored.get("plan"):
            floors = self._migrate_old_plan(stored, rooms)
        for room in rooms.values():
            target = room.get("target")
            if not (
                isinstance(target, list)
                and len(target) == 2
                and all(isinstance(v, (int, float)) for v in target)
            ):
                room["target"] = None
        settings.setdefault("robot_floor", floors[0]["id"] if floors else None)
        if settings.get("robot_floor") not in {f["id"] for f in floors}:
            settings["robot_floor"] = floors[0]["id"] if floors else None
        self.data = {
            "settings": settings,
            "calibration": calibration,
            "recording": stored.get("recording", ""),
            "new_room_name": stored.get("new_room_name", ""),
            "rooms": rooms,
            "floors": floors,
            "app_version": VERSION,
            "rejected_floors": rejected,
        }
        self._compiled: dict[str, dict[str, Any]] = {}
        for room_id in rooms:
            self._ensure_room_identity(room_id)

    async def _backup_before_update(self, stored: dict[str, Any]) -> None:
        """Keep a copy of the stored data from before this version took over.

        Written once per previous version and never overwritten, so an update
        cannot destroy the plan: the copy stays in the .storage folder next to
        the normal data file.
        """
        if not (stored.get("floors") or stored.get("rooms") or stored.get("plan")):
            return
        old = stored.get("app_version")
        if old == VERSION:
            return
        label = re.sub(r"[^0-9A-Za-z]+", "_", str(old)) if old else "vor_2_2"
        backup = Store(self.hass, STORAGE_VERSION, f"{DOMAIN}.{self.entry.entry_id}.backup_{label}")
        try:
            if await backup.async_load() is None:
                await backup.async_save(copy.deepcopy(stored))
                _LOGGER.info("Sicherung der bisherigen Daten angelegt (Version %s)", old or "älter")
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Die Sicherung der bisherigen Daten ist fehlgeschlagen", exc_info=True)

    async def _write_backup(self, label: str, data: dict[str, Any]) -> None:
        """Overwrite the named safety copy (used before an import replaces everything)."""
        backup = Store(self.hass, STORAGE_VERSION, f"{DOMAIN}.{self.entry.entry_id}.backup_{label}")
        try:
            await backup.async_save(data)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Die Sicherung ist fehlgeschlagen", exc_info=True)

    def _migrate_old_plan(
        self, stored: dict[str, Any], rooms: dict[str, dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Version 2.0 stored one grid plan; turn it into a floor made of shapes."""
        try:
            old = planner.clean_plan(stored["plan"])
        except planner.PlanError:
            _LOGGER.warning("Der alte Plan ist ungültig und wird ignoriert")
            return []
        for room_id, room in rooms.items():
            if not room.get("idx"):
                room["idx"] = None
        by_index = {room["idx"]: room_id for room_id, room in rooms.items() if room.get("idx")}
        floor = floorplan.grid_plan_to_floor(old, by_index)
        try:
            floor = floorplan.clean_floor(floor, set(rooms))
        except planner.PlanError:
            _LOGGER.warning("Der alte Plan konnte nicht übernommen werden")
            return []
        try:
            floor["image"] = planner.clean_image(stored.get("image"))
        except planner.PlanError:
            floor["image"] = None
        if floor["image"]:  # old images were placed in metres
            floor["image"]["x_m"] = floor["image"]["x_m"]
        for room in rooms.values():
            target = room.get("target")
            if isinstance(target, list) and len(target) == 2:
                room["target"] = [target[0] * 10 + 5, target[1] * 10 + 5]
        return [floor]

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
    def floors(self) -> list[dict[str, Any]]:
        """All floors (shapes, station, optional background image)."""
        return self.data["floors"]

    def floor(self, floor_id: str | None) -> dict[str, Any] | None:
        """One floor by id."""
        for floor in self.floors:
            if floor["id"] == floor_id:
                return floor
        return None

    def robot_floor(self) -> dict[str, Any] | None:
        """The floor the robot's station is on right now."""
        return self.floor(self.get_setting("robot_floor")) or (
            self.floors[0] if self.floors else None
        )

    def room_floor(self, room_id: str) -> dict[str, Any] | None:
        """The floor on which a room is drawn."""
        for floor in self.floors:
            for shape in floor["shapes"]:
                if shape["kind"] == "room" and shape.get("room") == room_id:
                    return floor
        return None

    def compiled(self, floor_id: str | None) -> dict[str, Any] | None:
        """Grid version of a floor for the planner (cached)."""
        floor = self.floor(floor_id)
        if floor is None:
            return None
        if floor_id not in self._compiled:
            index = {rid: r["idx"] for rid, r in self.rooms.items() if r.get("idx")}
            try:
                self._compiled[floor_id] = floorplan.compile_floor(floor, index)
            except planner.PlanError as err:
                raise HomeAssistantError(str(err)) from err
        return self._compiled[floor_id]

    def image_of(self, floor_id: str) -> dict[str, Any] | None:
        """Background image of a floor (large)."""
        floor = self.floor(floor_id)
        return floor.get("image") if floor else None

    @callback
    def save_floor(
        self, floor_raw: Any, image_raw: Any = None, set_image: bool = False
    ) -> str:
        """Validate and store one floor (new or replacing the one with the same id)."""
        try:
            floor = floorplan.clean_floor(floor_raw, set(self.rooms))
            old = self.floor(floor["id"])
            if set_image:
                floor["image"] = planner.clean_image(image_raw)
            else:
                floor["image"] = old.get("image") if old else None
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        if old is None:
            if len(self.floors) >= floorplan.MAX_FLOORS:
                raise HomeAssistantError(f"Höchstens {floorplan.MAX_FLOORS} Stockwerke.")
            self.floors.append(floor)
        else:
            self.floors[self.floors.index(old)] = floor
        self._compiled.pop(floor["id"], None)
        if not self.get_setting("robot_floor"):
            self.data["settings"]["robot_floor"] = floor["id"]
        self._changed()
        return floor["id"]

    @callback
    def add_floor(self, name: str) -> str:
        """Create an empty floor."""
        name = name.strip()[:30]
        if not name:
            raise HomeAssistantError("Der Name des Stockwerks ist leer.")
        used = {floor["id"] for floor in self.floors}
        number = 1
        while f"f{number}" in used:
            number += 1
        return self.save_floor(
            {"id": f"f{number}", "name": name, "walls": True, "open": [], "shapes": [], "dock": None}
        )

    @callback
    def delete_floor(self, floor_id: str) -> None:
        """Delete a floor together with the rooms that are drawn on it."""
        floor = self.floor(floor_id)
        if floor is None:
            return
        if len(self.floors) <= 1:
            raise HomeAssistantError("Das letzte Stockwerk kann nicht gelöscht werden.")
        doomed = {s["room"] for s in floor["shapes"] if s["kind"] == "room"}
        self.floors.remove(floor)
        self._compiled.pop(floor_id, None)
        if self.get_setting("robot_floor") == floor_id:
            self.data["settings"]["robot_floor"] = self.floors[0]["id"]
        for room_id in doomed:
            if self.room_floor(room_id) is None:
                self.delete_room(room_id)
        self._changed()

    @callback
    def set_robot_floor(self, floor_id: str) -> None:
        """Tell the controller which floor the robot stands on."""
        if self.floor(floor_id) is None:
            raise HomeAssistantError("Stockwerk nicht gefunden.")
        self.data["settings"]["robot_floor"] = floor_id
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
                x, y = int(target[0]), int(target[1])
                if not all(floorplan.COORD_MIN <= v <= floorplan.COORD_MAX for v in (x, y)):
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
        for floor in self.floors:
            kept = [
                shape
                for shape in floor["shapes"]
                if not (shape["kind"] == "room" and shape.get("room") == room_id)
            ]
            if len(kept) != len(floor["shapes"]):
                floor["shapes"] = kept
                self._compiled.pop(floor["id"], None)
            if any(room_id in pair for pair in floor.get("open", [])):
                floor["open"] = [p for p in floor["open"] if room_id not in p]
                self._compiled.pop(floor["id"], None)
        del self.rooms[room_id]
        if self.get_setting("selected_room") == room_id:
            self.data["settings"]["selected_room"] = None
        self._changed()
        async_dispatcher_send(self.hass, self.signal_room_removed, room_id)

    # ------------------------------------------------------------------
    # carpets
    # ------------------------------------------------------------------
    def room_has_carpet(self, room_id: str) -> bool:
        """Whether a carpet is drawn inside the room."""
        room = self.rooms.get(room_id)
        floor = self.room_floor(room_id)
        if room is None or floor is None or not room.get("idx"):
            return False
        try:
            plan = self.compiled(floor["id"])
        except HomeAssistantError:
            return False
        return plan is not None and room["idx"] in planner.carpet_rooms(plan)

    def effective_mode(self, room_id: str, mode: str) -> str:
        """The mode that really runs: rooms with a carpet can be sweep-only."""
        if (
            mode != "sweep"
            and self.get_setting("carpet_sweep_only")
            and self.room_has_carpet(room_id)
        ):
            return "sweep"
        return mode

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
        mode = self.effective_mode(room_id, mode)
        recorded = parse_route(room.get("route"))
        floor = self.room_floor(room_id)
        planned_possible = bool(floor and floor.get("dock") and room.get("idx"))
        if recorded and (room.get("use_recorded") or not planned_possible):
            return {"source": "recorded", "steps": recorded, "path": None, "floor": None}
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
        assert floor is not None
        plan = self.compiled(floor["id"])
        assert plan is not None
        target = room.get("target")
        cell_target = floorplan.cm_to_cell(plan, target[0], target[1]) if target else None
        try:
            found = planner.plan_path(
                plan,
                room["idx"],
                cell_target,
                block_carpet=mode in ("mop", "sweep_and_mop"),
            )
            steps = planner.steps_from_path(
                plan, found["path"], cal["speed_cm_s"], cal["turn_deg_s"]
            )
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        return {"source": "plan", "steps": steps, "path": found["path"], "floor": floor["id"]}

    def _line_cm(
        self, floor_id: str | None, steps: list[tuple[str, float]]
    ) -> list[list[float]] | None:
        """Expected path of a step list on a floor, in centimetres."""
        floor = self.floor(floor_id)
        if floor is None or not floor.get("dock"):
            return None
        try:
            plan = self.compiled(floor_id)
        except HomeAssistantError:
            return None
        if plan is None or not plan.get("dock"):
            return None
        cal = self.calibration
        points = planner.simulate(plan, steps, cal["speed_cm_s"], cal["turn_deg_s"])
        return [
            [round(v, 1) for v in floorplan.cell_to_cm(plan, x, y)] for x, y in points
        ]

    def preview(self, room_id: str, mode: str) -> dict[str, Any]:
        """Route plus the polyline the robot is expected to drive (for the map)."""
        route = self.route_for_room(room_id, mode)
        floor = self.room_floor(room_id)
        return {
            "mode": self.effective_mode(room_id, mode),
            "source": route["source"],
            "steps": route["steps"],
            "route": steps_to_string(route["steps"]),
            "seconds": round(sum(seconds for _, seconds in route["steps"]), 1),
            "floor": floor["id"] if floor else None,
            "line": self._line_cm(floor["id"] if floor else None, route["steps"]),
        }

    def recording_line(self) -> dict[str, Any] | None:
        """Expected path of the current recording on the floor of the robot."""
        steps = parse_route(self.recording)
        floor = self.robot_floor()
        if not steps or floor is None:
            return None
        line = self._line_cm(floor["id"], steps)
        return {"floor": floor["id"], "line": line} if line else None

    # ------------------------------------------------------------------
    # export and import
    # ------------------------------------------------------------------
    def export_data(self) -> dict[str, Any]:
        """Rooms, floors, calibration and settings, without the background images.

        The panel adds the images (one request per floor) before it saves the file.
        """
        rooms = {
            room_id: {
                key: room.get(key)
                for key in ("name", "minutes", "route", "idx", "color", "target", "use_recorded")
            }
            for room_id, room in self.rooms.items()
        }
        return {
            "format": EXPORT_FORMAT,
            "version": EXPORT_VERSION,
            "app_version": VERSION,
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "settings": {key: self.data["settings"].get(key) for key in EXPORT_SETTINGS},
            "calibration": dict(self.calibration),
            "recording": self.recording,
            "rooms": rooms,
            "floors": [
                {
                    "id": floor["id"],
                    "name": floor["name"],
                    "walls": floor["walls"],
                    "open": floor.get("open", []),
                    "shapes": floor["shapes"],
                    "dock": floor["dock"],
                    "has_image": bool(floor.get("image")),
                }
                for floor in self.floors
            ],
        }

    @staticmethod
    def _clean_import_rooms(raw: Any) -> dict[str, dict[str, Any]]:
        if not isinstance(raw, dict) or len(raw) > planner.MAX_ROOMS:
            raise HomeAssistantError(f"Die Datei hat keine gültigen Räume (höchstens {planner.MAX_ROOMS}).")
        rooms: dict[str, dict[str, Any]] = {}
        used: set[int] = set()
        for room_id, item in raw.items():
            if not isinstance(room_id, str) or not floorplan.ROOM_ID_RE.match(room_id):
                raise HomeAssistantError("Die Datei enthält einen ungültigen Raumnamen.")
            if not isinstance(item, dict):
                raise HomeAssistantError("Die Datei enthält einen ungültigen Raum.")
            name = str(item.get("name") or room_id).strip()[:40] or room_id
            try:
                minutes = min(max(float(item.get("minutes", DEFAULT_ROOM_MINUTES)), 1.0), 90.0)
            except (TypeError, ValueError) as err:
                raise HomeAssistantError(f'Ungültige Minuten bei Raum "{name}".') from err
            if not math.isfinite(minutes):
                raise HomeAssistantError(f'Ungültige Minuten bei Raum "{name}".')
            route = item.get("route") or ""
            if not isinstance(route, str):
                raise HomeAssistantError(f'Ungültige Aufnahme bei Raum "{name}".')
            idx = item.get("idx")
            if isinstance(idx, bool) or not isinstance(idx, int) or not 1 <= idx < len(planner.ROOM_CHARS) or idx in used:
                idx = None
            else:
                used.add(idx)
            color = item.get("color")
            if not isinstance(color, str) or not COLOR_RE.match(color):
                color = None
            target = item.get("target")
            if not (
                isinstance(target, list)
                and len(target) == 2
                and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in target)
                and all(floorplan.COORD_MIN <= v <= floorplan.COORD_MAX for v in target)
            ):
                target = None
            else:
                target = [round(target[0]), round(target[1])]
            rooms[room_id] = {
                "name": name,
                "minutes": minutes,
                "route": steps_to_string(parse_route(route)),
                "idx": idx,
                "color": color,
                "target": target,
                "use_recorded": bool(item.get("use_recorded", False)),
            }
        for room in rooms.values():  # rooms without a usable number get a free one
            if room["idx"] is None:
                room["idx"] = next(i for i in range(1, len(planner.ROOM_CHARS)) if i not in used)
                used.add(room["idx"])
            if room["color"] is None:
                room["color"] = ROOM_COLORS[(room["idx"] - 1) % len(ROOM_COLORS)]
        return rooms

    @callback
    def import_data(self, raw: Any) -> dict[str, Any]:
        """Replace rooms, floors, calibration and settings with an export.

        Background images are not part of this call (they are large); the panel
        sends them afterwards, one floor at a time, through the normal floor save.
        Nothing is changed unless the whole file is valid.
        """
        if self.job_running:
            raise HomeAssistantError("Es läuft gerade ein Raumauftrag. Erst abbrechen oder abwarten.")
        if not isinstance(raw, dict) or raw.get("format") != EXPORT_FORMAT:
            raise HomeAssistantError("Das ist keine Exportdatei von Tikom G8000.")
        if raw.get("version") != EXPORT_VERSION:
            raise HomeAssistantError("Diese Exportdatei hat ein unbekanntes Format (Version).")
        rooms = self._clean_import_rooms(raw.get("rooms"))
        floors_raw = raw.get("floors")
        if not isinstance(floors_raw, list) or not 1 <= len(floors_raw) <= floorplan.MAX_FLOORS:
            raise HomeAssistantError(f"Die Datei braucht 1 bis {floorplan.MAX_FLOORS} Stockwerke.")
        floors: list[dict[str, Any]] = []
        try:
            for item in floors_raw:
                floor = floorplan.clean_floor(item, set(rooms))
                floor["image"] = None
                floors.append(floor)
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        if len({floor["id"] for floor in floors}) != len(floors):
            raise HomeAssistantError("Die Datei enthält doppelte Stockwerke.")

        settings = dict(self.data["settings"])
        raw_settings = raw.get("settings", {})
        if not isinstance(raw_settings, dict):
            raise HomeAssistantError("Die Einstellungen in der Datei sind ungültig.")
        for key in EXPORT_SETTINGS:
            if key in raw_settings and key != "robot_floor":
                settings[key] = clean_setting(key, raw_settings[key])
        robot_floor = raw_settings.get("robot_floor")
        settings["robot_floor"] = (
            robot_floor if robot_floor in {floor["id"] for floor in floors} else floors[0]["id"]
        )
        settings["selected_room"] = None

        calibration = dict(self.calibration)
        raw_cal = raw.get("calibration")
        if isinstance(raw_cal, dict):
            for key, low, high in (("speed_cm_s", 5.0, 80.0), ("turn_deg_s", 10.0, 360.0)):
                value = raw_cal.get(key)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    calibration[key] = round(min(max(float(value), low), high), 2)
            calibration["calibrated"] = bool(raw_cal.get("calibrated", False))
        recording = raw.get("recording", "")
        recording = steps_to_string(parse_route(recording)) if isinstance(recording, str) else ""

        self.hass.async_create_background_task(
            self._write_backup("vor_import", copy.deepcopy(self.data)),
            name=f"{DOMAIN} backup",
        )
        old_rooms = set(self.rooms)
        self.data["rooms"] = rooms
        self.data["floors"] = floors
        self.data["settings"] = settings
        self.data["calibration"] = calibration
        self.data["recording"] = recording[:MAX_ROUTE_LENGTH]
        self._compiled = {}
        self.last_run = None
        self._changed()
        for room_id in old_rooms - set(rooms):
            async_dispatcher_send(self.hass, self.signal_room_removed, room_id)
        for room_id in set(rooms) - old_rooms:
            async_dispatcher_send(self.hass, self.signal_room_added, room_id)
        return {"floors": [floor["id"] for floor in floors], "rooms": len(rooms)}

    # ------------------------------------------------------------------
    # snapshot for the panel
    # ------------------------------------------------------------------
    def snapshot(self) -> dict[str, Any]:
        """Everything the panel needs, without the (large) background image."""
        rooms = {}
        for room_id, room in self.rooms.items():
            floor = self.room_floor(room_id)
            rooms[room_id] = {
                **room,
                "has_route": bool(parse_route(room.get("route"))),
                "floor": floor["id"] if floor else None,
                "has_carpet": self.room_has_carpet(room_id),
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
            "floors": [
                {
                    "id": floor["id"],
                    "name": floor["name"],
                    "walls": floor["walls"],
                    "open": floor.get("open", []),
                    "shapes": floor["shapes"],
                    "dock": floor["dock"],
                    "has_image": bool(floor.get("image")),
                    "image_meta": (
                        {k: v for k, v in floor["image"].items() if k != "data"}
                        if floor.get("image")
                        else None
                    ),
                }
                for floor in self.floors
            ],
            "robot_floor": (self.robot_floor() or {}).get("id"),
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

    def _robot_report(self) -> str:
        """What the vacuum reports right now, for the run log."""
        state = self.hass.states.get(self.vacuum_id)
        if state is None:
            return "nicht erreichbar"
        status = state.attributes.get("status")
        return f"{state.state} ({status})" if status else str(state.state)

    def _trace_add(self, text: str) -> None:
        """One line in the log of the current job (shown in the panel after a run)."""
        if len(self._trace) < TRACE_MAX:
            self._trace.append(f"{time.monotonic() - self._trace_t0:5.0f} s  {text}")

    def _trace_reset(self) -> None:
        self._trace = []
        self._trace_t0 = time.monotonic()

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
                if self.get_setting("repeat_drive"):
                    # hold the direction like a finger on the button of the app
                    remaining = duration
                    while remaining > 0:
                        chunk = min(REPEAT_INTERVAL, remaining)
                        await asyncio.sleep(chunk)
                        remaining -= chunk
                        if remaining > 0.05:
                            await self._send("send_command", command=direction)
                else:
                    await asyncio.sleep(duration)
            finally:
                await self._send("send_command", command="stop")
        if record:
            self.set_recording(new)

    async def async_run_steps(
        self,
        steps: list[tuple[str, float]],
        verify_leave: bool = False,
        report: bool = False,
    ) -> None:
        """Drive a list of steps (safety limits are applied again here).

        With verify_leave the robot has to report something other than "docked"
        shortly after the first forward or reverse step. If it still sits on the
        station, it did not move, and the run stops before anything else happens.
        With report the current step is shown as the phase of the job.
        """
        try:
            steps = planner.limit_steps(steps)
        except planner.PlanError as err:
            raise HomeAssistantError(str(err)) from err
        total = len(steps)
        checked = not verify_leave
        for number, (direction, seconds) in enumerate(steps, 1):
            if report:
                self._set_phase(f"Fahre zum Raum, Schritt {number} von {total}")
            self._trace_add(
                f"Schritt {number}/{total}: {DIRECTIONS[direction][1]} {seconds:.1f} s, "
                f"Roboter: {self._robot_report()}"
            )
            await self.async_drive(direction, seconds, record=False)
            if not checked and direction in ("forward", "reverse"):
                checked = True
                left = await self._wait_for(
                    lambda: self.vacuum_state() != "docked", LEAVE_DOCK_WAIT
                )
                self._trace_add(f"Nach dem ersten Fahrschritt, Roboter: {self._robot_report()}")
                if not left:
                    raise HomeAssistantError(
                        "Der Roboter hat die Station nicht verlassen: Er meldet auch "
                        f"{LEAVE_DOCK_WAIT} Sekunden nach dem ersten Fahrschritt noch "
                        "„An der Station“. Die Fahrbefehle wurden gesendet, aber er hat "
                        "sich nicht bewegt. Prüfe im Reiter Fahren, ob Vor oder Zurück "
                        "ihn von der Station wegbewegen. Unter Zubehör kannst du auch "
                        "„Fahrbefehl jede Sekunde wiederholen“ ausprobieren."
                    )
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

    def _require_floor(self, room_id: str, route: dict[str, Any]) -> None:
        """A planned route only works when the robot sits on the floor of the room."""
        floor_id = route.get("floor")
        robot = self.robot_floor()
        if floor_id and robot and robot["id"] != floor_id:
            target = self.floor(floor_id)
            raise HomeAssistantError(
                f'Der Roboter steht laut Plan im Stockwerk "{robot["name"]}", '
                f'"{self.rooms[room_id]["name"]}" liegt im Stockwerk "{target["name"]}". '
                f'Stelle ihn auf die Station dort und tippe auf "Roboter steht hier".'
            )

    @callback
    def start_rooms(
        self, room_ids: list[str], mode: str | None = None, skip_drive: bool = False
    ) -> None:
        """Clean rooms one after the other in the background.

        With skip_drive the robot is not driven anywhere: it stands in the room
        already (carried there by hand) and starts cleaning right where it is.
        """
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
        if skip_drive:
            if len(rooms) != 1:
                raise HomeAssistantError("Ohne Anfahrt geht nur ein Raum auf einmal.")
            if self.vacuum_state() == "cleaning":
                raise HomeAssistantError("Der Roboter saugt schon.")
        else:
            # fail early, before anything moves: every route must be computable
            for room_id in rooms:
                self._require_floor(room_id, self.route_for_room(room_id, mode))
        self.last_run = None
        self.job_mode = mode
        self.queue = list(rooms)
        self._job = self.hass.async_create_background_task(
            self._run_rooms(rooms, mode, dry=False, skip_drive=skip_drive),
            name=f"{DOMAIN} room job",
        )

    @callback
    def start_dry_run(self, room_id: str) -> None:
        """Drive the route of one room without cleaning (to check the plan)."""
        if self.job_running:
            raise HomeAssistantError("Es läuft bereits ein Auftrag.")
        if room_id not in self.rooms:
            raise HomeAssistantError("Raum nicht gefunden.")
        mode = self.get_setting("clean_mode")
        self._require_floor(room_id, self.route_for_room(room_id, mode))
        self.last_run = None
        self.job_mode = mode
        self.queue = [room_id]
        self._job = self.hass.async_create_background_task(
            self._run_rooms([room_id], mode, dry=True), name=f"{DOMAIN} dry run"
        )

    async def _run_rooms(
        self, rooms: list[str], mode: str, dry: bool, skip_drive: bool = False
    ) -> None:
        self._trace_reset()
        self._trace_add(f"Auftrag gestartet, Roboter: {self._robot_report()}")
        try:
            for room_id in rooms:
                self.current_room = room_id
                self._set_phase("Starte")
                await self._clean_room(room_id, mode, dry, skip_drive)
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
                "trace": list(self._trace),
            }
        except Exception as err:  # noqa: BLE001
            _LOGGER.exception("Raumauftrag fehlgeschlagen")
            self.last_run = {
                "room": self.current_room,
                "ok": False,
                "error": f"Unerwarteter Fehler: {err}",
                "ts": time.time(),
                "trace": list(self._trace),
            }
        finally:
            self.current_room = None
            self.queue = []
            self.phase = ""
            async_dispatcher_send(self.hass, self.signal_update)

    async def _clean_room(
        self, room_id: str, mode: str, dry: bool, skip_drive: bool = False
    ) -> None:
        room = self.rooms[room_id]
        name = room["name"]
        title = f"Tikom: {name}"
        mode = self.effective_mode(room_id, mode)
        self.job_mode = mode

        if skip_drive:
            await self._start_cleaning_here(room_id, room, mode, title)
            return

        if self.vacuum_state() != "docked":
            self._notify(
                title,
                "Der Roboter muss auf der Ladestation stehen (Status docked), "
                f'ist aber "{self.vacuum_state()}".',
            )
            raise HomeAssistantError(
                "Der Roboter muss auf der Station stehen "
                f'(Status "{self.vacuum_state()}" statt "docked").'
            )
        route = self.route_for_room(room_id, mode)
        self._require_floor(room_id, route)

        battery = self.battery_entity()
        minimum = float(self.get_setting("min_battery"))
        if battery and not dry:  # a test drive does not need a full battery

            def battery_ok() -> bool:
                state = self.hass.states.get(battery)
                try:
                    return state is not None and float(state.state) >= minimum
                except ValueError:
                    return True  # unavailable/unknown: do not wait forever

            if not battery_ok():
                self._set_phase(f"Warte auf Akku (mindestens {minimum:.0f} %)")
            if not await self._wait_for(battery_ok, BATTERY_WAIT):
                self._notify(title, f"Der Akku hat {minimum:.0f} % nicht erreicht.")
                raise HomeAssistantError("Der Akku hat die Mindestladung nicht erreicht.")

        steps = route["steps"]
        self._set_phase(
            f"Fahre zum Raum ({len(steps)} Schritte, "
            f"ca. {sum(seconds for _, seconds in steps):.0f} Sekunden)"
        )
        try:
            await self.async_run_steps(
                steps,
                verify_leave=bool(self.get_setting("verify_leave_dock")),
                report=True,
            )
        except HomeAssistantError as err:
            self._notify(title, str(err))
            raise

        if dry:
            self.last_run = {
                "room": room_id,
                "ok": True,
                "dry": True,
                "ts": time.time(),
                "steps": len(steps),
                "trace": list(self._trace),
            }
            self._notify(
                title,
                "Testfahrt beendet. Prüfe, wo der Roboter steht, gib im Panel "
                "eine Rückmeldung und schicke ihn dann zur Station.",
            )
            return

        await self._start_cleaning_here(room_id, room, mode, title, len(steps))

    async def _start_cleaning_here(
        self, room_id: str, room: dict[str, Any], mode: str, title: str, steps: int = 0
    ) -> None:
        """Start cleaning where the robot stands, wait for the end, send it home."""
        await self._apply_clean_mode(mode)
        self._set_phase("Reinige")
        self._trace_add(f"Starte Reinigung, Roboter: {self._robot_report()}")
        await self._send("send_command", command=self.get_setting("start_mode"))
        await asyncio.sleep(START_CHECK_DELAY)
        self._trace_add(f"{START_CHECK_DELAY} s nach dem Start, Roboter: {self._robot_report()}")
        if self.vacuum_state() != "cleaning":
            await self._send("return_to_base")
            self._notify(
                title,
                f'Der Roboter saugt nicht. Status nach dem Start: "{self.vacuum_state()}".',
            )
            raise HomeAssistantError(
                f'Der Roboter hat die Reinigung nicht gestartet (Status "{self.vacuum_state()}").'
            )

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
            raise HomeAssistantError(
                f'Der Roboter ist nicht zur Station zurückgekehrt (Status "{self.vacuum_state()}").'
            )
        self.last_run = {
            "room": room_id,
            "ok": True,
            "dry": False,
            "ts": time.time(),
            "steps": steps,
            "trace": list(self._trace),
        }

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
