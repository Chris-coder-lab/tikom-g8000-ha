"""Tikom G8000: rooms and extra controls on top of Tuya Local."""

from __future__ import annotations

import logging

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from . import panel, websocket_api
from .const import DOMAIN, VERSION
from .controller import Controller, install_device_file

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [
    Platform.VACUUM,
    Platform.BUTTON,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.TEXT,
]

type TikomConfigEntry = ConfigEntry[Controller]


async def async_setup_entry(hass: HomeAssistant, entry: TikomConfigEntry) -> bool:
    """Set up from a config entry."""
    # Re-install the Tuya Local device file (a Tuya Local update may remove it).
    result = await hass.async_add_executor_job(
        install_device_file, hass.config.path()
    )
    if result == "updated":
        persistent_notification.async_create(
            hass,
            "Die Tuya-Local-Gerätedatei für den G8000 wurde neu installiert. "
            "Bitte Home Assistant neu starten.",
            "Tikom G8000",
            notification_id="tikom_g8000_restart",
        )

    controller = Controller(hass, entry)
    await controller.async_load()
    entry.runtime_data = controller

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    domain_data = hass.data.setdefault(DOMAIN, {})
    if not domain_data.get("websocket"):
        websocket_api.async_register(hass)
        domain_data["websocket"] = True
    await panel.async_register_panel(hass, entry.title, VERSION)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: TikomConfigEntry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        await entry.runtime_data.async_unload()
        if not hass.config_entries.async_loaded_entries(DOMAIN):
            panel.async_remove_panel(hass)
    return unloaded
