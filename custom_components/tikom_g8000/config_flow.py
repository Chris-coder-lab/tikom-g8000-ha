"""Config flow for Tikom G8000."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig

from .const import CONF_VACUUM, DOMAIN
from .controller import install_device_file


class TikomG8000ConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    def _display_name(self, entity_id: str) -> str:
        state = self.hass.states.get(entity_id)
        name = state.name if state is not None else ""
        return (name or "Tikom G8000")[:40]

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Install the device file, then pick the Tuya Local vacuum."""
        result = await self.hass.async_add_executor_job(
            install_device_file, self.hass.config.path()
        )
        if result == "missing":
            return self.async_abort(reason="no_tuya_local")

        registry = er.async_get(self.hass)
        candidates = [
            entity.entity_id
            for entity in registry.entities.values()
            if entity.domain == "vacuum" and entity.platform == "tuya_local"
        ]
        if not candidates:
            return self.async_abort(reason="no_tuya_vacuum")

        if user_input is None and len(candidates) == 1:
            # exactly one robot: no questions, just set it up
            user_input = {
                CONF_NAME: self._display_name(candidates[0]),
                CONF_VACUUM: candidates[0],
            }

        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_VACUUM])
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=user_input[CONF_NAME], data={CONF_VACUUM: user_input[CONF_VACUUM]}
            )

        schema = vol.Schema(
            {
                vol.Required(CONF_NAME, default=self._display_name(candidates[0])): str,
                vol.Required(CONF_VACUUM): EntitySelector(
                    EntitySelectorConfig(domain="vacuum", integration="tuya_local")
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)
