"""Buttons: drive, record, rooms, abort."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import TikomConfigEntry
from .const import DIRECTIONS
from .controller import Controller
from .entity import TikomEntity, TikomRoomEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TikomConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up buttons."""
    c = entry.runtime_data

    async def save_new() -> None:
        c.save_room(c.new_room_name, c.recording)
        c.set_new_room_name("")
        c.clear_recording()

    async def save_selected() -> None:
        room_id = c.get_setting("selected_room")
        if room_id not in c.rooms:
            raise HomeAssistantError("Kein Raum ausgewählt.")
        c.save_room(c.rooms[room_id]["name"], c.recording)
        c.clear_recording()

    async def delete_selected() -> None:
        room_id = c.get_setting("selected_room")
        if room_id not in c.rooms:
            raise HomeAssistantError("Kein Raum ausgewählt.")
        c.delete_room(room_id)

    async def test_recording() -> None:
        await c.async_test_recording()

    async def clear() -> None:
        c.clear_recording()

    entities: list[ButtonEntity] = [
        TikomButton(c, f"drive_{direction}", label, _drive(c, direction))
        for direction, (_, label) in DIRECTIONS.items()
    ]
    entities += [
        TikomButton(c, "clear", "Aufnahme leeren", clear, config=True),
        TikomButton(c, "test", "Aufnahme testen", test_recording, config=True),
        TikomButton(c, "save_new", "Aufnahme als neuen Raum speichern", save_new),
        TikomButton(
            c, "save_selected", "Aufnahme in gewählten Raum speichern",
            save_selected, config=True,
        ),
        TikomButton(c, "delete_selected", "Gewählten Raum löschen",
                    delete_selected, config=True),
        TikomButton(c, "abort", "Abbruch und zur Station", c.async_abort),
    ]
    async_add_entities(entities)

    @callback
    def add_room(room_id: str) -> None:
        async_add_entities([RoomCleanButton(c, room_id)])

    for room_id in list(c.rooms):
        add_room(room_id)
    entry.async_on_unload(
        async_dispatcher_connect(hass, c.signal_room_added, add_room)
    )


def _drive(c: Controller, direction: str) -> Callable[[], Awaitable[None]]:
    async def run() -> None:
        await c.async_drive(direction)

    return run


class TikomButton(TikomEntity, ButtonEntity):
    """A button that runs a coroutine."""

    def __init__(
        self,
        controller: Controller,
        key: str,
        name: str,
        action: Callable[[], Awaitable[Any]],
        config: bool = False,
    ) -> None:
        """Initialise."""
        super().__init__(controller, key, name)
        self._action = action
        if config:
            self._attr_entity_category = EntityCategory.CONFIG

    async def async_press(self) -> None:
        """Run the action."""
        await self._action()


class RoomCleanButton(TikomRoomEntity, ButtonEntity):
    """Clean one room."""

    def __init__(self, controller: Controller, room_id: str) -> None:
        """Initialise."""
        super().__init__(controller, room_id, "clean", "")
        self._attr_icon = "mdi:robot-vacuum"

    @property
    def name(self) -> str:
        """Show the current room name."""
        return f"Reinigen: {self.room.get('name', self.room_id)}"

    async def async_press(self) -> None:
        """Start cleaning this room."""
        self.controller.start_rooms([self.room_id])
