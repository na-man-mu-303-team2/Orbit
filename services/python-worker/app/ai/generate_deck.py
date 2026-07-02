from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Audience = Literal["general", "executive", "technical", "sales"]
Purpose = Literal["inform", "persuade", "teach", "report"]
Tone = Literal["professional", "friendly", "confident", "concise"]
Template = Literal["default", "pitch", "report", "lesson"]
VisualRhythm = Literal["auto", "clean", "editorial", "bold", "technical"]
DensityTarget = Literal["low", "medium", "high"]
MediaPolicy = Literal["avoid", "balanced", "placeholder-ok"]
LayoutDiversity = Literal["stable", "varied"]
SlideType = Literal[
    "title",
    "cover",
    "problem",
    "solution",
    "feature-grid",
    "process",
    "data",
    "comparison",
    "architecture",
    "quote",
    "chart",
    "summary",
]
MediaKind = Literal["none", "provided", "generate", "placeholder"]
SlotPreset = Literal[
    "title_center",
    "title_left_visual_right",
    "title_full_bleed_image",
    "big_number_focus",
    "metric_cards",
    "insight_with_evidence",
    "before_after",
    "us_vs_them",
    "criteria_table",
    "quote_center",
    "quote_with_source",
    "quote_left_image_right",
]
DeckLayout = Literal[
    "title",
    "title-content",
    "section",
    "two-column",
    "image-left",
    "image-right",
    "chart-focus",
    "quote",
    "closing",
]


class GenerateDeckReference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId", min_length=1)


class GenerateDeckReferenceKeyword(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1)


class ReferenceContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId", min_length=1)
    content: str = Field(min_length=1)
    title: str = ""


class GenerateDeckMetadata(BaseModel):
    audience: Audience = "general"
    purpose: Purpose = "inform"
    tone: Tone = "professional"


