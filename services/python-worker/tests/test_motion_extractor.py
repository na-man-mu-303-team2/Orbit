from __future__ import annotations

import json
import re
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


def test_v3_extractor_chooses_smallest_nested_container() -> None:
    elements = [
        element("el_outer", "rect", "decoration", 80, 220, 720, 600, 1),
        element("el_inner", "rect", "decoration", 160, 300, 480, 420, 2),
        element("el_number", "text", "highlight", 200, 336, 360, 72, 4, "01"),
        element("el_body", "text", "body", 200, 432, 360, 220, 4, "본문"),
    ]

    extraction = extract_motion_units(
        {
            "slideId": "slide_nested",
            "order": 2,
            "title": "중첩 카드",
            "elements": elements,
            "semanticCues": [],
        },
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
            ]
        ),
    )

    assert len(extraction.context.units) == 1
    assert extraction.context.units[0].animation_element_ids == [
        "el_inner",
        "el_number",
        "el_body",
    ]
    assert "el_outer" not in extraction.context.units[0].member_element_ids


def test_v3_extractor_resolves_alternating_five_step_timeline() -> None:
    elements = [
        element(
            "el_4_program_v2_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "90일 실행 로드맵",
        ),
        element(
            "el_4_program_v2_timeline_line",
            "rect",
            "decoration",
            120,
            579,
            1680,
            10,
            2,
        ),
    ]
    for index in range(1, 6):
        x = 120 + (index - 1) * 340
        above = index % 2 == 1
        elements.extend(
            [
                element(
                    f"el_4_program_v2_timeline_{index}_index",
                    "text",
                    "highlight",
                    x,
                    292 if above else 668,
                    316,
                    56,
                    5,
                    f"{index:02d}",
                ),
                element(
                    f"el_4_program_v2_timeline_{index}",
                    "text",
                    "body",
                    x,
                    360 if above else 736,
                    316,
                    168,
                    5,
                    f"{index}단계 전체 본문",
                ),
                element(
                    f"el_4_program_v2_timeline_stem_{index}",
                    "rect",
                    "decoration",
                    x + 154,
                    536 if above else 616,
                    8,
                    32,
                    2,
                ),
                element(
                    f"el_4_program_v2_timeline_marker_{index}",
                    "rect",
                    "decoration",
                    x + 126,
                    552,
                    64,
                    64,
                    4,
                ),
                element(
                    f"el_4_program_v2_timeline_marker_label_{index}",
                    "text",
                    "highlight",
                    x + 126,
                    560,
                    64,
                    48,
                    5,
                    str(index),
                ),
            ]
        )
    elements.append(
        element(
            "el_4_program_v2_timeline_message",
            "text",
            "highlight",
            120,
            920,
            1680,
            64,
            5,
            "단계별 실행으로 AI 도입을 완성합니다",
        )
    )

    extraction = extract_motion_units(
        {
            "slideId": "slide_4",
            "order": 4,
            "title": "90일 실행 로드맵",
            "elements": elements,
            "semanticCues": [],
            "aiNotes": {
                "visualPlan": {"visualType": "process"},
                "compositionPlan": {"compositionId": "timeline"},
            },
        },
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
            ]
        ),
    )

    assert extraction.context.structure_family == "timeline"
    assert len(extraction.context.units) == 7
    timeline_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]
    assert len(timeline_units) == 5
    assert all(len(unit.animation_element_ids) == 4 for unit in timeline_units)
    assert [
        next(
            element_id
            for element_id in unit.member_element_ids
            if re.search(r"_timeline_\d+$", element_id)
        )
        for unit in timeline_units
    ] == [
        f"el_4_program_v2_timeline_{index}" for index in range(1, 6)
    ]
    assert sum(
        len(unit.animation_element_ids) for unit in extraction.context.units
    ) == 22
    assert all(
        "timeline_line" not in element_id
        and "timeline_stem" not in element_id
        for unit in extraction.context.units
        for element_id in unit.member_element_ids
    )


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
