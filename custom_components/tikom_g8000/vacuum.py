"""Vacuum entity that mirrors the real vacuum and offers rooms as segments."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.vacuum import (
    Segment,
    StateVacuumEntity,
    VacuumActivity,
    VacuumEntityFeature,
)
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from . import TikomConfigEntry
from .controller import Controller

_LOGGER = logging.getLogger(__name__)

_PASS_THROUGH = (
    VacuumEntityFeature.START
    | VacuumEntityFeature.PAUSE
    | VacuumEntityFeature.STOP
    | VacuumEntityFeature.RETURN_HOME
    | VacuumEntityFeature.FAN_SPEED
    | VacuumEntityFeature.LOCATE
    | VacuumEntityFeature.CLEAN_SPOT
    | VacuumEntityFeature.SEND_COMMAND
)

_ACTIVITIES = {activity.value: activity for activity in VacuumActivity}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TikomConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the wrapper vacuum."""
    async_add_entities([TikomRoomsVacuum(entry.runtime_data)])


class TikomRoomsVacuum(StateVacuumEntity):
    """Mirror of the real vacuum with virtual room segments."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_name = "Räume"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        self.controller = controller
        self._source = controller.vacuum_id
        self._attr_unique_id = f"{controller.entry.entry_id}_rooms_vacuum"
        self._attr_device_info = controller.device_info

    async def async_added_to_hass(self) -> None:
        """Follow the real vacuum and the room list."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_track_state_change_event(
                self.hass, [self._source], self._source_changed
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.controller.signal_update, self._rooms_changed
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.controller.signal_room_added, self._room_list_changed
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.controller.signal_room_removed, self._room_list_changed
            )
        )

    @callback
    def _source_changed(self, event: Event[Any]) -> None:
        self.async_write_ha_state()

    @callback
    def _rooms_changed(self) -> None:
        self.async_write_ha_state()

    @callback
    def _room_list_changed(self, room_id: str) -> None:
        last_seen = None
        if self.registry_entry is not None:
            try:
                last_seen = self.last_seen_segments
            except RuntimeError:
                last_seen = None
        if last_seen is not None and last_seen != self._segments():
            self.async_create_segments_issue()
        self.async_write_ha_state()

    # --- state ----------------------------------------------------------
    @property
    def _source_state(self):
        return self.hass.states.get(self._source)

    @property
    def available(self) -> bool:
        """Available while the real vacuum is."""
        state = self._source_state
        return state is not None and state.state != STATE_UNAVAILABLE

    @property
    def activity(self) -> VacuumActivity | None:
        """Activity of the real vacuum."""
        state = self._source_state
        if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            return None
        return _ACTIVITIES.get(state.state)

    @property
    def supported_features(self) -> VacuumEntityFeature:
        """Real features plus clean_area."""
        state = self._source_state
        raw = int(state.attributes.get("supported_features", 0) or 0) if state else 0
        return (
            (VacuumEntityFeature(raw) & _PASS_THROUGH)
            | VacuumEntityFeature.STATE
            | VacuumEntityFeature.CLEAN_AREA
        )

    @property
    def fan_speed(self) -> str | None:
        """Fan speed of the real vacuum."""
        state = self._source_state
        return state.attributes.get("fan_speed") if state else None

    @property
    def fan_speed_list(self) -> list[str]:
        """Fan speeds of the real vacuum."""
        state = self._source_state
        return list(state.attributes.get("fan_speed_list") or []) if state else []

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Wrapped vacuum and running room."""
        return {
            "wrapped_vacuum": self._source,
            "current_room": self.controller.current_room,
            "rooms": list(self.controller.rooms),
        }

    # --- pass-through ---------------------------------------------------
    async def _call(self, service: str, **data: Any) -> None:
        await self.hass.services.async_call(
            "vacuum",
            service,
            {"entity_id": self._source, **data},
            blocking=True,
            context=self._context,
        )

    async def async_start(self) -> None:
        """Start."""
        await self._call("start")

    async def async_pause(self) -> None:
        """Pause."""
        await self._call("pause")

    async def async_stop(self, **kwargs: Any) -> None:
        """Stop and abort a running room job."""
        if self.controller.job_running:
            await self.controller.async_abort()
        else:
            await self._call("stop")

    async def async_return_to_base(self, **kwargs: Any) -> None:
        """Go home and abort a running room job."""
        if self.controller.job_running:
            await self.controller.async_abort()
        else:
            await self._call("return_to_base")

    async def async_clean_spot(self, **kwargs: Any) -> None:
        """Spot clean."""
        await self._call("clean_spot")

    async def async_locate(self, **kwargs: Any) -> None:
        """Beep."""
        await self._call("locate")

    async def async_set_fan_speed(self, fan_speed: str, **kwargs: Any) -> None:
        """Set suction."""
        await self._call("set_fan_speed", fan_speed=fan_speed)

    async def async_send_command(
        self, command: str, params: dict[str, Any] | list[Any] | None = None, **kwargs: Any
    ) -> None:
        """Raw command."""
        data: dict[str, Any] = {"command": command}
        if params is not None:
            data["params"] = params
        await self._call("send_command", **data)

    # --- rooms ----------------------------------------------------------
    def _segments(self) -> list[Segment]:
        return sorted(
            (Segment(id=room_id, name=room["name"]) for room_id, room in self.controller.rooms.items()),
            key=lambda segment: segment.name.casefold(),
        )

    async def async_get_segments(self) -> list[Segment]:
        """Rooms that can be mapped to Home Assistant areas."""
        return self._segments()

    async def async_clean_segments(self, segment_ids: list[str], **kwargs: Any) -> None:
        """Clean rooms one after the other in the background."""
        self.controller.start_rooms(segment_ids)
