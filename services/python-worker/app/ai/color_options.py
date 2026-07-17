from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class DeckColorIntent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    mood: str = "auto"
    trust_level: str = Field(default="medium", alias="trustLevel")
    energy_level: str = Field(default="medium", alias="energyLevel")
    formality: str = "professional"
    preferred_hue: str = Field(default="auto", alias="preferredHue")
    background_preference: str = Field(default="auto", alias="backgroundPreference")
    forbidden_styles: list[str] = Field(default_factory=list, alias="forbiddenStyles")


class DeckDesignConstraints(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    canvas_background: str = Field(default="auto", alias="canvasBackground")
    forbidden_styles: list[str] = Field(default_factory=list, alias="forbiddenStyles")


class DeckColorOptionsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    topic: str = Field(min_length=1)
    color_mood: str = Field(default="", alias="colorMood")
    style_pack_id: str = Field(default="brandlogy-modern", alias="stylePackId")
    color_intent: DeckColorIntent | None = Field(default=None, alias="colorIntent")
    constraints: DeckDesignConstraints | None = None


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
        "name": "리조트 블루",
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
        "rationale": "여행, 바다, 휴양 주제에 어울리는 편안한 블루 팔레트입니다.",
        "keywords": ("blue", "ocean", "beach", "resort", "travel", "vacation", "바다", "휴양", "여행"),
    },
    {
        "optionId": "executive-blue",
        "name": "이그제큐티브 블루",
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
        "rationale": "임원 보고와 전문 발표에 어울리는 신뢰감 있고 절제된 팔레트입니다.",
        "keywords": ("professional", "executive", "expert", "trust", "business", "전문", "임원", "회사"),
    },
    {
        "optionId": "modern-violet",
        "name": "모던 바이올렛",
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
        "rationale": "AI, 창의성, 현대적인 제품 이야기에 어울리는 선명한 바이올렛 팔레트입니다.",
        "keywords": ("purple", "violet", "ai", "creative", "modern", "보라", "인공지능", "창의"),
    },
    {
        "optionId": "calm-green",
        "name": "캄 그린",
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
        "rationale": "교육, 헬스케어, 지속가능성 주제에 어울리는 안정적이고 차분한 팔레트입니다.",
        "keywords": ("calm", "green", "education", "health", "sustainable", "차분", "초록", "교육", "건강"),
    },
    {
        "optionId": "energetic-coral",
        "name": "에너제틱 코랄",
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
        "rationale": "출시, 피치, 캠페인 발표에 어울리는 활기찬 팔레트입니다.",
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
            "background and surface. Treat colorIntent and constraints as hard rules. "
            "Write every option name and rationale in concise, natural Korean."
        ),
        input=(
            f"Topic: {request.topic}\n"
            f"Color mood: {request.color_mood or '(auto)'}\n"
            f"Style pack: {request.style_pack_id}\n"
            f"Color intent: {request.color_intent.model_dump(by_alias=True) if request.color_intent else {}}\n"
            f"Constraints: {request.constraints.model_dump(by_alias=True) if request.constraints else {}}"
        ),
        text=COLOR_OPTION_RESPONSE_FORMAT,
    )
    payload = json.loads(str(getattr(response, "output_text", "")).strip())
    parsed = DeckColorOptionsResponse.model_validate(payload)
    return ensure_accessible_options(parsed, request)


def fallback_color_options(
    request: DeckColorOptionsRequest,
) -> DeckColorOptionsResponse:
    source = f"{request.topic} {request.color_mood}".casefold()
    ranked = sorted(
        FALLBACK_PALETTES,
        key=lambda item: palette_score(request, source, item),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    for item in ranked:
        if len(selected) == 3:
            break
        selected.append({key: value for key, value in item.items() if key != "keywords"})
    response = DeckColorOptionsResponse.model_validate({"options": selected})
    return ensure_accessible_options(response, request)


def keyword_score(source: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for keyword in keywords if keyword.casefold() in source)


def palette_score(
    request: DeckColorOptionsRequest,
    source: str,
    item: dict[str, Any],
) -> int:
    score = keyword_score(source, item["keywords"])
    intent = request.color_intent
    if intent is None:
        return score
    intent_source = " ".join(
        [
            intent.mood,
            intent.formality,
            intent.preferred_hue,
            intent.background_preference,
        ]
    ).casefold()
    return score + keyword_score(intent_source, item["keywords"]) * 2


def ensure_accessible_options(
    response: DeckColorOptionsResponse,
    request: DeckColorOptionsRequest,
) -> DeckColorOptionsResponse:
    options: list[DeckColorOption] = []
    for option in response.options:
        palette = option.palette.model_dump(by_alias=True)
        apply_color_constraints(palette, request)
        palette["text"] = accessible_text_color(
            palette["background"],
            palette["text"],
        )
        option_payload = option.model_dump(by_alias=True)
        option_payload["palette"] = palette
        options.append(DeckColorOption.model_validate(option_payload))
    return DeckColorOptionsResponse(options=options)


def apply_color_constraints(
    palette: dict[str, str],
    request: DeckColorOptionsRequest,
) -> None:
    constraints = request.constraints or DeckDesignConstraints()
    intent = request.color_intent
    forbidden_styles = set(constraints.forbidden_styles)
    if intent:
        forbidden_styles.update(intent.forbidden_styles)

    wants_white = constraints.canvas_background == "white" or (
        intent is not None and intent.background_preference == "white"
    )
    wants_dark = intent is not None and intent.background_preference == "dark"
    if wants_dark:
        palette["background"] = "#050505"
        palette["surface"] = "#111827"
        palette["muted"] = "#1F2937"
        palette["border"] = "#374151"
    elif wants_white:
        palette["background"] = "#FFFFFF"
        palette["surface"] = "#FFFFFF"
    if "pastel" in forbidden_styles:
        replacements = (
            {
                "background": "#050505",
                "surface": "#111827",
                "muted": "#1F2937",
                "border": "#374151",
            }
            if wants_dark
            else {
                "background": "#FFFFFF" if wants_white else "#F8FAFC",
                "surface": "#FFFFFF",
                "muted": "#F3F4F6",
                "border": "#D1D5DB",
            }
        )
        for key, replacement in (
            ("background", replacements["background"]),
            ("surface", replacements["surface"]),
            ("muted", replacements["muted"]),
            ("border", replacements["border"]),
        ):
            if key in palette and (is_pastel_hex(palette[key]) or key in {"muted", "border"}):
                palette[key] = replacement


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


def is_pastel_hex(color: str) -> bool:
    if not HEX_RE.match(color):
        return False
    red = int(color[1:3], 16) / 255
    green = int(color[3:5], 16) / 255
    blue = int(color[5:7], 16) / 255
    high = max(red, green, blue)
    low = min(red, green, blue)
    lightness = (high + low) / 2
    saturation = 0 if high == low else (high - low) / (1 - abs(2 * lightness - 1))
    return lightness >= 0.82 and saturation >= 0.12 and color.upper() != "#FFFFFF"
