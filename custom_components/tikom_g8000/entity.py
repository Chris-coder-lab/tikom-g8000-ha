"""Shared entity base classes."""

from __future__ import annotations

from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .controller import Controller


class TikomEntity(Entity):
    """Entity bound to the controller."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, controller: Controller, key: str, name: str) -> None:
        """Initialise."""
        self.controller = controller
        self._attr_unique_id = f"{controller.entry.entry_id}_{key}"
        self._attr_name = name
        self._attr_device_info = controller.device_info

    async def async_added_to_hass(self) -> None:
        """Refresh whenever the controller changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.controller.signal_update, self._handle_update
            )
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()


class TikomRoomEntity(TikomEntity):
    """Entity that belongs to one room and disappears with it."""

    def __init__(
        self, controller: Controller, room_id: str, key: str, name: str
    ) -> None:
        """Initialise."""
        super().__init__(controller, f"room_{room_id}_{key}", name)
        self.room_id = room_id

    @property
    def room(self) -> dict:
        """Data of the room."""
        return self.controller.rooms.get(self.room_id, {})

    async def async_added_to_hass(self) -> None:
        """Also listen for room removal."""
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, self.controller.signal_room_removed, self._room_removed
            )
        )

    @callback
    def _room_removed(self, room_id: str) -> None:
        if room_id != self.room_id:
            return
        from homeassistant.helpers import entity_registry as er

        entity_id = self.entity_id
        self.hass.async_create_task(self.async_remove(force_remove=True))
        registry = er.async_get(self.hass)
        if registry.async_get(entity_id):
            registry.async_remove(entity_id)
