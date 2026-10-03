"""Numbers: step length, minimum battery, minutes per room."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import PERCENTAGE, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import TikomConfigEntry
from .controller import Controller
from .entity import TikomEntity, TikomRoomEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TikomConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up numbers."""
    c = entry.runtime_data
    async_add_entities([StepSeconds(c), MinBattery(c)])

    @callback
    def add_room(room_id: str) -> None:
        async_add_entities([RoomMinutes(c, room_id)])

    for room_id in list(c.rooms):
        add_room(room_id)
    entry.async_on_unload(
        async_dispatcher_connect(hass, c.signal_room_added, add_room)
    )


class StepSeconds(TikomEntity, NumberEntity):
    """Seconds per drive button press."""

    _attr_native_min_value = 0.5
    _attr_native_max_value = 30
    _attr_native_step = 0.5
    _attr_native_unit_of_measurement = UnitOfTime.SECONDS
    _attr_mode = NumberMode.BOX
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:timer-outline"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "step_seconds", "Sekunden pro Tastendruck")

    @property
    def native_value(self) -> float:
        """Current value."""
        return float(self.controller.get_setting("step_seconds"))

    async def async_set_native_value(self, value: float) -> None:
        """Store."""
        self.controller.set_setting("step_seconds", value)


class MinBattery(TikomEntity, NumberEntity):
    """Battery level required before a room run."""

    _attr_native_min_value = 20
    _attr_native_max_value = 100
    _attr_native_step = 5
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_mode = NumberMode.SLIDER
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:battery-charging"

    def __init__(self, controller: Controller) -> None:
        """Initialise."""
        super().__init__(controller, "min_battery", "Mindest-Akku vor Raumstart")

    @property
    def native_value(self) -> float:
        """Current value."""
        return float(self.controller.get_setting("min_battery"))

    async def async_set_native_value(self, value: float) -> None:
        """Store."""
        self.controller.set_setting("min_battery", value)


class RoomMinutes(TikomRoomEntity, NumberEntity):
    """Cleaning minutes of one room."""

    _attr_native_min_value = 1
    _attr_native_max_value = 90
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_mode = NumberMode.BOX
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:timer-sand"

    def __init__(self, controller: Controller, room_id: str) -> None:
        """Initialise."""
        super().__init__(controller, room_id, "minutes", "")

    @property
    def name(self) -> str:
        """Show the current room name."""
        return f"Minuten: {self.room.get('name', self.room_id)}"

    @property
    def native_value(self) -> float:
        """Current value."""
        return float(self.room.get("minutes", 10))

    async def async_set_native_value(self, value: float) -> None:
        """Store."""
        self.controller.set_room_value(self.room_id, "minutes", value)
