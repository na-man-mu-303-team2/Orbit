from __future__ import annotations

from typing import Any, Literal

from app.ai.color_options import accessible_text_color, contrast_ratio
from app.ai.design_program import PaletteRoles


def derive_palette(
    theme: dict[str, Any], background_mode: Literal["light", "dark"]
) -> PaletteRoles:
    """Derive a single-slide palette while retaining the deck focal color."""
    palette = theme.get("palette")
    palette_values = palette if isinstance(palette, dict) else {}
    background = _theme_color(theme, "backgroundColor", "background", "#FFFFFF")
    proposed_text = _theme_color(theme, "textColor", "text", "#111827")
    focal = _theme_color(theme, "accentColor", "accent", "#2563EB")
    secondary = _string_color(palette_values.get("secondary"), focal)

    if background_mode == "dark":
        dominant = "#0F172A"
        surface = "#1E293B"
    else:
        dominant = background
        surface = _string_color(palette_values.get("surface"), "#F8FAFC")

    return ensure_palette_contrast(
        PaletteRoles(
            dominant=dominant,
            surface=surface,
            text=proposed_text,
            focal=focal,
            secondary=secondary,
        )
    )


def ensure_palette_contrast(roles: PaletteRoles) -> PaletteRoles:
    """Guarantee WCAG AA contrast for body text against the dominant color."""
    if contrast_ratio(roles.text, roles.dominant) >= 4.5:
        return roles
    return roles.model_copy(
        update={"text": accessible_text_color(roles.dominant, roles.text)}
    )


def _theme_color(
    theme: dict[str, Any], primary_key: str, fallback_key: str, default: str
) -> str:
    return _string_color(theme.get(primary_key) or theme.get(fallback_key), default)


def _string_color(value: object, default: str) -> str:
    return value if isinstance(value, str) and value else default
