from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.ai.color_options import (
    DeckColorOptionsRequest,
    accessible_text_color,
    contrast_ratio,
    generate_deck_color_options,
)
from app.ai.design_program import BackgroundMode, PaletteRoles


class PaletteOption(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    option_id: str = Field(alias="optionId", min_length=1)
    name: str = Field(min_length=1)
    is_current_theme: bool = Field(alias="isCurrentTheme")
    palette: PaletteRoles
    rationale: str = Field(default="", max_length=500)


def derive_palette(
    theme: dict[str, Any], background_mode: BackgroundMode
) -> PaletteRoles:
    """Derive a single-slide palette while retaining the deck focal color."""
    palette = theme.get("palette")
    palette_values = palette if isinstance(palette, dict) else {}
    background = _theme_color(theme, "backgroundColor", "background", "#FFFFFF")
    proposed_text = _theme_color(theme, "textColor", "text", "#111827")
    focal = _theme_color(theme, "accentColor", "accent", "#2563EB")
    secondary = _string_color(palette_values.get("secondary"), focal)

    if background_mode in {"dark", "image"}:
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


def build_palette_options(
    theme: dict[str, Any],
    summary: dict[str, Any],
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> list[PaletteOption]:
    """Return the current theme first and two accessible alternatives."""
    current = PaletteOption(
        optionId="current-theme",
        name="현재 테마 유지",
        isCurrentTheme=True,
        palette=derive_palette(theme, "light"),
        rationale="현재 슬라이드 테마의 배경색과 강조색을 유지합니다.",
    )
    generated = generate_deck_color_options(
        DeckColorOptionsRequest(
            topic=_summary_topic(summary),
            colorMood=str(summary.get("slideType", "")),
        ),
        model=model,
        api_key=api_key,
        client=client,
    )
    options = [current]
    used_ids = {current.option_id}
    for index, generated_option in enumerate(generated.options[:2], start=1):
        option_id = generated_option.option_id
        if option_id in used_ids:
            option_id = f"alternative-{index}"
        used_ids.add(option_id)
        palette = generated_option.palette
        options.append(
            PaletteOption(
                optionId=option_id,
                name=generated_option.name,
                isCurrentTheme=False,
                palette=ensure_palette_contrast(
                    PaletteRoles(
                        dominant=palette.background,
                        surface=palette.surface,
                        text=palette.text,
                        focal=palette.accent_color,
                        secondary=palette.secondary,
                    )
                ),
                rationale=generated_option.rationale[:500],
            )
        )
    return options


def _summary_topic(summary: dict[str, Any]) -> str:
    values = [summary.get("title"), summary.get("message")]
    topic = " ".join(
        value.strip()
        for value in values
        if isinstance(value, str) and value.strip()
    )
    return topic or "현재 슬라이드"


def _theme_color(
    theme: dict[str, Any], primary_key: str, fallback_key: str, default: str
) -> str:
    return _string_color(theme.get(primary_key) or theme.get(fallback_key), default)


def _string_color(value: object, default: str) -> str:
    return value if isinstance(value, str) and value else default
