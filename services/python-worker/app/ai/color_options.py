from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class DeckColorOptionsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    topic: str = Field(min_length=1)
    color_mood: str = Field(default="", alias="colorMood")
    style_pack_id: str = Field(default="brandlogy-modern", alias="stylePackId")


class DeckColorPalette(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    primary: str
    secondary: str
    background: str
    surface: str
    muted: str
    border: str
    text: str
    accent_color: str = Field(alias="accentColor")

    @model_validator(mode="after")
    def validate_hex_values(self) -> "DeckColorPalette":
        for value in self.model_dump(by_alias=True).values():
            if not HEX_RE.match(str(value)):
                raise ValueError("palette colors must be #RRGGBB values")
        return self


class DeckColorOption(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    option_id: str = Field(alias="optionId", min_length=1)
    name: str = Field(min_length=1)
    palette: DeckColorPalette
    rationale: str = ""


class DeckColorOptionsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    options: list[DeckColorOption] = Field(min_length=3, max_length=3)


COLOR_OPTION_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "deck_color_options",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "options": {
                    "type": "array",
                    "minItems": 3,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "optionId": {"type": "string"},
                            "name": {"type": "string"},
                            "palette": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "primary": {"type": "string"},
                                    "secondary": {"type": "string"},
                                    "background": {"type": "string"},
                                    "surface": {"type": "string"},
                                    "muted": {"type": "string"},
                                    "border": {"type": "string"},
                                    "text": {"type": "string"},
                                    "accentColor": {"type": "string"},
                                },
                                "required": [
                                    "primary",
                                    "secondary",
                                    "background",
                                    "surface",
                                    "muted",
                                    "border",
                                    "text",
                                    "accentColor",
                                ],
                            },
                            "rationale": {"type": "string"},
                        },
                        "required": ["optionId", "name", "palette", "rationale"],
                    },
                }
            },
            "required": ["options"],
        },
    }
}

FALLBACK_PALETTES: tuple[dict[str, Any], ...] = (
    {
        "optionId": "resort-blue",
        "name": "Resort Blue",
        "palette": {
            "primary": "#0EA5E9",
            "secondary": "#0369A1",
            "background": "#F0F9FF",
            "surface": "#FFFFFF",
            "muted": "#E0F2FE",
            "border": "#BAE6FD",
            "text": "#0F172A",
            "accentColor": "#F472B6",
        },
        "rationale": "Relaxed blue for travel, ocean, and resort-like topics.",
        "keywords": ("blue", "ocean", "beach", "resort", "travel", "vacation", "바다", "휴양", "여행"),
    },
    {
        "optionId": "executive-blue",
        "name": "Executive Blue",
        "palette": {
            "primary": "#1D4ED8",
            "secondary": "#334155",
            "background": "#F8FAFC",
            "surface": "#FFFFFF",
            "muted": "#E2E8F0",
            "border": "#CBD5E1",
            "text": "#0F172A",
            "accentColor": "#DB2777",
        },
        "rationale": "Trustworthy and restrained for executive or professional decks.",
        "keywords": ("professional", "executive", "expert", "trust", "business", "전문", "임원", "회사"),
    },
    {
        "optionId": "modern-violet",
        "name": "Modern Violet",
        "palette": {
            "primary": "#7C3AED",
            "secondary": "#4F46E5",
            "background": "#FAF5FF",
            "surface": "#FFFFFF",
            "muted": "#EDE9FE",
            "border": "#DDD6FE",
            "text": "#18181B",
            "accentColor": "#EC4899",
        },
        "rationale": "Expressive violet for AI, creativity, and modern product narratives.",
        "keywords": ("purple", "violet", "ai", "creative", "modern", "보라", "인공지능", "창의"),
    },
    {
        "optionId": "calm-green",
        "name": "Calm Green",
        "palette": {
            "primary": "#059669",
            "secondary": "#0F766E",
            "background": "#F0FDF4",
            "surface": "#FFFFFF",
            "muted": "#DCFCE7",
            "border": "#BBF7D0",
            "text": "#052E16",
            "accentColor": "#2563EB",
        },
        "rationale": "Stable and calm for education, healthcare, or sustainability topics.",
        "keywords": ("calm", "green", "education", "health", "sustainable", "차분", "초록", "교육", "건강"),
    },
    {
        "optionId": "energetic-coral",
        "name": "Energetic Coral",
        "palette": {
            "primary": "#F97316",
            "secondary": "#DB2777",
            "background": "#FFF7ED",
            "surface": "#FFFFFF",
            "muted": "#FFEDD5",
            "border": "#FED7AA",
            "text": "#111827",
            "accentColor": "#2563EB",
        },
        "rationale": "High-energy palette for launch, pitch, or campaign presentations.",
        "keywords": ("energetic", "launch", "pitch", "campaign", "orange", "활기", "런칭", "캠페인"),
    },
)


