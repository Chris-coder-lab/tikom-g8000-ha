"""Selects: room mode and selected room."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import TikomConfigEntry
from .const import START_MODES
from .controller import Controller
from .entity import TikomEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TikomConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up selects."""
    c = entry.runtime_data
    async_add_entities([StartMode(c), SelectedRoom(c)])


class StartMode(TikomEntity, SelectEntity):
    """Cleaning mode used inside a room."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:broom"
    _attr_options = list(START_MODES.values())

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "start_mode", "Reinigungsmodus im Raum")

    @property
    def current_option(self) -> str:
        """Current mode label."""
        return START_MODES.get(self.controller.get_setting("start_mode"), "Smart")

    async def async_select_option(self, option: str) -> None:
        """Store the command for the chosen label."""
        for command, label in START_MODES.items():
            if label == option:
                self.controller.set_setting("start_mode", command)


class SelectedRoom(TikomEntity, SelectEntity):
    """Room used by "save into selected room" and "delete selected room"."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:floor-plan"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "selected_room", "Gewählter Raum")

    @property
    def options(self) -> list[str]:
        """Room names."""
        return sorted(
            (room["name"] for room in self.controller.rooms.values()), key=str.casefold
        )

    @property
    def current_option(self) -> str | None:
        """Selected room name."""
        room = self.controller.rooms.get(self.controller.get_setting("selected_room"))
        return room["name"] if room else None

    async def async_select_option(self, option: str) -> None:
        """Remember the room."""
        for room_id, room in self.controller.rooms.items():
            if room["name"] == option:
                self.controller.set_setting("selected_room", room_id)