class DesignOptions(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    visual_rhythm: VisualRhythm = Field(default="auto", alias="visualRhythm")
    density_target: DensityTarget = Field(default="medium", alias="densityTarget")
    media_policy: MediaPolicy = Field(default="balanced", alias="mediaPolicy")
    layout_diversity: LayoutDiversity = Field(
        default="stable",
        alias="layoutDiversity",
    )


class SlideCountRange(BaseModel):
    min: int = Field(default=5, ge=1, le=20)
    max: int = Field(default=8, ge=1, le=20)

    @model_validator(mode="after")
    def validate_order(self) -> SlideCountRange:
        if self.min > self.max:
            raise ValueError("min must be less than or equal to max")
        return self


class GenerateDeckRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId", min_length=1)
    topic: str = Field(min_length=1)
    prompt: str = ""
    design_prompt: str = Field(default="", alias="designPrompt")
    target_duration_minutes: int = Field(
        default=10,
        alias="targetDurationMinutes",
        ge=1,
        le=120,
    )
    slide_count_range: SlideCountRange = Field(
        default_factory=SlideCountRange,
        alias="slideCountRange",
    )
    template: Template = "default"
    metadata: GenerateDeckMetadata = Field(default_factory=GenerateDeckMetadata)
    design: DesignOptions = Field(default_factory=DesignOptions)
    references: list[GenerateDeckReference] = Field(default_factory=list)
    reference_keywords: list[GenerateDeckReferenceKeyword] = Field(
        default_factory=list,
        alias="referenceKeywords",
    )


class RawInput(BaseModel):
    project_id: str
    topic: str
    prompt: str
    design_prompt: str = ""
    target_duration_minutes: int
    slide_count: int
    min_slide_count: int
    max_slide_count: int
    template: Template
    metadata: GenerateDeckMetadata
    design: DesignOptions
    references: list[GenerateDeckReference]
    reference_keywords: list[GenerateDeckReferenceKeyword]
    reference_context: list[ReferenceContext]


class DeckOutline(BaseModel):
    title: str
    slide_titles: list[str]


class SourceEvidence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    note: str
    confidence: float = 0.7


class VisualIntent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    emphasis: str = ""
    mood: str = ""
    structure: str = ""
    palette_hint: str = Field(default="", alias="paletteHint")
    emphasis_style: str = Field(default="", alias="emphasisStyle")
    composition: str = ""
    decoration_density: str = Field(default="", alias="decorationDensity")
    media_style: str = Field(default="", alias="mediaStyle")
    metric_card_caption: str = Field(default="", alias="metricCardCaption")


class MediaIntent(BaseModel):
    kind: MediaKind = "none"
    prompt: str = ""
    alt: str = ""
    caption: str = ""
    rationale: str = ""
    required: bool = False
    placement: str = "auto"
    src: str = ""


class GeneratedSlideContent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(min_length=1)
    message: str = Field(min_length=1)
    speaker_notes: str = Field(alias="speakerNotes", min_length=1)
    keywords: list[str] = Field(default_factory=list)
    slide_type: SlideType | None = Field(default=None, alias="slideType")
    layout_variant: str = Field(default="", alias="layoutVariant")
    slot_preset: SlotPreset | None = Field(default=None, alias="slotPreset")
    visual_intent: VisualIntent = Field(
        default_factory=VisualIntent,
        alias="visualIntent",
    )
    media_intent: MediaIntent = Field(
        default_factory=MediaIntent,
        alias="mediaIntent",
    )


class GeneratedDeckContentPlan(BaseModel):
    title: str = Field(min_length=1)
    slides: list[GeneratedSlideContent] = Field(min_length=1)


class SlidePlan(BaseModel):
    order: int
    slide_type: SlideType
    title: str
    message: str
    speaker_notes: str
    keywords: list[str]
    evidence: list[SourceEvidence]
    layout_variant: str = ""
    slot_preset: SlotPreset | None = None
    requested_slot_preset: SlotPreset | None = None
    visual_intent: VisualIntent = Field(default_factory=VisualIntent)
    media_intent: MediaIntent = Field(default_factory=MediaIntent)


class ElementIntent(BaseModel):
    role: Literal[
        "background",
        "title",
        "subtitle",
        "body",
        "highlight",
        "footer",
        "chart",
    ]
    text: str = ""


class VisualPlan(BaseModel):
    slide_type: SlideType
    layout: DeckLayout
    layout_variant: str = ""
    slot_preset: SlotPreset
    visual_intent: VisualIntent = Field(default_factory=VisualIntent)
    media_intent: MediaIntent = Field(default_factory=MediaIntent)
    intents: list[ElementIntent]


class LayoutSlot(BaseModel):
    role: str
    x: int
    y: int
    width: int
    height: int
    z_index: int


class LayoutPlan(BaseModel):
    slots: list[LayoutSlot]


class ValidationIssue(BaseModel):
    scope: Literal["deck", "slide", "element"]
    path: str = ""
    message: str


class ValidationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    passed: bool
    layout_issues: list[ValidationIssue] = Field(
        default_factory=list,
        alias="layoutIssues",
    )
    content_issues: list[ValidationIssue] = Field(
        default_factory=list,
        alias="contentIssues",
    )
    design_issues: list[ValidationIssue] = Field(
        default_factory=list,
        alias="designIssues",
    )
    presentation_issues: list[ValidationIssue] = Field(
        default_factory=list,
        alias="presentationIssues",
    )


class GenerateDeckResponse(BaseModel):
    deck: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
    validation: ValidationResult


class DeckContentGenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Canvas:
    width: int = 1920
    height: int = 1080
    safe_x: int = 120
    safe_y: int = 88
    safe_width: int = 1680
    safe_height: int = 904


@dataclass(frozen=True)
class PresetConfig:
    variant: str
    layout: DeckLayout
    slots: tuple[LayoutSlot, ...]


@dataclass(frozen=True)
class LayoutCandidate:
    slot_preset: SlotPreset
    score: int


CANVAS = Canvas()
SLIDE_TYPES: tuple[SlideType, ...] = (
    "title",
    "cover",
    "problem",
    "solution",
    "feature-grid",
    "process",
    "data",
    "comparison",
    "architecture",
    "quote",
    "chart",
    "summary",
)
SLIDE_TYPE_SEQUENCE: list[SlideType] = [
    "cover",
    "problem",
    "solution",
    "feature-grid",
    "process",
    "data",
    "comparison",
    "architecture",
    "quote",
    "chart",
    "summary",
]
LAYOUT_BY_SLIDE_TYPE: dict[SlideType, DeckLayout] = {
    "title": "title",
    "cover": "title",
    "problem": "title-content",
    "solution": "two-column",
    "feature-grid": "two-column",
    "process": "title-content",
    "data": "title-content",
    "comparison": "two-column",
    "architecture": "image-right",
    "quote": "quote",
    "chart": "chart-focus",
    "summary": "closing",
}
PRESET_BY_SLIDE_TYPE: dict[SlideType, SlotPreset] = {
    "title": "title_center",
    "cover": "title_center",
    "problem": "insight_with_evidence",
    "solution": "title_left_visual_right",
    "feature-grid": "metric_cards",
    "process": "insight_with_evidence",
    "data": "big_number_focus",
    "comparison": "before_after",
    "architecture": "title_left_visual_right",
    "quote": "quote_center",
    "chart": "insight_with_evidence",
    "summary": "insight_with_evidence",
}
LAYOUT_VARIANTS = {"title", "data", "comparison", "quote"}
PRESET_REGISTRY: dict[SlotPreset, PresetConfig] = {
    "title_center": PresetConfig(
        variant="title",
        layout="title",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=260,
                width=CANVAS.safe_width,
                height=150,
                z_index=3,
            ),
            LayoutSlot(
                role="body",
                x=CANVAS.safe_x + 140,
                y=448,
                width=CANVAS.safe_width - 280,
                height=220,
                z_index=3,
            ),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "title_left_visual_right": PresetConfig(
        variant="title",
        layout="image-right",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=150,
                width=760,
                height=150,
                z_index=3,
            ),
            LayoutSlot(
                role="body",
                x=CANVAS.safe_x,
                y=330,
                width=720,
                height=360,
                z_index=3,
            ),
            LayoutSlot(role="media", x=980, y=180, width=700, height=520, z_index=3),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "title_full_bleed_image": PresetConfig(
        variant="title",
        layout="title",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(role="media", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=1),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=610,
                width=CANVAS.safe_width,
                height=140,
                z_index=4,
            ),
            LayoutSlot(
                role="body",
                x=CANVAS.safe_x,
                y=770,
                width=1080,
                height=150,
                z_index=4,
            ),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "big_number_focus": PresetConfig(
        variant="data",
        layout="title-content",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=CANVAS.safe_y,
                width=CANVAS.safe_width,
                height=128,
                z_index=3,
            ),
            LayoutSlot(
                role="body",
                x=CANVAS.safe_x,
                y=288,
                width=900,
                height=320,
                z_index=3,
            ),
            LayoutSlot(role="highlight", x=1080, y=270, width=560, height=360, z_index=3),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "metric_cards": PresetConfig(
        variant="data",
        layout="two-column",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=CANVAS.safe_y,
                width=CANVAS.safe_width,
                height=128,
                z_index=3,
            ),
            LayoutSlot(role="body", x=CANVAS.safe_x, y=270, width=760, height=430, z_index=3),
            LayoutSlot(role="highlight", x=960, y=270, width=660, height=430, z_index=3),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "insight_with_evidence": PresetConfig(
        variant="data",
        layout="title-content",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=CANVAS.safe_y,
                width=CANVAS.safe_width,
                height=128,
                z_index=3,
            ),
            LayoutSlot(
                role="body",
                x=CANVAS.safe_x,
                y=268,
                width=CANVAS.safe_width,
                height=300,
                z_index=3,
            ),
            LayoutSlot(role="highlight", x=CANVAS.safe_x, y=650, width=980, height=160, z_index=3),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "before_after": PresetConfig(
        variant="comparison",
        layout="two-column",
        slots=(
            LayoutSlot(
                role="background",
                x=0,
                y=0,
                width=CANVAS.width,
                height=CANVAS.height,
                z_index=0,
            ),
            LayoutSlot(
                role="title",
                x=CANVAS.safe_x,
                y=CANVAS.safe_y,
                width=CANVAS.safe_width,
                height=128,
                z_index=3,
            ),
            LayoutSlot(role="body", x=CANVAS.safe_x, y=280, width=760, height=420, z_index=3),
            LayoutSlot(role="highlight", x=1040, y=280, width=640, height=420, z_index=3),
            LayoutSlot(
                role="footer",
                x=CANVAS.safe_x,
                y=980,
                width=CANVAS.safe_width,
                height=36,
                z_index=5,
            ),
        ),
    ),
    "us_vs_them": PresetConfig(
        variant="comparison",
        layout="two-column",
        slots=(
            LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
            LayoutSlot(role="title", x=CANVAS.safe_x, y=CANVAS.safe_y, width=CANVAS.safe_width, height=128, z_index=3),
            LayoutSlot(role="body", x=CANVAS.safe_x, y=280, width=760, height=420, z_index=3),
            LayoutSlot(role="highlight", x=1040, y=280, width=640, height=420, z_index=3),
            LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
        ),
    ),
    "criteria_table": PresetConfig(
        variant="comparison",
        layout="title-content",
        slots=(
            LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
            LayoutSlot(role="title", x=CANVAS.safe_x, y=CANVAS.safe_y, width=CANVAS.safe_width, height=128, z_index=3),
            LayoutSlot(role="body", x=CANVAS.safe_x, y=260, width=CANVAS.safe_width, height=420, z_index=3),
            LayoutSlot(role="highlight", x=CANVAS.safe_x, y=720, width=CANVAS.safe_width, height=120, z_index=3),
            LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
        ),
    ),
    "quote_center": PresetConfig(
        variant="quote",
        layout="quote",
        slots=(
            LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
            LayoutSlot(role="title", x=CANVAS.safe_x, y=160, width=CANVAS.safe_width, height=120, z_index=3),
            LayoutSlot(role="body", x=300, y=340, width=1320, height=320, z_index=3),
            LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
        ),
    ),
    "quote_with_source": PresetConfig(
        variant="quote",
        layout="quote",
        slots=(
            LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
            LayoutSlot(role="title", x=CANVAS.safe_x, y=CANVAS.safe_y, width=CANVAS.safe_width, height=120, z_index=3),
            LayoutSlot(role="body", x=CANVAS.safe_x + 160, y=300, width=1260, height=320, z_index=3),
            LayoutSlot(role="highlight", x=CANVAS.safe_x + 160, y=670, width=820, height=110, z_index=3),
            LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
        ),
    ),
    "quote_left_image_right": PresetConfig(
        variant="quote",
        layout="image-right",
        slots=(
            LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
            LayoutSlot(role="title", x=CANVAS.safe_x, y=CANVAS.safe_y, width=760, height=120, z_index=3),
            LayoutSlot(role="body", x=CANVAS.safe_x, y=300, width=720, height=340, z_index=3),
            LayoutSlot(role="media", x=980, y=180, width=700, height=520, z_index=3),
            LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
        ),
    ),
}

PRESET_ORDER: dict[SlotPreset, int] = {
    slot_preset: index for index, slot_preset in enumerate(PRESET_REGISTRY)
}
PRESET_DENSITY: dict[SlotPreset, DensityTarget] = {
    "title_center": "low",
    "title_left_visual_right": "medium",
    "title_full_bleed_image": "low",
    "big_number_focus": "medium",
    "metric_cards": "high",
    "insight_with_evidence": "medium",
    "before_after": "medium",
    "us_vs_them": "high",
    "criteria_table": "high",
    "quote_center": "low",
    "quote_with_source": "medium",
    "quote_left_image_right": "medium",
}

STYLE_PROFILE_REGISTRY: dict[str, dict[str, Any]] = {
    "game-ink-neon": {
        "name": "game-ink-neon",
        "headingFontFamily": "Montserrat",
        "bodyFontFamily": "Inter",
        "background": "#07111f",
        "surface": "#101827",
        "text": "#f8fafc",
        "accent": "#00e5ff",
        "secondary": "#b6ff00",
        "muted": "#0b1020",
        "border": "#ff3df2",
        "titleSize": 68,
        "headingSize": 44,
        "bodySize": 28,
        "captionSize": 17,
    },
    "startup-clean": {
        "name": "startup-clean",
        "headingFontFamily": "Inter",
        "bodyFontFamily": "Inter",
        "background": "#ffffff",
        "surface": "#ffffff",
        "text": "#111827",
        "accent": "#2563eb",
        "secondary": "#10b981",
        "muted": "#f8fafc",
        "border": "#d8dee9",
        "titleSize": 60,
        "headingSize": 42,
        "bodySize": 26,
        "captionSize": 18,
    },
    "academic-report": {
        "name": "academic-report",
        "headingFontFamily": "IBM Plex Sans",
        "bodyFontFamily": "Inter",
        "background": "#f8fafc",
        "surface": "#ffffff",
        "text": "#111827",
        "accent": "#0f766e",
        "secondary": "#7c3aed",
        "muted": "#eef2f7",
        "border": "#cbd5e1",
        "titleSize": 62,
        "headingSize": 42,
        "bodySize": 26,
        "captionSize": 17,
    },
    "dark-cyber": {
        "name": "dark-cyber",
        "headingFontFamily": "Montserrat",
        "bodyFontFamily": "Inter",
        "background": "#0b1120",
        "surface": "#111827",
        "text": "#f8fafc",
        "accent": "#38bdf8",
        "secondary": "#a78bfa",
        "muted": "#020617",
        "border": "#334155",
        "titleSize": 66,
        "headingSize": 44,
        "bodySize": 27,
        "captionSize": 17,
    },
    "warm-editorial": {
        "name": "warm-editorial",
        "headingFontFamily": "IBM Plex Serif",
        "bodyFontFamily": "Inter",
        "background": "#fff7ed",
        "surface": "#ffffff",
        "text": "#1f2937",
        "accent": "#be123c",
        "secondary": "#0f766e",
        "muted": "#ffedd5",
        "border": "#fed7aa",
        "titleSize": 62,
        "headingSize": 42,
        "bodySize": 27,
        "captionSize": 17,
    },
    "kids-education": {
        "name": "kids-education",
        "headingFontFamily": "Nunito",
        "bodyFontFamily": "Nunito",
        "background": "#f0f9ff",
        "surface": "#ffffff",
        "text": "#172554",
        "accent": "#f97316",
        "secondary": "#22c55e",
        "muted": "#dcfce7",
        "border": "#bae6fd",
        "titleSize": 64,
        "headingSize": 42,
        "bodySize": 28,
        "captionSize": 18,
    },
}

SEMANTIC_PALETTE_PROFILES: dict[str, dict[str, Any]] = {
    "monochrome": {
        "keywords": [
            "모노톤",
            "블랙앤화이트",
            "흑백",
            "monotone",
            "monochrome",
            "black and white",
        ],
        "background": "#ffffff",
        "surface": "#ffffff",
        "text": "#111827",
        "accent": "#111827",
        "secondary": "#6b7280",
        "muted": "#f3f4f6",
        "border": "#d1d5db",
    },
    "ocean-blue": {
        "keywords": [
            "바다",
            "오션",
            "해변",
            "파도",
            "해양",
            "ocean",
            "sea",
            "beach",
            "wave",
            "marine",
        ],
        "background": "#f7fbff",
        "surface": "#ffffff",
        "text": "#0f172a",
        "accent": "#2563eb",
        "secondary": "#0891b2",
        "muted": "#e0f2fe",
        "border": "#bae6fd",
    },
}

EXPLICIT_COLOR_NAME_MAP = {
    "흰색": "#ffffff",
    "화이트": "#ffffff",
    "white": "#ffffff",
    "노란색": "#facc15",
    "노랑": "#facc15",
    "옐로우": "#facc15",
    "yellow": "#facc15",
    "검정": "#111827",
    "black": "#111827",
    "회색": "#6b7280",
    "gray": "#6b7280",
    "파랑": "#2563eb",
    "blue": "#2563eb",
    "빨강": "#dc2626",
    "red": "#dc2626",
    "초록": "#16a34a",
    "green": "#16a34a",
    "보라": "#7c3aed",
    "purple": "#7c3aed",
    "주황": "#f97316",
    "orange": "#f97316",
    "분홍": "#ec4899",
    "pink": "#ec4899",
    "남색": "#1e3a8a",
    "navy": "#1e3a8a",
}
EXPLICIT_COLOR_RE = re.compile(
    r"#[0-9a-fA-F]{6}|흰색|화이트|노란색|노랑|옐로우|검정|"
    r"회색|파랑|빨강|초록|보라|주황|분홍|남색|"
    r"(?<![a-z])(?:white|yellow|black|gray|blue|red|green|"
    r"purple|orange|pink|navy)(?![a-z])",
    re.IGNORECASE,
)
DESIGN_PROMPT_HINT_RE = re.compile(
    r"색감|디자인|스타일|느낌|테마|팔레트|픽셀|고전|"
    r"(?<![a-z])(?:design|style|theme|palette|color|colors|pixel|retro|"
    r"classic|visual|look|mood)(?![a-z])",
    re.IGNORECASE,
)
THEME_TOKEN_RE = re.compile(
    r"(?<![a-z])"
    r"(background|text|accent|primary|secondary|surface|muted|border)"
    r"\s*:\s*(#[0-9a-fA-F]{6})(?![0-9a-fA-F])",
    re.IGNORECASE,
)
THEME_TOKEN_ANY_RE = re.compile(
    r"(?<![a-z])(?:[a-z][a-z0-9_-]*)\s*:\s*\S+",
    re.IGNORECASE,
)
NEUTRAL_COLORS = {"#ffffff", "#111827", "#000000", "#6b7280"}

DECK_CONTENT_INSTRUCTIONS = """
You create Korean presentation slide content for ORBIT.
Return only JSON that matches the requested schema.

Rules:
- Ground the deck in the topic, user prompt, reference keywords, and reference excerpts.
- Design instructions describe visual style only.
- Do not write design instructions into slide title, message, or speakerNotes.
- Reflect design instructions through visualIntent.paletteHint, emphasisStyle,
  composition, decorationDensity, and mediaStyle.
- When suggesting colors, use machine-readable theme tokens:
  background:#RRGGBB text:#RRGGBB accent:#RRGGBB secondary:#RRGGBB
  surface:#RRGGBB muted:#RRGGBB border:#RRGGBB
- For design moods such as 바다, 오션, 모노톤, or 블랙앤화이트, reflect
  them through theme tokens or visualIntent.paletteHint when possible.
- Write concrete slide titles, body messages, and speaker notes for the actual subject.
- speakerNotes must be the actual Korean presenter script to read aloud, not a guide
  about what the presenter should explain.
- Keep speakerNotes to 2-4 natural spoken sentences with concrete wording, examples,
  or transitions for the audience.
- Do not write speakerNotes like "이 슬라이드는 ... 설명합니다", "... 팁을 제공합니다",
  or "... 함께 언급합니다". Say the presentation lines directly.
- Choose slideType, layoutVariant, slotPreset, visualIntent, and mediaIntent.
- visualIntent must include paletteHint, emphasisStyle, composition,
  decorationDensity, mediaStyle, and metricCardCaption. Prefer concise values such as
  keyword-chips, split, poster, data, media, process, radial, bubble,
  low, medium, or high.
- For visualIntent.metricCardCaption, write only concrete text intended for a
  data/metric card. Use an empty string if there is no meaningful caption, and
  do not copy the slide message verbatim.
- Do not output coordinates, sizes, zIndex, or final Deck JSON.
- Do not write meta placeholders such as "목적과 기대 결과를 소개합니다" or
  "결정 사항, 실행 순서, 후속 검증 기준을 정리합니다" unless the source is actually about that.
- Do not invent unsupported facts. If excerpts are sparse, stay close to the topic and keywords.
- Keep messages concise enough for slide body text.
""".strip()

DECK_CONTENT_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "deck_content_plan",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "title": {"type": "string"},
                "slides": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "title": {"type": "string"},
                            "message": {"type": "string"},
                            "speakerNotes": {"type": "string"},
                            "keywords": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                            "slideType": {
                                "type": "string",
                                "enum": list(SLIDE_TYPES),
                            },
                            "layoutVariant": {
                                "type": "string",
                                "enum": sorted(LAYOUT_VARIANTS),
                            },
                            "slotPreset": {
                                "type": "string",
                                "enum": list(PRESET_REGISTRY.keys()),
                            },
                            "visualIntent": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "emphasis": {"type": "string"},
                                    "mood": {"type": "string"},
                                    "structure": {"type": "string"},
                                    "paletteHint": {"type": "string"},
                                    "emphasisStyle": {"type": "string"},
                                    "composition": {"type": "string"},
                                    "decorationDensity": {"type": "string"},
                                    "mediaStyle": {"type": "string"},
                                    "metricCardCaption": {"type": "string"},
                                },
                                "required": [
                                    "emphasis",
                                    "mood",
                                    "structure",
                                    "paletteHint",
                                    "emphasisStyle",
                                    "composition",
                                    "decorationDensity",
                                    "mediaStyle",
                                    "metricCardCaption",
                                ],
                            },
                            "mediaIntent": {
                                "type": "object",
                                "additionalProperties": False,
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": [
                                            "none",
                                            "provided",
                                            "generate",
                                            "placeholder",
                                        ],
                                    },
                                    "prompt": {"type": "string"},
                                    "alt": {"type": "string"},
                                    "caption": {"type": "string"},
                                    "rationale": {"type": "string"},
                                    "required": {"type": "boolean"},
                                    "placement": {"type": "string"},
                                    "src": {"type": "string"},
                                },
                                "required": [
                                    "kind",
                                    "prompt",
                                    "alt",
                                    "caption",
                                    "rationale",
                                    "required",
                                    "placement",
                                    "src",
                                ],
                            },
                        },
                        "required": [
                            "title",
                            "message",
                            "speakerNotes",
                            "keywords",
                            "slideType",
                            "layoutVariant",
                            "slotPreset",
                            "visualIntent",
                            "mediaIntent",
                        ],
                    },
                },
            },
            "required": ["title", "slides"],
        },
    }
}


