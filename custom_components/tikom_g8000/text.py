"""Text fields: recording, new room name, routes."""

from __future__ import annotations

from homeassistant.components.text import TextEntity, TextMode
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import TikomConfigEntry
from .const import MAX_ROUTE_LENGTH
from .controller import Controller
from .entity import TikomEntity, TikomRoomEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TikomConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up text entities."""
    c = entry.runtime_data
    async_add_entities([Recording(c), NewRoomName(c)])

    @callback
    def add_room(room_id: str) -> None:
        async_add_entities([RoomRoute(c, room_id)])

    for room_id in list(c.rooms):
        add_room(room_id)
    entry.async_on_unload(
        async_dispatcher_connect(hass, c.signal_room_added, add_room)
    )


class Recording(TikomEntity, TextEntity):
    """The route being recorded."""

    _attr_native_min = 0
    _attr_native_max = MAX_ROUTE_LENGTH
    _attr_mode = TextMode.TEXT
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:record-rec"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "recording", "Aufnahme")

    @property
    def native_value(self) -> str:
        """Current recording."""
        return self.controller.recording

    async def async_set_value(self, value: str) -> None:
        """Edit by hand."""
        self.controller.set_recording(value)


class NewRoomName(TikomEntity, TextEntity):
    """Name for the next room."""

    _attr_native_min = 0
    _attr_native_max = 40
    _attr_mode = TextMode.TEXT
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:form-textbox"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "new_room_name", "Name des neuen Raums")

    @property
    def native_value(self) -> str:
        """Typed name."""
        return self.controller.new_room_name

    async def async_set_value(self, value: str) -> None:
        """Store."""
        self.controller.set_new_room_name(value)


class RoomRoute(TikomRoomEntity, TextEntity):
    """Route of one room."""

    _attr_native_min = 0
    _attr_native_max = MAX_ROUTE_LENGTH
    _attr_mode = TextMode.TEXT
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:routes"

    def __init__(self, controller: Controller, room_id: str) -> None:
        """Initialise."""
        super().__init__(controller, room_id, "route", "")

    @property
    def name(self) -> str:
        """Show the current room name."""
        return f"Route: {self.room.get('name', self.room_id)}"

    @property
    def native_value(self) -> str:
        """Stored route."""
        return self.room.get("route", "")

    async def async_set_value(self, value: str) -> None:
        """Edit by hand."""
        self.controller.set_room_value(self.room_id, "route", value)
