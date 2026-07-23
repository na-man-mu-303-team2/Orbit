from __future__ import annotations

import json
from pathlib import Path

from app.ai.motion_planner import (
    MotionPlanningContext,
    extract_motion_context,
    extract_motion_units,
)

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-extractor"
    / "semantic-slide.json"
)


def test_extractor_prefers_approved_current_cues_and_explicit_roles() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    extraction = extract_motion_context(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )
    by_id = {target.element_id: target for target in extraction.context.targets}

    assert extraction.context.approved_cue_count == 1
    assert by_id["el_title"].semantic_role == "title"
    assert by_id["el_title"].reading_order == 1
    assert by_id["el_body"].emphasis == "primary"
    assert by_id["el_focal"].semantic_role == "focal"
    assert by_id["el_focal"].emphasis == "primary"
    assert extraction.context.slide_type == "solution"


def test_extracted_context_never_contains_text_or_notes() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    extraction = extract_motion_context(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )

    serialized = extraction.context.model_dump_json(by_alias=True)
    assert "핵심 의미를 먼저" not in serialized
    assert "작아도 명시적 제목" not in serialized
    assert len(extraction.speaker_notes) <= 4_000


def test_quote_layout_is_classified_before_generic_title_shape() -> None:
    slide = {
        "slideId": "slide_quote",
        "order": 2,
        "title": "Customer voice",
        "style": {"layout": "quote"},
        "elements": [
            {
                "elementId": "el_quote",
                "type": "text",
                "role": "title",
                "visible": True,
                "props": {"text": "A concise quotation"},
            }
        ],
        "semanticCues": [],
    }
    extraction = extract_motion_context(
        slide,
        MotionPlanningContext.model_validate(
            {
                "allowedTargetElementIds": ["el_quote"],
                "effectiveTypography": [],
                "speakerNotes": "",
                "notesPresent": False,
                "notesTruncated": False,
            }
        ),
    )

    assert extraction.context.slide_type == "quote"
    assert extraction.context.narrative_intent == "emphasize"


def test_v3_extractor_groups_five_flat_process_cards_without_connectors() -> None:
    elements = [
        element("el_title", "text", "title", 120, 96, 1680, 120, 5, "가이드"),
        element(
            "el_message",
            "text",
            "highlight",
            120,
            832,
            1680,
            80,
            5,
            "단계적으로 도입합니다",
        ),
    ]
    for index in range(5):
        x = 120 + index * 340
        elements.extend(
            [
                element(
                    f"el_card_{index + 1}",
                    "rect",
                    "decoration",
                    x,
                    304,
                    316,
                    496,
                    3,
                ),
                element(
                    f"el_number_{index + 1}",
                    "text",
                    "highlight",
                    x + 32,
                    328,
                    252,
                    72,
                    5,
                    f"{index + 1:02d}",
                ),
                element(
                    f"el_body_{index + 1}",
                    "text",
                    "body",
                    x + 32,
                    416,
                    252,
                    352,
                    5,
                    f"{index + 1}단계 본문 전체",
                ),
            ]
        )
        if index:
            elements.append(
                element(
                    f"el_connector_{index}",
                    "rect",
                    "decoration",
                    x - 24,
                    547,
                    24,
                    10,
                    2,
                )
            )
    extraction = extract_motion_units(
        {
            "slideId": "slide_process",
            "order": 3,
            "title": "안전한 AI 협업 도구 도입 가이드",
            "elements": elements,
            "semanticCues": [],
            "aiNotes": {
                "visualPlan": {"visualType": "process"},
                "compositionPlan": {"compositionId": "process-horizontal"},
            },
        },
        planning_context(
            [
                element
                for element in elements
                if element.get("role") != "decoration"
            ]
        ),
    )
    card_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]

    assert extraction.context.slide_type == "process"
    assert extraction.context.narrative_intent == "sequence"
    assert len(extraction.context.units) == 7
    assert len(card_units) == 5
    assert all(unit.kind == "spatial-cluster" for unit in card_units)
    assert all(len(unit.animation_element_ids) == 3 for unit in card_units)
    assert {
        element_id
        for unit in card_units
        for element_id in unit.animation_element_ids
    } == {
        *(f"el_card_{index}" for index in range(1, 6)),
        *(f"el_number_{index}" for index in range(1, 6)),
        *(f"el_body_{index}" for index in range(1, 6)),
    }
    assert all(
        "connector" not in element_id
        for unit in extraction.context.units
        for element_id in unit.member_element_ids
    )


def test_v3_extractor_prefers_explicit_group_over_spatial_cluster() -> None:
    elements = [
        element("el_card", "rect", "decoration", 120, 300, 400, 400, 3),
        element("el_body", "text", "body", 152, 360, 336, 200, 5, "본문"),
        {
            **element("el_group", "group", "body", 120, 300, 400, 400, 2),
            "props": {"childElementIds": ["el_card", "el_body"]},
        },
    ]
    extraction = extract_motion_units(
        {
            "slideId": "slide_group",
            "order": 2,
            "title": "그룹",
            "elements": elements,
            "semanticCues": [],
        },
        planning_context(
            [
                element
                for element in elements
                if element.get("role") != "decoration"
                and element.get("type") != "group"
            ]
        ),
    )

    assert len(extraction.context.units) == 1
    unit = extraction.context.units[0]
    assert unit.kind == "explicit-group"
    assert unit.animation_element_ids == ["el_group"]
    assert unit.member_element_ids == ["el_card", "el_body"]


def element(
    element_id: str,
    element_type: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    text: str | None = None,
) -> dict[str, object]:
    return {
        "elementId": element_id,
        "type": element_type,
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "zIndex": z_index,
        "visible": True,
        "locked": False,
        "opacity": 1,
        "props": {"text": text} if text is not None else {},
    }


def planning_context(elements: list[dict[str, object]]) -> MotionPlanningContext:
    return MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": [
                str(element["elementId"]) for element in elements
            ],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