def generate_deck(
    request: GenerateDeckRequest,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
    reference_context: list[ReferenceContext] | None = None,
) -> GenerateDeckResponse:
    raw_input = analyze_input(request, reference_context=reference_context)
    outline, slide_plans = plan_deck_content(
        raw_input,
        client=client,
        model=model,
        api_key=api_key,
    )
    slide_plans = apply_design_options(raw_input, slide_plans)
    theme = direct_design(raw_input, slide_plans)
    slides = [
        assemble_slide(raw_input, slide_plan, plan_visuals(slide_plan), theme)
        for slide_plan in slide_plans
    ]
    deck = {
        "deckId": f"deck_ai_{safe_token(raw_input.project_id)}",
        "projectId": raw_input.project_id,
        "title": outline.title,
        "version": 1,
        "targetDurationMinutes": raw_input.target_duration_minutes,
        "metadata": {
            "language": "ko",
            "locale": "ko-KR",
            "sourceType": "ai",
            "generatedBy": "ai",
            "audience": raw_input.metadata.audience,
            "purpose": raw_input.metadata.purpose,
            "tone": raw_input.metadata.tone,
            "createdFrom": {
                "topic": raw_input.topic,
                "references": [
                    {"fileId": reference.file_id}
                    for reference in raw_input.references
                ],
            },
        },
        "canvas": {
            "preset": "wide-16-9",
            "width": CANVAS.width,
            "height": CANVAS.height,
            "aspectRatio": "16:9",
        },
        "theme": theme,
        "slides": slides,
    }
    deck, validation = validate_and_patch(deck)
    warnings = []
    if not raw_input.references:
        warnings.append("참고자료 없이 topic-only generation으로 생성했습니다.")
    generated_slide_count = len(slides)
    if raw_input.min_slide_count <= generated_slide_count < raw_input.max_slide_count:
        warnings.append(
            f"AI가 참고자료/주제 밀도를 기준으로 {generated_slide_count}장이 적정하다고 판단했습니다."
        )

    return GenerateDeckResponse(deck=deck, warnings=warnings, validation=validation)


def analyze_input(
    request: GenerateDeckRequest,
    *,
    reference_context: list[ReferenceContext] | None = None,
) -> RawInput:
    slide_count = choose_slide_count(
        request.target_duration_minutes,
        request.slide_count_range,
    )
    prompt, design_prompt = split_content_and_design_prompt(
        request.prompt,
        request.design_prompt,
    )
    return RawInput(
        project_id=request.project_id,
        topic=request.topic.strip(),
        prompt=prompt,
        design_prompt=design_prompt,
        target_duration_minutes=request.target_duration_minutes,
        slide_count=slide_count,
        min_slide_count=request.slide_count_range.min,
        max_slide_count=request.slide_count_range.max,
        template=request.template,
        metadata=request.metadata,
        design=request.design,
        references=request.references,
        reference_keywords=request.reference_keywords,
        reference_context=reference_context or [],
    )


def split_content_and_design_prompt(prompt: str, design_prompt: str) -> tuple[str, str]:
    content = prompt.strip()
    design = design_prompt.strip()
    if design:
        return content, design

    chunks = [chunk.strip() for chunk in re.split(r"[\n,;]+", content) if chunk.strip()]
    if not chunks:
        return "", ""

    design_chunks = [
        chunk for chunk in chunks if DESIGN_PROMPT_HINT_RE.search(chunk)
    ]
    if not design_chunks:
        return content, ""

    content_chunks = [chunk for chunk in chunks if chunk not in design_chunks]
    if len(chunks) == 1 and content_chunks:
        return content, ""

    return ", ".join(content_chunks), ", ".join(design_chunks)


def choose_slide_count(target_minutes: int, slide_range: SlideCountRange) -> int:
    suggested = round(target_minutes)
    return min(slide_range.max, max(slide_range.min, suggested))