def generate_deck_color_options(
    request: DeckColorOptionsRequest,
    *,
    model: str | None = None,
    api_key: str | None = None,
    client: Any | None = None,
) -> DeckColorOptionsResponse:
    if api_key or client is not None:
        try:
            return generate_color_options_with_llm(
                request,
                model=model,
                api_key=api_key,
                client=client,
            )
        except Exception:
            pass
    return fallback_color_options(request)


def generate_color_options_with_llm(
    request: DeckColorOptionsRequest,
    *,
    model: str | None = None,
    api_key: str | None = None,
    client: Any | None = None,
) -> DeckColorOptionsResponse:
    api_client: Any = client
    if api_client is None:
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for color option generation.")
        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    response = api_client.responses.create(
        model=model or "gpt-4.1-mini",
        instructions=(
            "Return exactly three accessible color palette options for a 16:9 PPT. "
            "Use #RRGGBB colors only. Ensure text has at least 4.5 contrast against "
            "background and surface."
        ),
        input=(
            f"Topic: {request.topic}\n"
            f"Color mood: {request.color_mood or '(auto)'}\n"
            f"Style pack: {request.style_pack_id}"
        ),
        text=COLOR_OPTION_RESPONSE_FORMAT,
    )
    payload = json.loads(str(getattr(response, "output_text", "")).strip())
    parsed = DeckColorOptionsResponse.model_validate(payload)
    return ensure_accessible_options(parsed)


def fallback_color_options(
    request: DeckColorOptionsRequest,
) -> DeckColorOptionsResponse:
    source = f"{request.topic} {request.color_mood}".casefold()
    ranked = sorted(
        FALLBACK_PALETTES,
        key=lambda item: keyword_score(source, item["keywords"]),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    for item in ranked:
        if len(selected) == 3:
            break
        selected.append({key: value for key, value in item.items() if key != "keywords"})
    response = DeckColorOptionsResponse.model_validate({"options": selected})
    return ensure_accessible_options(response)


def keyword_score(source: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword.casefold() in source)


def ensure_accessible_options(
    response: DeckColorOptionsResponse,
) -> DeckColorOptionsResponse:
    options: list[DeckColorOption] = []
    for option in response.options:
        palette = option.palette.model_dump(by_alias=True)
        palette["text"] = accessible_text_color(
            palette["background"],
            palette["text"],
        )
        option_payload = option.model_dump(by_alias=True)
        option_payload["palette"] = palette
        options.append(DeckColorOption.model_validate(option_payload))
    return DeckColorOptionsResponse(options=options)


def accessible_text_color(background: str, proposed: str) -> str:
    if contrast_ratio(background, proposed) >= 4.5:
        return proposed
    dark = "#111827"
    light = "#F8FAFC"
    return dark if contrast_ratio(background, dark) >= contrast_ratio(background, light) else light


def contrast_ratio(color_a: str, color_b: str) -> float:
    lighter = max(relative_luminance(color_a), relative_luminance(color_b))
    darker = min(relative_luminance(color_a), relative_luminance(color_b))
    return (lighter + 0.05) / (darker + 0.05)


def relative_luminance(color: str) -> float:
    values = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    channels = [
        value / 12.92
        if value <= 0.03928
        else ((value + 0.055) / 1.055) ** 2.4
        for value in values
    ]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
