from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Audience = Literal["general", "executive", "technical", "sales"]
Purpose = Literal["inform", "persuade", "teach", "report"]
Tone = Literal["professional", "friendly", "confident", "concise"]
Template = Literal["default", "pitch", "report", "lesson"]
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
    references: list[GenerateDeckReference] = Field(default_factory=list)
    reference_keywords: list[GenerateDeckReferenceKeyword] = Field(
        default_factory=list,
        alias="referenceKeywords",
    )


class RawInput(BaseModel):
    project_id: str
    topic: str
    prompt: str
    target_duration_minutes: int
    slide_count: int
    template: Template
    metadata: GenerateDeckMetadata
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
    emphasis: str = ""
    mood: str = ""
    structure: str = ""


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
    "summary": "quote_with_source",
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

DECK_CONTENT_INSTRUCTIONS = """
You create Korean presentation slide content for ORBIT.
Return only JSON that matches the requested schema.

Rules:
- Ground the deck in the topic, user prompt, reference keywords, and reference excerpts.
- Write concrete slide titles, body messages, and speaker notes for the actual subject.
- Choose slideType, layoutVariant, slotPreset, visualIntent, and mediaIntent.
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
                                },
                                "required": ["emphasis", "mood", "structure"],
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
    theme = direct_design(raw_input)
    slides = [
        assemble_slide(raw_input, slide_plan, plan_visuals(slide_plan), theme)
        for slide_plan in slide_plans
    ]
    deck = {
        "deckId": f"deck_ai_{safe_token(raw_input.project_id)}",
        "projectId": raw_input.project_id,
        "title": outline.title,
        "version": 1,
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
    return RawInput(
        project_id=request.project_id,
        topic=request.topic.strip(),
        prompt=request.prompt.strip(),
        target_duration_minutes=request.target_duration_minutes,
        slide_count=slide_count,
        template=request.template,
        metadata=request.metadata,
        references=request.references,
        reference_keywords=request.reference_keywords,
        reference_context=reference_context or [],
    )


def choose_slide_count(target_minutes: int, slide_range: SlideCountRange) -> int:
    suggested = max(slide_range.min, round(target_minutes / 2))
    return min(slide_range.max, suggested)


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
    return (
        f"{order}번째 슬라이드에서는 '{title}'를 중심으로 {raw_input.topic}를 설명합니다. "
        f"{message} 참고자료 키워드와 연결되는 구체적인 예시를 함께 언급합니다."
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

    if len(plan.slides) < raw_input.slide_count:
        raise DeckContentGenerationError(
            "LLM returned fewer slides than requested."
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
            f"Slide count: {raw_input.slide_count}",
            f"Audience: {raw_input.metadata.audience}",
            f"Purpose: {raw_input.metadata.purpose}",
            f"Tone: {raw_input.metadata.tone}",
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
        slot_preset = normalize_slot_preset(
            slide.slot_preset,
            preset_for_slide_type(slide_type),
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
                    slot_preset,
                ),
                slot_preset=slot_preset,
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


def direct_design(raw_input: RawInput) -> dict[str, Any]:
    accent = {
        "inform": "#2563eb",
        "persuade": "#0f766e",
        "teach": "#7c3aed",
        "report": "#334155",
    }[raw_input.metadata.purpose]
    return {
        "name": f"{raw_input.template}-ai",
        "fontFamily": "Inter",
        "backgroundColor": "#ffffff",
        "textColor": "#111827",
        "accentColor": accent,
        "palette": {
            "primary": accent,
            "secondary": "#f59e0b",
            "surface": "#ffffff",
            "muted": "#f8fafc",
            "border": "#d8dee9",
        },
        "typography": {
            "headingFontFamily": "Inter",
            "bodyFontFamily": "Inter",
            "titleSize": 60,
            "headingSize": 42,
            "bodySize": 26,
            "captionSize": 18,
        },
        "effects": {"borderRadius": 8},
    }


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
        ElementIntent(role="footer", text="ORBIT AI 덱"),
    ]
    if slide_plan.slide_type == "chart":
        intents.append(ElementIntent(role="chart", text=slide_plan.title))
    elif any(slot.role == "highlight" for slot in preset.slots):
        intents.append(ElementIntent(role="highlight", text="핵심 포인트"))

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
            18,
            "bold",
        ),
    ]

    if any(intent.role == "highlight" for intent in visual_plan.intents):
        elements.append(
            text_element(
                slide_plan.order,
                "highlight_text",
                "highlight",
                "핵심\n" + slide_plan.message[:72],
                1064,
                322,
                570,
                240,
                4,
                theme["textColor"],
                32,
                "bold",
            )
        )
    if visual_plan.layout_variant == "data":
        elements.append(
            shape_element(
                slide_plan.order,
                "metric_card",
                "decoration",
                1028,
                246,
                700,
                500,
                2,
                "#ffffff",
                theme["palette"]["border"],
                8,
            )
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
                "#ffffff",
                theme["palette"]["border"],
                8,
            )
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
            22,
            "medium",
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
                "fill": "#ffffff",
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

    font_size = 60 if intent.role == "title" else 26
    if intent.role == "footer":
        font_size = 18
    return {
        **base,
        "props": {
            "text": intent.text,
            "fontFamily": "Inter",
            "fontSize": font_size,
            "fontWeight": "bold" if intent.role == "title" else "normal",
            "color": theme["textColor"],
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.2,
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
) -> dict[str, Any]:
    return {
        "elementId": f"el_{order}_{name}",
        "type": "rect",
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
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": 0 if stroke == "transparent" else 2,
            "borderRadius": border_radius,
        },
    }


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
            "fontFamily": "Inter",
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
        if len(slide["elements"]) > 14:
            required = [
                element
                for element in slide["elements"]
                if element.get("role") != "decoration"
            ]
            optional = [
                element
                for element in slide["elements"]
                if element.get("role") == "decoration"
            ]
            slide["elements"] = [*required, *optional][:14]
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