def plan_deck_content(
    raw_input: RawInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> tuple[DeckOutline, list[SlidePlan]]:
    generated_plan = generate_content_plan_with_llm(
        raw_input,
        client=client,
        model=model,
        api_key=api_key,
    )
    if generated_plan is not None:
        slide_plans = slide_plans_from_generated_content(raw_input, generated_plan)
        if slide_plans:
            return (
                DeckOutline(
                    title=deck_title_for_topic(raw_input.topic, generated_plan.title),
                    slide_titles=[slide.title for slide in slide_plans],
                ),
                slide_plans,
            )
    if requires_llm_content(raw_input):
        raise DeckContentGenerationError(
            "LLM deck content generation is required for prompt or reference-based decks."
        )

    outline = plan_presentation(raw_input)
    return outline, plan_slides(raw_input, outline)


def requires_llm_content(raw_input: RawInput) -> bool:
    return bool(
        raw_input.prompt.strip()
        or raw_input.design_prompt.strip()
        or raw_input.references
        or raw_input.reference_keywords
        or raw_input.reference_context
    )


def deck_title_for_topic(topic: str, title: str) -> str:
    deck_title = title.strip()
    if not deck_title:
        return topic
    if topic in deck_title:
        return deck_title
    return f"{topic}: {deck_title}"


def plan_presentation(raw_input: RawInput) -> DeckOutline:
    titles = [
        title_for_slide(raw_input, index, raw_input.slide_count)
        for index in range(1, raw_input.slide_count + 1)
    ]
    return DeckOutline(title=f"{raw_input.topic} 발표안", slide_titles=titles)


def title_for_slide(raw_input: RawInput, order: int, total: int) -> str:
    if order == 1:
        return raw_input.topic
    if order == total:
        return f"{raw_input.topic} 핵심 정리"

    focus_terms = reference_keywords_for(raw_input.reference_keywords)
    middle_titles = [f"{term}" for term in focus_terms] or [
        f"{raw_input.topic}의 핵심 특징",
        f"{raw_input.topic}의 배경과 맥락",
        f"{raw_input.topic}의 주요 포인트",
        f"{raw_input.topic}의 사례와 활용",
        f"{raw_input.topic}를 기억하는 방법",
    ]
    return middle_titles[(order - 2) % len(middle_titles)]


def plan_slides(raw_input: RawInput, outline: DeckOutline) -> list[SlidePlan]:
    keyword_pool = reference_keywords_for(raw_input.reference_keywords) or keywords_for(
        raw_input.topic,
        raw_input.prompt,
    )
    plans: list[SlidePlan] = []

    for index, title in enumerate(outline.slide_titles, start=1):
        slide_type = slide_type_for(index, raw_input.slide_count)
        message = message_for(raw_input, slide_type, title)
        plans.append(
            SlidePlan(
                order=index,
                slide_type=slide_type,
                title=title,
                message=message,
                speaker_notes=speaker_notes_for(raw_input, title, message, index),
                keywords=keyword_pool[:3],
                evidence=evidence_for(raw_input.references, title),
                layout_variant=PRESET_REGISTRY[
                    preset_for_slide_type(slide_type)
                ].variant,
                slot_preset=preset_for_slide_type(slide_type),
            )
        )

    return plans


def slide_type_for(order: int, total: int) -> SlideType:
    if order == 1:
        return "cover"
    if order == total:
        return "summary"
    return SLIDE_TYPE_SEQUENCE[(order - 1) % (len(SLIDE_TYPE_SEQUENCE) - 1)]


def message_for(raw_input: RawInput, slide_type: SlideType, title: str) -> str:
    focus = keyword_phrase(raw_input)
    if slide_type == "cover":
        return f"{raw_input.topic}를 {focus} 중심으로 소개합니다."
    if slide_type == "summary":
        return f"{raw_input.topic}에서 기억할 핵심은 {focus}입니다."
    if title in reference_keywords_for(raw_input.reference_keywords):
        return f"{title}가 {raw_input.topic}에서 어떤 의미를 갖는지 설명합니다."

    base = raw_input.prompt or f"{raw_input.topic}의 주요 내용을 구체적으로 정리합니다."
    return f"{title}: {base}"


def speaker_notes_for(raw_input: RawInput, title: str, message: str, order: int) -> str:
    focus = keyword_phrase(raw_input)
    if order == 1:
        return (
            f"안녕하세요. 오늘은 {raw_input.topic}를 {focus} 중심으로 살펴보겠습니다. "
            f"먼저 왜 이 주제가 중요한지 짚고, 바로 적용할 수 있는 포인트까지 연결해 보겠습니다."
        )
    if order == raw_input.slide_count:
        return (
            f"마지막으로 핵심만 다시 묶어보겠습니다. {message} "
            f"이 내용을 기준으로 발표 이후에 바로 실행할 한 가지를 정하면 좋겠습니다."
        )
    return (
        f"여기서 중요한 점은 {message} "
        f"{title}를 볼 때는 {focus}가 실제 상황에서 어떻게 달라지는지에 집중해 주세요."
    )


def keywords_for(topic: str, prompt: str) -> list[str]:
    words = [word.strip(" ,.;:()[]{}") for word in f"{topic} {prompt}".split()]
    unique = [word for index, word in enumerate(words) if word and word not in words[:index]]
    return (unique or [topic])[:5]


def keyword_phrase(raw_input: RawInput) -> str:
    keywords = reference_keywords_for(raw_input.reference_keywords) or keywords_for(
        raw_input.topic,
        raw_input.prompt,
    )
    return ", ".join(keywords[:3]) if keywords else raw_input.topic


def reference_keywords_for(
    reference_keywords: list[GenerateDeckReferenceKeyword],
) -> list[str]:
    keywords: list[str] = []
    seen: set[str] = set()
    for keyword in reference_keywords:
        text = keyword.text.strip()
        key = text.casefold()
        if not text or key in seen:
            continue

        seen.add(key)
        keywords.append(text)

    return keywords[:5]


def generate_content_plan_with_llm(
    raw_input: RawInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> GeneratedDeckContentPlan | None:
    api_client: Any = client
    if api_client is None:
        if not api_key:
            if requires_llm_content(raw_input):
                raise DeckContentGenerationError(
                    "OPENAI_API_KEY is required for prompt or reference-based deck generation."
                )
            return None

        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    try:
        response = api_client.responses.create(
            model=model or "gpt-4o-mini",
            instructions=DECK_CONTENT_INSTRUCTIONS,
            input=deck_content_prompt(raw_input),
            text=DECK_CONTENT_RESPONSE_FORMAT,
        )
    except Exception as error:
        raise DeckContentGenerationError(
            f"LLM deck content generation failed: {error}"
        ) from error

    output_text = str(getattr(response, "output_text", "")).strip()
    if not output_text:
        raise DeckContentGenerationError("LLM returned empty deck content.")

    try:
        payload = json.loads(output_text)
        plan = GeneratedDeckContentPlan.model_validate(payload)
    except Exception as error:
        raise DeckContentGenerationError(
            f"LLM returned invalid deck content: {error}"
        ) from error

    if len(plan.slides) < raw_input.min_slide_count:
        raise DeckContentGenerationError(
            f"LLM returned fewer slides than the requested minimum ({raw_input.min_slide_count})."
        )

    return GeneratedDeckContentPlan(
        title=plan.title,
        slides=plan.slides[: raw_input.slide_count],
    )


def deck_content_prompt(raw_input: RawInput) -> str:
    keywords = reference_keywords_for(raw_input.reference_keywords)
    context = "\n\n".join(
        f"[{item.file_id}] {item.title}\n{item.content[:1200]}"
        for item in raw_input.reference_context[:6]
    )
    return "\n".join(
        [
            f"Topic: {raw_input.topic}",
            f"User prompt: {raw_input.prompt or '(none)'}",
            f"Design prompt: {raw_input.design_prompt or '(none)'}",
            f"Slide count: {raw_input.slide_count}",
            f"Audience: {raw_input.metadata.audience}",
            f"Purpose: {raw_input.metadata.purpose}",
            f"Tone: {raw_input.metadata.tone}",
            f"Visual rhythm: {raw_input.design.visual_rhythm}",
            f"Density target: {raw_input.design.density_target}",
            f"Media policy: {raw_input.design.media_policy}",
            f"Layout diversity: {raw_input.design.layout_diversity}",
            f"Reference keywords: {', '.join(keywords) if keywords else '(none)'}",
            "Reference excerpts:",
            context or "(none)",
        ]
    )


def slide_plans_from_generated_content(
    raw_input: RawInput,
    plan: GeneratedDeckContentPlan,
) -> list[SlidePlan]:
    keyword_pool = reference_keywords_for(raw_input.reference_keywords)
    slide_plans: list[SlidePlan] = []

    for index, slide in enumerate(plan.slides[: raw_input.slide_count], start=1):
        slide_keywords = merge_keywords(keyword_pool, slide.keywords)
        fallback_type = slide_type_for(index, raw_input.slide_count)
        slide_type = normalize_slide_type(slide.slide_type, fallback_type)
        fallback_preset = preset_for_slide_type(slide_type)
        slot_preset = normalize_slot_preset(
            slide.slot_preset,
            fallback_preset,
        )
        slide_plans.append(
            SlidePlan(
                order=index,
                slide_type=slide_type,
                title=slide.title,
                message=slide.message,
                speaker_notes=slide.speaker_notes,
                keywords=slide_keywords[:3],
                evidence=evidence_for(raw_input.references, slide.title),
                layout_variant=normalize_layout_variant(
                    slide.layout_variant,
                    fallback_preset,
                ),
                slot_preset=slot_preset,
                requested_slot_preset=slot_preset,
                visual_intent=slide.visual_intent,
                media_intent=slide.media_intent,
            )
        )

    return slide_plans


def merge_keywords(primary: list[str], secondary: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for keyword in [*primary, *secondary]:
        text = keyword.strip()
        key = text.casefold()
        if not text or key in seen:
            continue

        seen.add(key)
        merged.append(text)

    return merged


def normalize_slide_type(value: SlideType | None, fallback: SlideType) -> SlideType:
    if value in SLIDE_TYPES:
        return value
    return fallback


def normalize_slot_preset(
    value: SlotPreset | None,
    fallback: SlotPreset,
) -> SlotPreset:
    if value in PRESET_REGISTRY:
        return value
    return fallback


def normalize_layout_variant(value: str, slot_preset: SlotPreset) -> str:
    if value in LAYOUT_VARIANTS:
        return value
    return PRESET_REGISTRY[slot_preset].variant


def apply_design_options(
    raw_input: RawInput,
    slide_plans: list[SlidePlan],
) -> list[SlidePlan]:
    previous_preset: SlotPreset | None = None
    preset_usage: dict[SlotPreset, int] = {}
    for slide_plan in slide_plans:
        slide_plan.media_intent = media_intent_for_policy(
            slide_plan.media_intent,
            raw_input.design.media_policy,
        )
        selected_preset = choose_layout_preset(
            slide_plan,
            raw_input.design,
            previous_preset,
            preset_usage,
        )
        slide_plan.slot_preset = selected_preset
        slide_plan.layout_variant = PRESET_REGISTRY[selected_preset].variant
        preset_usage[selected_preset] = preset_usage.get(selected_preset, 0) + 1
        previous_preset = selected_preset

    return slide_plans


def choose_layout_preset(
    slide_plan: SlidePlan,
    design: DesignOptions,
    previous_preset: SlotPreset | None,
    preset_usage: dict[SlotPreset, int],
) -> SlotPreset:
    fallback = preset_for_slide_type(slide_plan.slide_type)
    if slide_plan.slide_type in ("chart", "feature-grid"):
        return fallback

    candidates = layout_candidates_for(
        slide_plan,
        design,
        previous_preset,
        preset_usage,
        fallback,
    )
    return max(
        candidates,
        key=lambda candidate: (
            candidate.score,
            -PRESET_ORDER[candidate.slot_preset],
        ),
    ).slot_preset


def layout_candidates_for(
    slide_plan: SlidePlan,
    design: DesignOptions,
    previous_preset: SlotPreset | None,
    preset_usage: dict[SlotPreset, int],
    fallback: SlotPreset,
) -> list[LayoutCandidate]:
    variant = normalize_layout_variant(slide_plan.layout_variant, fallback)
    wants_media = media_intent_needs_slot(slide_plan.media_intent)
    composition = normalize_composition(slide_plan.visual_intent.composition)
    candidate_presets: set[SlotPreset] = {fallback}
    requested_slot_preset = slide_plan.requested_slot_preset
    if requested_slot_preset is not None:
        candidate_presets.add(requested_slot_preset)

    candidate_presets.update(
        slot_preset
        for slot_preset, preset in PRESET_REGISTRY.items()
        if preset.variant == variant
    )
    candidate_presets.update(presets_for_composition(composition))
    if wants_media:
        candidate_presets.update(
            slot_preset
            for slot_preset, preset in PRESET_REGISTRY.items()
            if preset_has_media_slot(preset)
        )

    candidates: list[LayoutCandidate] = []
    for slot_preset in PRESET_REGISTRY:
        if slot_preset not in candidate_presets:
            continue

        preset = PRESET_REGISTRY[slot_preset]
        has_media_slot = preset_has_media_slot(preset)
        if not wants_media and has_media_slot:
            continue

        score = 4 if slot_preset == fallback else 0
        if preset.variant == variant:
            score += 1
        if wants_media:
            score += 3 if has_media_slot else -2
        if PRESET_DENSITY[slot_preset] == design.density_target:
            score += 2
        score += composition_score(slot_preset, composition)
        if slot_preset == requested_slot_preset:
            score += 10
        score -= preset_usage.get(slot_preset, 0)
        if slide_plan.slide_type == "summary":
            score += 2 if preset.variant == "data" else 0
            score -= 4 if slot_preset == "quote_with_source" else 0
        if design.layout_diversity == "varied":
            if slot_preset == previous_preset:
                score -= 2
            score -= layout_stability_penalty(slot_preset, previous_preset)

        candidates.append(LayoutCandidate(slot_preset=slot_preset, score=score))

    return candidates


def normalize_composition(value: str) -> str:
    normalized = value.strip().casefold()
    if has_any(normalized, ["process", "step", "flow", "timeline", "sequence"]):
        return "process"
    if has_any(normalized, ["radial", "hub", "cycle"]):
        return "radial"
    if has_any(normalized, ["bubble", "cluster"]):
        return "bubble"
    if "split" in normalized or "two" in normalized:
        return "split"
    if "poster" in normalized or "cover" in normalized:
        return "poster"
    if "data" in normalized or "metric" in normalized:
        return "data"
    if "media" in normalized or "image" in normalized or "visual" in normalized:
        return "media"
    return ""


def presets_for_composition(composition: str) -> set[SlotPreset]:
    if composition == "split":
        return {
            "title_left_visual_right",
            "before_after",
            "us_vs_them",
            "quote_left_image_right",
        }
    if composition == "poster":
        return {"title_center", "title_full_bleed_image"}
    if composition == "data":
        return {"big_number_focus", "metric_cards", "insight_with_evidence"}
    if composition == "process":
        return {"before_after", "criteria_table", "insight_with_evidence"}
    if composition in {"radial", "bubble"}:
        return {"metric_cards", "insight_with_evidence"}
    if composition == "media":
        return {
            slot_preset
            for slot_preset, preset in PRESET_REGISTRY.items()
            if preset_has_media_slot(preset)
        }
    return set()


def composition_score(slot_preset: SlotPreset, composition: str) -> int:
    if not composition:
        return 0
    return 3 if slot_preset in presets_for_composition(composition) else -1


def layout_stability_penalty(
    slot_preset: SlotPreset,
    previous_preset: SlotPreset | None,
) -> int:
    if previous_preset is None:
        return 0

    preset = PRESET_REGISTRY[slot_preset]
    previous = PRESET_REGISTRY[previous_preset]
    penalty = 0
    title = slot_for_role(preset, "title")
    previous_title = slot_for_role(previous, "title")
    if title is not None and previous_title is not None and any(
        getattr(title, field) != getattr(previous_title, field)
        for field in ("x", "y", "width", "height")
    ):
        penalty += 8

    body = slot_for_role(preset, "body")
    previous_body = slot_for_role(previous, "body")
    if body is not None and previous_body is not None:
        if abs(body.y - previous_body.y) > 64:
            penalty += 5

    return penalty


def slot_for_role(preset: PresetConfig, role: str) -> LayoutSlot | None:
    return next((slot for slot in preset.slots if slot.role == role), None)


def media_intent_for_policy(
    media_intent: MediaIntent,
    media_policy: MediaPolicy,
) -> MediaIntent:
    if media_intent.kind == "none":
        return media_intent
    if media_intent.kind == "provided" and media_intent.src.strip():
        return media_intent
    if media_policy == "placeholder-ok":
        return media_intent
    return MediaIntent()


def media_intent_needs_slot(media_intent: MediaIntent) -> bool:
    if media_intent.kind == "none":
        return False
    if media_intent.kind == "provided":
        return bool(media_intent.src.strip()) or media_intent.required
    return True


def preset_has_media_slot(preset: PresetConfig) -> bool:
    return any(slot.role == "media" for slot in preset.slots)


def preset_for_slide_type(slide_type: SlideType) -> SlotPreset:
    return PRESET_BY_SLIDE_TYPE.get(slide_type, "insight_with_evidence")


def evidence_for(
    references: list[GenerateDeckReference],
    title: str,
) -> list[SourceEvidence]:
    return [
        SourceEvidence(fileId=reference.file_id, note=f"{title} 근거 후보", confidence=0.7)
        for reference in references[:2]
    ]


def direct_design(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> dict[str, Any]:
    profile = design_profile_for(raw_input, slide_plans)
    theme = {
        "name": f"{raw_input.template}-{profile['name']}-ai",
        "fontFamily": profile["bodyFontFamily"],
        "backgroundColor": profile["background"],
        "textColor": profile["text"],
        "accentColor": profile["accent"],
        "palette": {
            "primary": profile["accent"],
            "secondary": profile["secondary"],
            "surface": profile["surface"],
            "muted": profile["muted"],
            "border": profile["border"],
        },
        "typography": {
            "headingFontFamily": profile["headingFontFamily"],
            "bodyFontFamily": profile["bodyFontFamily"],
            "titleSize": profile["titleSize"],
            "headingSize": profile["headingSize"],
            "bodySize": profile["bodySize"],
            "captionSize": profile["captionSize"],
        },
        "effects": {"borderRadius": 8},
    }
    return apply_explicit_palette(theme, raw_input, slide_plans)


def apply_explicit_palette(
    theme: dict[str, Any],
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> dict[str, Any]:
    tokens = keyed_theme_tokens(raw_input, slide_plans)
    if tokens:
        return apply_keyed_theme_tokens(theme, tokens)

    semantic_palette = semantic_palette_for_sources(raw_input, slide_plans)
    if semantic_palette is not None:
        return apply_semantic_palette(theme, semantic_palette)

    colors = explicit_palette_colors(raw_input, slide_plans)
    if not colors:
        return theme

    neutral = next((color for color in colors if is_neutral_color(color)), None)
    accent_colors = [color for color in colors if not is_neutral_color(color)]

    if neutral is not None:
        theme["backgroundColor"] = neutral
        theme["textColor"] = text_color_for_background(neutral)
        theme["palette"]["surface"] = neutral

    if accent_colors:
        accent = accent_colors[0]
        theme["accentColor"] = accent
        theme["palette"]["primary"] = accent
        theme["palette"]["secondary"] = (
            accent_colors[1] if len(accent_colors) > 1 else accent
        )
        if neutral == "#ffffff" and accent == "#facc15":
            theme["palette"]["secondary"] = accent
            theme["palette"]["muted"] = "#fef9c3"
            theme["palette"]["border"] = "#fde68a"

    return theme


def semantic_palette_for_sources(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> dict[str, Any] | None:
    sources = [
        *[
            slide_plan.visual_intent.palette_hint
            for slide_plan in slide_plans or []
        ],
        raw_input.design_prompt,
    ]
    for source in sources:
        normalized = strip_theme_tokens(source).casefold()
        for profile in SEMANTIC_PALETTE_PROFILES.values():
            if has_any(normalized, profile["keywords"]):
                return profile
    return None


def apply_semantic_palette(
    theme: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    theme["backgroundColor"] = profile["background"]
    theme["textColor"] = profile["text"]
    theme["accentColor"] = profile["accent"]
    theme["palette"]["primary"] = profile["accent"]
    theme["palette"]["secondary"] = profile["secondary"]
    theme["palette"]["surface"] = profile["surface"]
    theme["palette"]["muted"] = profile["muted"]
    theme["palette"]["border"] = profile["border"]
    return theme


def keyed_theme_tokens(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> dict[str, str]:
    tokens: dict[str, str] = {}
    for source in palette_sources(raw_input, slide_plans):
        for match in THEME_TOKEN_RE.finditer(source):
            key = match.group(1).lower()
            if key not in tokens:
                tokens[key] = match.group(2).lower()
    return tokens


def apply_keyed_theme_tokens(
    theme: dict[str, Any],
    tokens: dict[str, str],
) -> dict[str, Any]:
    background = tokens.get("background")
    if background:
        theme["backgroundColor"] = background

    if "text" in tokens:
        theme["textColor"] = tokens["text"]
    elif background:
        theme["textColor"] = text_color_for_background(background)

    accent = tokens.get("accent")
    if accent:
        theme["accentColor"] = accent
        theme["palette"]["primary"] = accent
        theme["palette"]["secondary"] = accent

    for key in ("primary", "secondary", "surface", "muted", "border"):
        if key in tokens:
            theme["palette"][key] = tokens[key]

    if background and contrast_ratio(background, theme["textColor"]) < 4.5:
        theme["textColor"] = text_color_for_background(background)

    return theme


def explicit_palette_colors(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> list[str]:
    colors: list[str] = []
    for source in palette_sources(raw_input, slide_plans):
        source = strip_theme_tokens(source)
        for match in EXPLICIT_COLOR_RE.finditer(source):
            token = match.group(0).casefold()
            if token.startswith("#"):
                color = token.lower()
            else:
                color = EXPLICIT_COLOR_NAME_MAP[token]
            if color not in colors:
                colors.append(color)
    return colors


def palette_sources(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> list[str]:
    return [
        *[
            slide_plan.visual_intent.palette_hint
            for slide_plan in slide_plans or []
        ],
        raw_input.design_prompt,
        raw_input.prompt,
    ]


def strip_theme_tokens(source: str) -> str:
    return THEME_TOKEN_ANY_RE.sub(" ", source)


def is_neutral_color(color: str) -> bool:
    return color in NEUTRAL_COLORS


def text_color_for_background(color: str) -> str:
    dark = "#111827"
    light = "#f8fafc"
    return (
        dark
        if contrast_ratio(color, dark) >= contrast_ratio(color, light)
        else light
    )


def contrast_ratio(color_a: str, color_b: str) -> float:
    lighter = max(relative_luminance(color_a), relative_luminance(color_b))
    darker = min(relative_luminance(color_a), relative_luminance(color_b))
    return (lighter + 0.05) / (darker + 0.05)


def relative_luminance(color: str) -> float:
    values = [
        int(color[index : index + 2], 16) / 255
        for index in (1, 3, 5)
    ]
    channels = [
        value / 12.92
        if value <= 0.03928
        else ((value + 0.055) / 1.055) ** 2.4
        for value in values
    ]
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def design_profile_for(
    raw_input: RawInput,
    slide_plans: list[SlidePlan] | None = None,
) -> dict[str, Any]:
    rhythm_profile = design_profile_for_visual_rhythm(raw_input.design.visual_rhythm)
    if rhythm_profile is not None:
        return rhythm_profile

    palette_hints = [
        strip_theme_tokens(slide_plan.visual_intent.palette_hint)
        for slide_plan in slide_plans or []
    ]
    text = " ".join(
        [
            raw_input.topic,
            raw_input.prompt,
            strip_theme_tokens(raw_input.design_prompt),
            raw_input.metadata.audience,
            raw_input.metadata.purpose,
            raw_input.metadata.tone,
            *palette_hints,
        ]
    ).casefold()
    registry_profile = style_profile_for_text(text)
    if registry_profile is not None:
        return registry_profile

    if has_any(text, ["speech", "stt", "audio", "voice", "언어", "음성", "오디오", "방언"]):
        return {
            "name": "voice-tech",
            "headingFontFamily": "Noto Sans KR",
            "bodyFontFamily": "Noto Sans KR",
            "background": "#f7fbff",
            "surface": "#ffffff",
            "text": "#102033",
            "accent": "#1a73e8",
            "secondary": "#34a853",
            "muted": "#eef6ff",
            "border": "#c8daf4",
            "titleSize": 64,
            "headingSize": 42,
            "bodySize": 27,
            "captionSize": 17,
        }
    if raw_input.template == "lesson" or raw_input.metadata.purpose == "teach":
        return {
            "name": "lesson-green",
            "headingFontFamily": "Noto Sans KR",
            "bodyFontFamily": "Noto Sans KR",
            "background": "#fbfdf7",
            "surface": "#ffffff",
            "text": "#16251b",
            "accent": "#2f7d32",
            "secondary": "#e0a100",
            "muted": "#f0f7e8",
            "border": "#cfe2bd",
            "titleSize": 60,
            "headingSize": 40,
            "bodySize": 28,
            "captionSize": 18,
        }
    if raw_input.template == "pitch" or raw_input.metadata.purpose == "persuade":
        return {
            "name": "pitch-contrast",
            "headingFontFamily": "Montserrat",
            "bodyFontFamily": "Inter",
            "background": "#0f172a",
            "surface": "#172033",
            "text": "#f8fafc",
            "accent": "#22d3ee",
            "secondary": "#f59e0b",
            "muted": "#111827",
            "border": "#334155",
            "titleSize": 66,
            "headingSize": 44,
            "bodySize": 27,
            "captionSize": 17,
        }
    if raw_input.template == "report" or raw_input.metadata.audience == "executive":
        return {
            "name": "report-editorial",
            "headingFontFamily": "IBM Plex Sans",
            "bodyFontFamily": "Inter",
            "background": "#f8fafc",
            "surface": "#ffffff",
            "text": "#111827",
            "accent": "#0f766e",
            "secondary": "#7c3aed",
            "muted": "#eef2f7",
            "border": "#cbd5e1",
            "titleSize": 62,
            "headingSize": 42,
            "bodySize": 26,
            "captionSize": 17,
        }
    return STYLE_PROFILE_REGISTRY["startup-clean"]


def style_profile_for_text(text: str) -> dict[str, Any] | None:
    if has_any(
        text,
        [
            "splatoon",
            "platoon",
            "raiders",
            "neon ink",
            "스플래툰",
            "레이더스",
            "잉크",
            "네온",
            "게임",
            "비비드",
            "밝은",
            "형광",
            "캐주얼",
        ],
    ) or (
        "game" in text and has_any(text, ["ink", "neon"])
    ):
        return STYLE_PROFILE_REGISTRY["game-ink-neon"]
    if has_any(text, ["cyber", "security", "dark system", "terminal"]):
        return STYLE_PROFILE_REGISTRY["dark-cyber"]
    if has_any(text, ["startup", "saas", "product launch", "growth"]):
        return STYLE_PROFILE_REGISTRY["startup-clean"]
    if has_any(text, ["academic", "research", "paper", "report"]):
        return STYLE_PROFILE_REGISTRY["academic-report"]
    if has_any(text, ["editorial", "magazine", "story", "warm"]):
        return STYLE_PROFILE_REGISTRY["warm-editorial"]
    if has_any(text, ["kids", "children", "elementary", "classroom"]):
        return STYLE_PROFILE_REGISTRY["kids-education"]
    return None


def design_profile_for_visual_rhythm(
    visual_rhythm: VisualRhythm,
) -> dict[str, Any] | None:
    if visual_rhythm == "technical":
        return {
            "name": "voice-tech",
            "headingFontFamily": "Noto Sans KR",
            "bodyFontFamily": "Noto Sans KR",
            "background": "#f7fbff",
            "surface": "#ffffff",
            "text": "#102033",
            "accent": "#1a73e8",
            "secondary": "#34a853",
            "muted": "#eef6ff",
            "border": "#c8daf4",
            "titleSize": 64,
            "headingSize": 42,
            "bodySize": 27,
            "captionSize": 17,
        }
    if visual_rhythm == "editorial":
        return {
            "name": "report-editorial",
            "headingFontFamily": "IBM Plex Sans",
            "bodyFontFamily": "Inter",
            "background": "#f8fafc",
            "surface": "#ffffff",
            "text": "#111827",
            "accent": "#0f766e",
            "secondary": "#7c3aed",
            "muted": "#eef2f7",
            "border": "#cbd5e1",
            "titleSize": 62,
            "headingSize": 42,
            "bodySize": 26,
            "captionSize": 17,
        }
    if visual_rhythm == "bold":
        return {
            "name": "pitch-contrast",
            "headingFontFamily": "Montserrat",
            "bodyFontFamily": "Inter",
            "background": "#0f172a",
            "surface": "#172033",
            "text": "#f8fafc",
            "accent": "#22d3ee",
            "secondary": "#f59e0b",
            "muted": "#111827",
            "border": "#334155",
            "titleSize": 66,
            "headingSize": 44,
            "bodySize": 27,
            "captionSize": 17,
        }
    if visual_rhythm == "clean":
        return {
            "name": "default-clean",
            "headingFontFamily": "Inter",
            "bodyFontFamily": "Inter",
            "background": "#ffffff",
            "surface": "#ffffff",
            "text": "#111827",
            "accent": "#2563eb",
            "secondary": "#f59e0b",
            "muted": "#f8fafc",
            "border": "#d8dee9",
            "titleSize": 60,
            "headingSize": 42,
            "bodySize": 26,
            "captionSize": 18,
        }
    return None


def has_any(text: str, candidates: list[str]) -> bool:
    return any(candidate in text for candidate in candidates)


def plan_visuals(slide_plan: SlidePlan) -> VisualPlan:
    slot_preset = normalize_slot_preset(
        slide_plan.slot_preset,
        preset_for_slide_type(slide_plan.slide_type),
    )
    preset = PRESET_REGISTRY[slot_preset]
    layout = "chart-focus" if slide_plan.slide_type == "chart" else preset.layout
    intents = [
        ElementIntent(role="background"),
        ElementIntent(role="title", text=slide_plan.title),
        ElementIntent(role="body", text=slide_plan.message),
    ]
    if slide_plan.order == 1:
        intents.append(ElementIntent(role="footer", text="ORBIT AI 덱"))
    if slide_plan.slide_type == "chart":
        intents.append(ElementIntent(role="chart", text=slide_plan.title))

    return VisualPlan(
        slide_type=slide_plan.slide_type,
        layout=layout,
        layout_variant=normalize_layout_variant(
            slide_plan.layout_variant,
            slot_preset,
        ),
        slot_preset=slot_preset,
        visual_intent=slide_plan.visual_intent,
        media_intent=slide_plan.media_intent,
        intents=intents,
    )


def compose_layout(visual_plan: VisualPlan) -> LayoutPlan:
    if visual_plan.slide_type == "chart":
        return LayoutPlan(
            slots=[
                LayoutSlot(
                    role="background",
                    x=0,
                    y=0,
                    width=CANVAS.width,
                    height=CANVAS.height,
                    z_index=0,
                ),
                LayoutSlot(
                    role="title",
                    x=CANVAS.safe_x,
                    y=CANVAS.safe_y,
                    width=CANVAS.safe_width,
                    height=128,
                    z_index=3,
                ),
                LayoutSlot(
                    role="body",
                    x=CANVAS.safe_x,
                    y=240,
                    width=540,
                    height=560,
                    z_index=3,
                ),
                LayoutSlot(role="chart", x=760, y=250, width=920, height=500, z_index=3),
                LayoutSlot(
                    role="footer",
                    x=CANVAS.safe_x,
                    y=980,
                    width=CANVAS.safe_width,
                    height=36,
                    z_index=5,
                ),
            ]
        )

    return LayoutPlan(slots=list(PRESET_REGISTRY[visual_plan.slot_preset].slots))


def assemble_slide(
    raw_input: RawInput,
    slide_plan: SlidePlan,
    visual_plan: VisualPlan,
    theme: dict[str, Any],
) -> dict[str, Any]:
    layout = compose_layout(visual_plan)
    slot_by_role = {slot.role: slot for slot in layout.slots}
    elements = [
        element_for_intent(slide_plan, intent, slot_by_role[intent.role], theme)
        for intent in visual_plan.intents
        if intent.role in slot_by_role
    ]
    elements.extend(media_elements(slide_plan, visual_plan, slot_by_role, theme))
    elements.extend(design_elements(slide_plan, visual_plan, theme))
    elements = cap_elements(elements)
    title_element = next(element for element in elements if element["role"] == "title")

    return {
        "slideId": f"slide_{slide_plan.order}",
        "order": slide_plan.order,
        "title": slide_plan.title,
        "thumbnailUrl": "",
        "style": {
            "layout": visual_plan.layout,
            "backgroundColor": theme["backgroundColor"],
            "textColor": theme["textColor"],
            "accentColor": theme["accentColor"],
        },
        "speakerNotes": slide_plan.speaker_notes,
        "elements": elements,
        "keywords": [
            {
                "keywordId": f"kw_{slide_plan.order}_{index}",
                "text": keyword,
                "synonyms": [],
                "abbreviations": [],
            }
            for index, keyword in enumerate(slide_plan.keywords, start=1)
        ],
        "animations": [
            {
                "animationId": f"anim_{slide_plan.order}_1",
                "elementId": title_element["elementId"],
                "type": "fade-in",
                "order": 1,
                "durationMs": 400,
                "delayMs": 0,
                "easing": "ease-out",
            }
        ],
        "aiNotes": {
            "emphasisPoints": [slide_plan.message],
            "sourceEvidence": [
                evidence.model_dump(by_alias=True) for evidence in slide_plan.evidence
            ],
        },
    }


def design_elements(
    slide_plan: SlidePlan,
    visual_plan: VisualPlan,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    density = normalize_decoration_density(
        visual_plan.visual_intent.decoration_density,
    )
    emphasis_style = normalize_emphasis_style(
        visual_plan.visual_intent.emphasis_style,
    )
    composition = normalize_composition(visual_plan.visual_intent.composition)
    if (
        not emphasis_style
        and slide_plan.order == 1
        and slide_plan.keywords
        and not is_diagram_composition(composition)
    ):
        emphasis_style = "keyword-chips"
    elements = [
        shape_element(
            slide_plan.order,
            "accent_rail",
            "decoration",
            0,
            0,
            34,
            CANVAS.height,
            1,
            theme["accentColor"],
            "transparent",
        ),
    ]

    if density in ("medium", "high"):
        elements.append(
            shape_element(
                slide_plan.order,
                "section_label_chip",
                "decoration",
                CANVAS.safe_x - 18,
                40,
                260,
                44,
                1,
                theme["palette"]["surface"],
                theme["palette"]["border"],
                22,
            )
        )
    elements.append(
        text_element(
            slide_plan.order,
            "section_label",
            "caption",
            visual_plan.slide_type.replace("-", " ").upper(),
            CANVAS.safe_x,
            50,
            220,
            24,
            2,
            theme["accentColor"],
            theme["typography"]["captionSize"],
            "bold",
            theme["typography"]["headingFontFamily"],
        )
    )

    if density == "high":
        elements.extend(
            [
                shape_element(
                    slide_plan.order,
                    "top_stripe",
                    "decoration",
                    0,
                    0,
                    CANVAS.width,
                    18,
                    1,
                    theme["palette"]["secondary"],
                    "transparent",
                ),
                shape_element(
                    slide_plan.order,
                    "diagonal_block",
                    "decoration",
                    1460,
                    86,
                    360,
                    84,
                    1,
                    theme["palette"]["border"],
                    "transparent",
                    0,
                    16,
                ),
            ]
        )

    metric_card_caption = visual_plan.visual_intent.metric_card_caption.strip()
    if (
        metric_card_caption
        and visual_plan.slot_preset in {"metric_cards", "big_number_focus"}
    ):
        card_x = 1028
        card_y = 246
        card_width = 700
        card_height = 500
        card_z_index = 2
        elements.extend(
            [
                shape_element(
                    slide_plan.order,
                    "metric_card",
                    "decoration",
                    card_x,
                    card_y,
                    card_width,
                    card_height,
                    card_z_index,
                    theme["palette"]["surface"],
                    theme["palette"]["border"],
                    8,
                ),
                text_element(
                    slide_plan.order,
                    "metric_card_caption",
                    "caption",
                    metric_card_caption,
                    card_x + 44,
                    card_y + 44,
                    card_width - 88,
                    card_height - 88,
                    card_z_index + 1,
                    theme["textColor"],
                    theme["typography"]["bodySize"],
                    "bold",
                    theme["typography"]["headingFontFamily"],
                ),
            ]
        )
    if visual_plan.layout_variant == "comparison":
        elements.append(
            shape_element(
                slide_plan.order,
                "comparison_divider",
                "decoration",
                930,
                250,
                3,
                520,
                2,
                theme["accentColor"],
                "transparent",
            )
        )
    if visual_plan.layout_variant == "quote":
        elements.append(
            shape_element(
                slide_plan.order,
                "quote_block",
                "decoration",
                250,
                280,
                1420,
                440,
                2,
                theme["palette"]["surface"],
                theme["palette"]["border"],
                8,
            )
        )

    elements.extend(diagram_elements(slide_plan, composition, theme))

    if emphasis_style == "keyword-chips" and slide_plan.order == 1:
        elements.extend(keyword_chip_elements(slide_plan, theme))

    return elements


def is_diagram_composition(composition: str) -> bool:
    return composition in {"process", "radial", "bubble"}


def diagram_elements(
    slide_plan: SlidePlan,
    composition: str,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    if composition == "process":
        return process_diagram_elements(slide_plan, theme)
    if composition == "radial":
        return radial_diagram_elements(slide_plan, theme)
    if composition == "bubble":
        return bubble_diagram_elements(slide_plan, theme)
    return []


def diagram_labels(slide_plan: SlidePlan, count: int) -> list[str]:
    labels = [keyword.strip() for keyword in slide_plan.keywords if keyword.strip()]
    while len(labels) < count:
        labels.append(f"STEP {len(labels) + 1}")
    return labels[:count]


def process_diagram_elements(
    slide_plan: SlidePlan,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    labels = diagram_labels(slide_plan, 4)
    elements: list[dict[str, Any]] = []
    for index, label in enumerate(labels):
        x = 210 + index * 380
        y = 790
        elements.extend(
            [
                custom_shape_element(
                    slide_plan.order,
                    f"process_step_{index + 1}",
                    "highlight",
                    x,
                    y,
                    320,
                    76,
                    4,
                    "M 0 0 L 270 0 L 320 38 L 270 76 L 0 76 L 48 38 Z",
                    320,
                    76,
                    theme["palette"]["surface"],
                    theme["accentColor"],
                ),
                text_element(
                    slide_plan.order,
                    f"process_step_{index + 1}_label",
                    "highlight",
                    label,
                    x + 42,
                    y + 22,
                    220,
                    32,
                    5,
                    theme["textColor"],
                    theme["typography"]["captionSize"] + 4,
                    "bold",
                    theme["typography"]["headingFontFamily"],
                ),
            ]
        )
    return elements


def radial_diagram_elements(
    slide_plan: SlidePlan,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    labels = diagram_labels(slide_plan, 4)
    elements = [
        shape_element(
            slide_plan.order,
            "radial_hub",
            "highlight",
            840,
            648,
            240,
            240,
            4,
            theme["palette"]["surface"],
            theme["accentColor"],
            element_type="ellipse",
        )
    ]
    positions = [(540, 628), (1140, 628), (660, 820), (1020, 820)]
    for index, (x, y) in enumerate(positions):
        elements.extend(
            [
                shape_element(
                    slide_plan.order,
                    f"radial_node_{index + 1}",
                    "highlight",
                    x,
                    y,
                    190,
                    112,
                    5,
                    theme["palette"]["muted"],
                    theme["accentColor"],
                    element_type="ellipse",
                ),
                text_element(
                    slide_plan.order,
                    f"radial_node_{index + 1}_label",
                    "highlight",
                    labels[index],
                    x + 28,
                    y + 39,
                    134,
                    34,
                    6,
                    theme["textColor"],
                    theme["typography"]["captionSize"] + 3,
                    "bold",
                    theme["typography"]["bodyFontFamily"],
                ),
            ]
        )
    return elements


def bubble_diagram_elements(
    slide_plan: SlidePlan,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    labels = diagram_labels(slide_plan, 5)
    positions = [
        (470, 660, 220),
        (750, 604, 250),
        (1050, 664, 220),
        (680, 820, 210),
        (980, 820, 210),
    ]
    elements: list[dict[str, Any]] = []
    for index, (x, y, size) in enumerate(positions):
        elements.extend(
            [
                shape_element(
                    slide_plan.order,
                    f"bubble_{index + 1}",
                    "highlight",
                    x,
                    y,
                    size,
                    size,
                    4,
                    theme["palette"]["surface"],
                    theme["accentColor"],
                    element_type="ellipse",
                ),
                text_element(
                    slide_plan.order,
                    f"bubble_{index + 1}_label",
                    "highlight",
                    labels[index],
                    x + 36,
                    y + size // 2 - 18,
                    size - 72,
                    36,
                    5,
                    theme["textColor"],
                    theme["typography"]["captionSize"] + 3,
                    "bold",
                    theme["typography"]["bodyFontFamily"],
                ),
            ]
        )
    return elements


def normalize_decoration_density(value: str) -> str:
    normalized = value.strip().casefold()
    if normalized in {"none", "minimal", "low"}:
        return "low"
    if normalized in {"high", "rich", "dense", "decorative"}:
        return "high"
    return "medium"


def normalize_emphasis_style(value: str) -> str:
    normalized = value.strip().casefold()
    if has_any(
        normalized,
        ["chip", "keyword", "키워드", "강조", "칩", "하이라이트"],
    ):
        return "keyword-chips"
    return ""


def keyword_chip_elements(
    slide_plan: SlidePlan,
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    for index, keyword in enumerate(slide_plan.keywords[:3]):
        width = min(260, max(144, 42 + len(keyword) * 12))
        x = CANVAS.safe_x + index * 286
        y = 870
        elements.extend(
            [
                shape_element(
                    slide_plan.order,
                    f"keyword_chip_{index + 1}",
                    "decoration",
                    x,
                    y,
                    width,
                    52,
                    4,
                    theme["palette"]["surface"],
                    theme["accentColor"],
                    26,
                ),
                text_element(
                    slide_plan.order,
                    f"keyword_chip_{index + 1}_text",
                    "caption",
                    keyword,
                    x + 20,
                    y + 13,
                    width - 40,
                    26,
                    5,
                    theme["accentColor"],
                    theme["typography"]["captionSize"] + 2,
                    "bold",
                    theme["typography"]["bodyFontFamily"],
                ),
            ]
        )
    return elements


def media_elements(
    slide_plan: SlidePlan,
    visual_plan: VisualPlan,
    slot_by_role: dict[str, LayoutSlot],
    theme: dict[str, Any],
) -> list[dict[str, Any]]:
    media = visual_plan.media_intent
    if media.kind == "none":
        return []

    slot = slot_by_role.get("media") or slot_by_role.get("highlight")
    if slot is None:
        slot = LayoutSlot(role="media", x=1020, y=280, width=660, height=420, z_index=3)
    src = media.src.strip()
    if media.kind == "provided" and src:
        return [
            image_element(
                slide_plan.order,
                "media",
                "media",
                src,
                media.alt or media.caption or slide_plan.title,
                slot,
            )
        ]
    if media.kind == "provided" and not media.required:
        return []

    caption = media.caption or media.alt or "이미지 자리 표시자"
    rationale = media.rationale or media.prompt or "이미지 provider가 없어 자리 표시자를 사용했습니다."
    return [
        shape_element(
            slide_plan.order,
            "media_placeholder",
            "media",
            slot.x,
            slot.y,
            slot.width,
            slot.height,
            slot.z_index,
            theme["palette"]["muted"],
            theme["palette"]["border"],
            8,
        ),
        text_element(
            slide_plan.order,
            "media_placeholder_caption",
            "caption",
            f"{caption}\n{rationale}",
            slot.x + 44,
            slot.y + 44,
            max(120, slot.width - 88),
            max(80, slot.height - 88),
            slot.z_index + 1,
            theme["textColor"],
            theme["typography"]["captionSize"] + 4,
            "medium",
            theme["typography"]["bodyFontFamily"],
        ),
    ]


def element_for_intent(
    slide_plan: SlidePlan,
    intent: ElementIntent,
    slot: LayoutSlot,
    theme: dict[str, Any],
) -> dict[str, Any]:
    base = {
        "elementId": f"el_{slide_plan.order}_{intent.role}",
        "type": "text",
        "role": intent.role,
        "x": slot.x,
        "y": slot.y,
        "width": slot.width,
        "height": slot.height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": slot.z_index,
        "locked": False,
        "visible": True,
    }
    if intent.role == "background":
        return {
            **base,
            "type": "rect",
            "locked": True,
            "props": {
                "fill": theme["palette"]["muted"],
                "stroke": "transparent",
                "strokeWidth": 0,
                "borderRadius": 0,
            },
        }
    if intent.role == "highlight":
        return {
            **base,
            "type": "rect",
            "props": {
                "fill": theme["palette"]["surface"],
                "stroke": theme["accentColor"],
                "strokeWidth": 3,
                "borderRadius": 8,
            },
        }
    if intent.role == "chart":
        return {
            **base,
            "type": "chart",
            "props": {
                "type": "bar",
                "title": intent.text,
                "data": [
                    {"label": "현재", "value": 40},
                    {"label": "목표", "value": 75},
                    {"label": "확장", "value": 90},
                ],
                "style": {
                    "colors": [theme["accentColor"], "#f59e0b"],
                    "showLegend": False,
                    "showGrid": True,
                },
            },
        }

    font_size = (
        theme["typography"]["titleSize"]
        if intent.role == "title"
        else theme["typography"]["bodySize"]
    )
    font_family = (
        theme["typography"]["headingFontFamily"]
        if intent.role == "title"
        else theme["typography"]["bodyFontFamily"]
    )
    if intent.role == "footer":
        font_size = theme["typography"]["captionSize"]
    return {
        **base,
        "props": {
            "text": intent.text,
            "fontFamily": font_family,
            "fontSize": font_size,
            "fontWeight": "bold" if intent.role == "title" else "normal",
            "color": theme["textColor"],
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.12 if intent.role == "title" else 1.22,
        },
    }


def shape_element(
    order: int,
    name: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    fill: str,
    stroke: str,
    border_radius: int = 0,
    rotation: int = 0,
    element_type: str = "rect",
) -> dict[str, Any]:
    return {
        "elementId": f"el_{order}_{name}",
        "type": element_type,
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": rotation,
        "opacity": 1,
        "zIndex": z_index,
        "locked": False,
        "visible": True,
        "props": {
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": 0 if stroke == "transparent" else 2,
            "borderRadius": border_radius,
        },
    }


def custom_shape_element(
    order: int,
    name: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    path_data: str,
    view_box_width: int,
    view_box_height: int,
    fill: str,
    stroke: str,
) -> dict[str, Any]:
    return {
        "elementId": f"el_{order}_{name}",
        "type": "customShape",
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": z_index,
        "locked": False,
        "visible": True,
        "props": {
            "pathData": path_data,
            "viewBoxWidth": view_box_width,
            "viewBoxHeight": view_box_height,
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": 2,
            "closed": True,
            "nodes": [],
        },
    }


def cap_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(elements) <= 14:
        return elements
    required = [element for element in elements if is_required_element(element)]
    priority = [
        element
        for element in elements
        if not is_required_element(element) and is_priority_element(element)
    ]
    optional = [
        element
        for element in elements
        if not is_required_element(element) and not is_priority_element(element)
    ]
    return [*required, *priority, *optional][:14]


def is_required_element(element: dict[str, Any]) -> bool:
    return element.get("role") in {
        "background",
        "title",
        "subtitle",
        "body",
        "footer",
        "media",
        "chart",
    } or element.get("type") == "chart"


def is_priority_element(element: dict[str, Any]) -> bool:
    element_id = str(element.get("elementId", ""))
    return element.get("role") == "highlight" or any(
        token in element_id
        for token in (
            "keyword_chip",
            "process_step",
            "radial_",
            "bubble_",
            "metric_card",
            "top_stripe",
        )
    )


def image_element(
    order: int,
    name: str,
    role: str,
    src: str,
    alt: str,
    slot: LayoutSlot,
) -> dict[str, Any]:
    return {
        "elementId": f"el_{order}_{name}",
        "type": "image",
        "role": role,
        "x": slot.x,
        "y": slot.y,
        "width": slot.width,
        "height": slot.height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": slot.z_index,
        "locked": False,
        "visible": True,
        "props": {
            "src": src,
            "alt": alt,
            "fit": "cover",
        },
    }


def text_element(
    order: int,
    name: str,
    role: str,
    text: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    color: str,
    font_size: int,
    font_weight: str,
    font_family: str = "Inter",
) -> dict[str, Any]:
    return {
        "elementId": f"el_{order}_{name}",
        "type": "text",
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": z_index,
        "locked": False,
        "visible": True,
        "props": {
            "text": text,
            "fontFamily": font_family,
            "fontSize": font_size,
            "fontWeight": font_weight,
            "color": color,
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.15,
        },
    }


def validate_and_patch(deck: dict[str, Any]) -> tuple[dict[str, Any], ValidationResult]:
    layout_issues = validate_layout(deck)
    content_issues = validate_content(deck)
    design_issues = validate_design(deck)
    presentation_issues = validate_presentation(deck)
    issues = layout_issues + content_issues + presentation_issues
    if issues:
        deck = patch_deck(deck)
        layout_issues = validate_layout(deck)
        content_issues = validate_content(deck)
        design_issues = validate_design(deck)
        presentation_issues = validate_presentation(deck)

    return deck, ValidationResult(
        passed=not (
            layout_issues
            or content_issues
            or presentation_issues
        ),
        layoutIssues=layout_issues,
        contentIssues=content_issues,
        designIssues=design_issues,
        presentationIssues=presentation_issues,
    )


def validate_layout(deck: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for slide_index, slide in enumerate(deck["slides"]):
        elements = slide["elements"]
        if len(elements) > 14:
            issues.append(
                ValidationIssue(
                    scope="slide",
                    path=f"slides.{slide_index}.elements",
                    message="슬라이드 요소가 너무 많습니다.",
                )
            )
        for element_index, element in enumerate(elements):
            if element["width"] <= 0 or element["height"] <= 0:
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}",
                        message="요소의 너비와 높이는 0보다 커야 합니다.",
                    )
                )
            if element["x"] + element["width"] > CANVAS.width:
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}.x",
                        message="요소가 캔버스 너비를 벗어났습니다.",
                    )
                )
            if element["y"] + element["height"] > CANVAS.height:
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}.y",
                        message="요소가 캔버스 높이를 벗어났습니다.",
                    )
                )
    return issues


def validate_content(deck: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    topic = deck["metadata"]["createdFrom"]["topic"]
    if topic not in deck["title"]:
        issues.append(
            ValidationIssue(
                scope="deck",
                path="title",
                message="덱 제목에는 생성 주제가 포함되어야 합니다.",
            )
        )
    for slide_index, slide in enumerate(deck["slides"]):
        if not slide["title"].strip():
            issues.append(
                ValidationIssue(
                    scope="slide",
                    path=f"slides.{slide_index}.title",
                    message="슬라이드 제목은 비어 있을 수 없습니다.",
                )
            )
        if not slide["speakerNotes"]:
            issues.append(
                ValidationIssue(
                    scope="slide",
                    path=f"slides.{slide_index}.speakerNotes",
                    message="발표자 노트가 필요합니다.",
                )
            )
    return issues


def validate_design(deck: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for slide_index, slide in enumerate(deck["slides"]):
        elements = slide["elements"]
        for element_index, element in enumerate(elements):
            element_id = element["elementId"]
            if element_id.endswith("_media_placeholder"):
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}",
                        message="이미지 소스가 없어 자리 표시자를 생성했습니다.",
                    )
                )
            if (
                element["type"] == "chart"
                and slide.get("style", {}).get("layout") != "chart-focus"
            ):
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}",
                        message="차트 슬라이드가 아닌 곳에 차트 요소가 있습니다.",
                    )
                )
        backgrounds = [element for element in elements if element.get("role") == "background"]
        text_elements = [element for element in elements if element["type"] == "text"]
        if backgrounds and text_elements:
            max_background_z = max(element["zIndex"] for element in backgrounds)
            min_text_z = min(element["zIndex"] for element in text_elements)
            if max_background_z >= min_text_z:
                issues.append(
                    ValidationIssue(
                        scope="slide",
                        path=f"slides.{slide_index}.elements",
                        message="배경 요소가 텍스트보다 위에 있습니다.",
                    )
                )
    return issues


def validate_presentation(deck: dict[str, Any]) -> list[ValidationIssue]:
    if len(deck["slides"]) < 1:
        return [
            ValidationIssue(
                scope="deck",
                path="slides",
                message="덱에는 슬라이드가 최소 1장 필요합니다.",
            )
        ]
    return []


def patch_deck(deck: dict[str, Any]) -> dict[str, Any]:
    for slide in deck["slides"]:
        slide["elements"] = cap_elements(slide["elements"])
        for element in slide["elements"]:
            element["x"] = max(0, min(element["x"], CANVAS.width - 1))
            element["y"] = max(0, min(element["y"], CANVAS.height - 1))
            element["width"] = max(1, min(element["width"], CANVAS.width - element["x"]))
            element["height"] = max(1, min(element["height"], CANVAS.height - element["y"]))
        for z_index, element in enumerate(
            sorted(slide["elements"], key=lambda item: item["zIndex"])
        ):
            element["zIndex"] = z_index
    return deck


def safe_token(value: str) -> str:
    token = "".join(character if character.isalnum() else "_" for character in value)
    return token.strip("_") or "deck"
