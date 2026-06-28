from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Audience = Literal["general", "executive", "technical", "sales"]
Purpose = Literal["inform", "persuade", "teach", "report"]
Tone = Literal["professional", "friendly", "confident", "concise"]
Template = Literal["default", "pitch", "report", "lesson"]
SlideType = Literal[
    "cover",
    "problem",
    "solution",
    "feature-grid",
    "process",
    "comparison",
    "architecture",
    "chart",
    "summary",
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


class DeckOutline(BaseModel):
    title: str
    slide_titles: list[str]


class SourceEvidence(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    note: str
    confidence: float = 0.7


class SlidePlan(BaseModel):
    order: int
    slide_type: SlideType
    title: str
    message: str
    speaker_notes: str
    keywords: list[str]
    evidence: list[SourceEvidence]


class ElementIntent(BaseModel):
    role: Literal["background", "title", "subtitle", "body", "highlight", "footer", "chart"]
    text: str = ""


class VisualPlan(BaseModel):
    slide_type: SlideType
    layout: DeckLayout
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


@dataclass(frozen=True)
class Canvas:
    width: int = 1920
    height: int = 1080
    safe_x: int = 120
    safe_y: int = 88
    safe_width: int = 1680
    safe_height: int = 904


CANVAS = Canvas()
SLIDE_TYPE_SEQUENCE: list[SlideType] = [
    "cover",
    "problem",
    "solution",
    "feature-grid",
    "process",
    "comparison",
    "architecture",
    "chart",
    "summary",
]
LAYOUT_BY_SLIDE_TYPE: dict[SlideType, DeckLayout] = {
    "cover": "title",
    "problem": "title-content",
    "solution": "two-column",
    "feature-grid": "two-column",
    "process": "title-content",
    "comparison": "two-column",
    "architecture": "image-right",
    "chart": "chart-focus",
    "summary": "closing",
}


def generate_deck(request: GenerateDeckRequest) -> GenerateDeckResponse:
    raw_input = analyze_input(request)
    outline = plan_presentation(raw_input)
    slide_plans = plan_slides(raw_input, outline)
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


def analyze_input(request: GenerateDeckRequest) -> RawInput:
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
    )


def choose_slide_count(target_minutes: int, slide_range: SlideCountRange) -> int:
    suggested = max(slide_range.min, round(target_minutes / 2))
    return min(slide_range.max, suggested)


def plan_presentation(raw_input: RawInput) -> DeckOutline:
    titles = [
        title_for_slide(raw_input.topic, index, raw_input.slide_count)
        for index in range(1, raw_input.slide_count + 1)
    ]
    return DeckOutline(title=f"{raw_input.topic} 발표안", slide_titles=titles)


def title_for_slide(topic: str, order: int, total: int) -> str:
    if order == 1:
        return topic
    if order == total:
        return "정리와 다음 단계"

    middle_titles = [
        "현재 과제",
        "해결 방향",
        "핵심 구성",
        "진행 흐름",
        "비교와 선택 기준",
        "아키텍처",
        "지표와 기대 효과",
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
    base = raw_input.prompt or f"{raw_input.topic}의 핵심 흐름을 명확하게 전달합니다."
    if slide_type == "cover":
        return f"{raw_input.topic}의 목적과 기대 결과를 한 문장으로 소개합니다."
    if slide_type == "summary":
        return "결정 사항, 실행 순서, 후속 검증 기준을 정리합니다."
    return f"{title}: {base}"


def speaker_notes_for(raw_input: RawInput, title: str, message: str, order: int) -> str:
    return (
        f"{order}번째 슬라이드에서는 '{title}'를 중심으로 설명합니다. "
        f"{message} 청중이 다음 행동을 이해하도록 사례와 근거를 함께 언급합니다."
    )


def keywords_for(topic: str, prompt: str) -> list[str]:
    words = [word.strip(" ,.;:()[]{}") for word in f"{topic} {prompt}".split()]
    unique = [word for index, word in enumerate(words) if word and word not in words[:index]]
    return (unique or [topic])[:5]


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
    intents = [
        ElementIntent(role="background"),
        ElementIntent(role="title", text=slide_plan.title),
        ElementIntent(role="body", text=slide_plan.message),
        ElementIntent(role="footer", text="ORBIT AI deck"),
    ]
    if slide_plan.slide_type == "chart":
        intents.append(ElementIntent(role="chart", text=slide_plan.title))
    elif slide_plan.slide_type in {"solution", "feature-grid", "comparison"}:
        intents.append(ElementIntent(role="highlight", text="핵심 포인트"))

    return VisualPlan(
        slide_type=slide_plan.slide_type,
        layout=LAYOUT_BY_SLIDE_TYPE[slide_plan.slide_type],
        intents=intents,
    )


def compose_layout(visual_plan: VisualPlan) -> LayoutPlan:
    slots = [
        LayoutSlot(role="background", x=0, y=0, width=CANVAS.width, height=CANVAS.height, z_index=0),
        LayoutSlot(role="title", x=CANVAS.safe_x, y=CANVAS.safe_y, width=CANVAS.safe_width, height=128, z_index=2),
        LayoutSlot(role="footer", x=CANVAS.safe_x, y=980, width=CANVAS.safe_width, height=36, z_index=5),
    ]

    if visual_plan.layout in {"two-column", "image-right"}:
        slots.extend(
            [
                LayoutSlot(role="body", x=CANVAS.safe_x, y=260, width=780, height=560, z_index=3),
                LayoutSlot(role="highlight", x=1020, y=280, width=660, height=420, z_index=3),
            ]
        )
    elif visual_plan.layout == "chart-focus":
        slots.extend(
            [
                LayoutSlot(role="body", x=CANVAS.safe_x, y=240, width=540, height=560, z_index=3),
                LayoutSlot(role="chart", x=760, y=250, width=920, height=500, z_index=3),
            ]
        )
    else:
        slots.append(
            LayoutSlot(role="body", x=CANVAS.safe_x, y=280, width=CANVAS.safe_width, height=480, z_index=3)
        )

    return LayoutPlan(slots=slots)


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

    if visual_plan.layout in {"two-column", "image-right"}:
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

    return elements


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
    presentation_issues = validate_presentation(deck)
    issues = layout_issues + content_issues + presentation_issues
    if issues:
        deck = patch_deck(deck)
        layout_issues = validate_layout(deck)
        content_issues = validate_content(deck)
        presentation_issues = validate_presentation(deck)

    return deck, ValidationResult(
        passed=not (layout_issues or content_issues or presentation_issues),
        layoutIssues=layout_issues,
        contentIssues=content_issues,
        designIssues=[],
        presentationIssues=presentation_issues,
    )


def validate_layout(deck: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for slide_index, slide in enumerate(deck["slides"]):
        elements = slide["elements"]
        if len(elements) > 8:
            issues.append(
                ValidationIssue(
                    scope="slide",
                    path=f"slides.{slide_index}.elements",
                    message="slide has too many elements",
                )
            )
        for element_index, element in enumerate(elements):
            if element["x"] + element["width"] > CANVAS.width:
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}.x",
                        message="element exceeds canvas width",
                    )
                )
            if element["y"] + element["height"] > CANVAS.height:
                issues.append(
                    ValidationIssue(
                        scope="element",
                        path=f"slides.{slide_index}.elements.{element_index}.y",
                        message="element exceeds canvas height",
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
                message="deck title should include the topic",
            )
        )
    for slide_index, slide in enumerate(deck["slides"]):
        if not slide["speakerNotes"]:
            issues.append(
                ValidationIssue(
                    scope="slide",
                    path=f"slides.{slide_index}.speakerNotes",
                    message="speaker notes are required",
                )
            )
    return issues


def validate_presentation(deck: dict[str, Any]) -> list[ValidationIssue]:
    if len(deck["slides"]) < 1:
        return [
            ValidationIssue(
                scope="deck",
                path="slides",
                message="deck must include at least one slide",
            )
        ]
    return []


def patch_deck(deck: dict[str, Any]) -> dict[str, Any]:
    for slide in deck["slides"]:
        slide["elements"] = slide["elements"][:8]
        for element in slide["elements"]:
            element["width"] = min(element["width"], CANVAS.width - element["x"])
            element["height"] = min(element["height"], CANVAS.height - element["y"])
    return deck


def safe_token(value: str) -> str:
    token = "".join(character if character.isalnum() else "_" for character in value)
    return token.strip("_") or "deck"
