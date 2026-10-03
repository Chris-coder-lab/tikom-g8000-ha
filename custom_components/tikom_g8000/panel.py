"""Sidebar panel: one fixed JavaScript file, admin users only."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ELEMENT, PANEL_URL, STATIC_URL

_FILE = Path(__file__).parent / "frontend" / "panel.js"


async def async_register_panel(hass: HomeAssistant, title: str, version: str) -> None:
    """Serve the panel file and add the sidebar entry."""
    store = hass.data.setdefault(DOMAIN, {})
    if not store.get("static"):
        # exactly one file is served, never a folder
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL, str(_FILE), cache_headers=False)]
        )
        store["static"] = True
    if PANEL_URL in hass.data.get(frontend.DATA_PANELS, {}):
        return  # a second entry (or a reload) must not register it twice
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL,
        webcomponent_name=PANEL_ELEMENT,
        sidebar_title=title,
        sidebar_icon="mdi:robot-vacuum",
        module_url=f"{STATIC_URL}?v={version}",
        embed_iframe=False,
        trust_external=False,
        require_admin=True,
    )


def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar entry."""
    frontend.async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
