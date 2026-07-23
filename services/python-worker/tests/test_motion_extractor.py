from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.ai.motion_planner import (
    MotionPlanningContext,
    extract_motion_context,
    extract_motion_units,
)
from app.ai.motion_planner.structure_resolvers import (
    MotionStructureResolutionError,
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


def test_v3_extractor_resolves_four_item_feature_comparison_rules() -> None:
    elements = [
        element(
            "el_3_program_v2_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "비교 장표",
        ),
        element(
            "el_3_program_v2_message",
            "text",
            "highlight",
            120,
            232,
            1680,
            80,
            5,
            "기준과 대안을 비교합니다",
        ),
    ]
    for index in range(1, 5):
        if index == 1:
            x, y, width, height = 120, 344, 1680, 216
            backing_suffix = "field"
        else:
            x, y, width, height = (
                120 + (index - 2) * 568,
                584,
                544,
                8,
            )
            backing_suffix = "rule"
        elements.extend(
            [
                element(
                    f"el_3_program_v2_comparison_{index}_{backing_suffix}",
                    "rect",
                    "decoration",
                    x,
                    y,
                    width,
                    height,
                    3,
                ),
                element(
                    f"el_3_program_v2_comparison_{index}_index",
                    "text",
                    "highlight",
                    x + (36 if index == 1 else 0),
                    y + (24 if index == 1 else 32),
                    96 if index == 1 else width,
                    64,
                    5,
                    f"{index:02d}",
                ),
                element(
                    (
                        "renamed_comparison_body"
                        if index == 3
                        else f"el_3_program_v2_comparison_{index}"
                    ),
                    "text",
                    "body",
                    x + (160 if index == 1 else 0),
                    y + (24 if index == 1 else 112),
                    width - (196 if index == 1 else 0),
                    168,
                    5,
                    f"{index}번 비교 전체 본문",
                ),
            ]
        )

    extraction = extract_motion_units(
        {
            "slideId": "slide_comparison",
            "order": 3,
            "title": "비교 장표",
            "elements": elements,
            "semanticCues": [],
            "aiNotes": {
                "visualPlan": {"visualType": "comparison"},
                "compositionPlan": {"compositionId": "feature-comparison"},
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

    assert extraction.context.structure_family == "feature-comparison"
    assert len(extraction.context.units) == 6
    comparison_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]
    assert len(comparison_units) == 4
    assert all(len(unit.animation_element_ids) == 3 for unit in comparison_units)
    assert "renamed_comparison_body" in comparison_units[2].member_element_ids


def test_v3_extractor_resolves_six_node_diagram_hub() -> None:
    elements = [
        element(
            "el_6_program_v2_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "AI 운영 구조",
        ),
        element(
            "el_6_program_v2_hub_field",
            "rect",
            "highlight",
            724,
            336,
            472,
            352,
            4,
        ),
        element(
            "renamed_hub_text",
            "text",
            "highlight",
            760,
            384,
            400,
            256,
            5,
            "통합 운영 허브",
        ),
    ]
    frames = [
        (120, 288),
        (1380, 288),
        (120, 512),
        (1380, 512),
        (120, 736),
        (1380, 736),
    ]
    for index, (x, y) in enumerate(frames, start=1):
        elements.extend(
            [
                element(
                    f"el_6_program_v2_connector_{index}",
                    "rect",
                    "decoration",
                    960,
                    508,
                    400,
                    8,
                    2,
                ),
                element(
                    f"el_6_program_v2_node_{index}_field",
                    "rect",
                    "decoration",
                    x,
                    y,
                    402,
                    176,
                    3,
                ),
                element(
                    f"el_6_program_v2_node_{index}_index",
                    "text",
                    "highlight",
                    x + 32,
                    y + 20,
                    338,
                    56,
                    5,
                    f"{index:02d}",
                ),
                element(
                    f"el_6_program_v2_node_{index}",
                    "text",
                    "body",
                    x + 32,
                    y + 80,
                    338,
                    72,
                    5,
                    f"{index}번 노드 전체 본문",
                ),
            ]
        )

    extraction = extract_motion_units(
        {
            "slideId": "slide_hub",
            "order": 6,
            "title": "AI 운영 구조",
            "elements": elements,
            "semanticCues": [],
            "aiNotes": {
                "visualPlan": {"visualType": "architecture"},
                "compositionPlan": {
                    "compositionId": "diagram-hub",
                    "primaryFocalElementId": "renamed_hub_text",
                },
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

    assert extraction.context.structure_family == "diagram-hub"
    assert len(extraction.context.units) == 8
    assert extraction.context.units[1].semantic_role == "focal"
    assert extraction.context.units[1].member_element_ids == [
        "el_6_program_v2_hub_field",
        "renamed_hub_text",
    ]
    node_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]
    assert len(node_units) == 6
    assert all(len(unit.animation_element_ids) == 3 for unit in node_units)
    assert all(
        "connector" not in element_id
        for unit in extraction.context.units
        for element_id in unit.member_element_ids
    )


@pytest.mark.parametrize("step_count", [3, 5, 6])
def test_v3_extractor_resolves_vertical_rail_steps(
    step_count: int,
) -> None:
    elements = vertical_rail_elements(step_count)
    extraction = extract_motion_units(
        authored_slide(
            "process-vertical-rail",
            "process",
            elements,
        ),
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
            ]
        ),
    )
    card_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]

    assert extraction.context.structure_family == "timeline"
    assert extraction.context.slide_type == "process"
    assert len(extraction.context.units) == step_count + 2
    assert len(card_units) == step_count
    assert [
        unit.member_element_ids for unit in card_units
    ] == [
        [
            f"el_7_program_v2_rail_marker_{index}",
            f"el_7_program_v2_rail_marker_label_{index}",
            f"el_7_program_v2_rail_step_{index}",
        ]
        for index in range(1, step_count + 1)
    ]
    assert all(
        "vertical_rail" not in element_id and "rail_rule" not in element_id
        for unit in extraction.context.units
        for element_id in unit.member_element_ids
    )


@pytest.mark.parametrize("node_count", [3, 6])
def test_v3_extractor_resolves_diagram_orbit_nodes(
    node_count: int,
) -> None:
    elements = diagram_orbit_elements(node_count)
    extraction = extract_motion_units(
        authored_slide("diagram-orbit", "architecture", elements),
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
            ]
        ),
    )
    focal_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "focal"
    ]
    node_units = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]

    assert extraction.context.structure_family == "diagram-hub"
    assert extraction.context.slide_type == "architecture"
    assert len(extraction.context.units) == node_count + 2
    assert len(focal_units) == 1
    assert focal_units[0].member_element_ids == [
        "el_5_program_v2_orbit_hub_field",
        "el_5_program_v2_orbit_hub",
    ]
    assert [
        unit.member_element_ids for unit in node_units
    ] == [
        [
            f"el_5_program_v2_orbit_node_{index}_field",
            f"el_5_program_v2_orbit_node_{index}",
        ]
        for index in range(1, node_count + 1)
    ]
    assert all(
        "orbit_connector" not in element_id
        for unit in extraction.context.units
        for element_id in unit.member_element_ids
    )


@pytest.mark.parametrize(
    ("composition_id", "visual_type", "missing_id"),
    [
        (
            "process-vertical-rail",
            "process",
            "el_7_program_v2_rail_marker_label_2",
        ),
        (
            "process-vertical-rail",
            "process",
            "el_7_program_v2_rail_step_2",
        ),
        (
            "diagram-orbit",
            "architecture",
            "el_5_program_v2_orbit_hub_field",
        ),
        (
            "diagram-orbit",
            "architecture",
            "el_5_program_v2_orbit_node_2",
        ),
    ],
)
def test_v3_structure_resolvers_fail_closed_for_incomplete_atomic_units(
    composition_id: str,
    visual_type: str,
    missing_id: str,
) -> None:
    elements = (
        vertical_rail_elements(3)
        if composition_id == "process-vertical-rail"
        else diagram_orbit_elements(3)
    )
    incomplete = [
        item for item in elements if item["elementId"] != missing_id
    ]

    with pytest.raises(MotionStructureResolutionError):
        extract_motion_units(
            authored_slide(composition_id, visual_type, incomplete),
            planning_context(
                [
                    item
                    for item in incomplete
                    if item.get("role") != "decoration"
                ]
            ),
        )


@pytest.mark.parametrize(
    ("composition_id", "visual_type", "ordinal_ids"),
    [
        (
            "process-vertical-rail",
            "process",
            {
                "el_7_program_v2_rail_marker_2",
                "el_7_program_v2_rail_marker_label_2",
                "el_7_program_v2_rail_rule_2",
                "el_7_program_v2_rail_step_2",
            },
        ),
        (
            "diagram-orbit",
            "architecture",
            {
                "el_5_program_v2_orbit_connector_2",
                "el_5_program_v2_orbit_node_2_field",
                "el_5_program_v2_orbit_node_2",
            },
        ),
    ],
)
def test_v3_structure_resolvers_reject_nonconsecutive_ordinals(
    composition_id: str,
    visual_type: str,
    ordinal_ids: set[str],
) -> None:
    elements = (
        vertical_rail_elements(3)
        if composition_id == "process-vertical-rail"
        else diagram_orbit_elements(3)
    )
    discontinuous = [
        item
        for item in elements
        if item["elementId"] not in ordinal_ids
    ]

    with pytest.raises(MotionStructureResolutionError):
        extract_motion_units(
            authored_slide(composition_id, visual_type, discontinuous),
            planning_context(
                [
                    item
                    for item in discontinuous
                    if item.get("role") != "decoration"
                ]
            ),
        )


@pytest.mark.parametrize(
    ("composition_id", "expected_slide_type"),
    [
        ("process-vertical-rail", "process"),
        ("diagram-orbit", "architecture"),
    ],
)
def test_v3_extractor_maps_new_compositions_without_visual_type(
    composition_id: str,
    expected_slide_type: str,
) -> None:
    elements = (
        vertical_rail_elements(3)
        if composition_id == "process-vertical-rail"
        else diagram_orbit_elements(3)
    )
    slide = authored_slide(composition_id, "", elements)
    slide["aiNotes"] = {
        "compositionPlan": {"compositionId": composition_id}
    }

    extraction = extract_motion_units(
        slide,
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
            ]
        ),
    )

    assert extraction.context.slide_type == expected_slide_type


def test_structure_resolver_preserves_explicit_group_priority() -> None:
    first_members = [
        element(
            "el_comparison_1_field",
            "rect",
            "decoration",
            120,
            344,
            828,
            528,
            3,
        ),
        element(
            "el_comparison_1_index",
            "text",
            "highlight",
            152,
            372,
            764,
            72,
            5,
            "01",
        ),
        element(
            "el_comparison_1",
            "text",
            "body",
            152,
            464,
            764,
            372,
            5,
            "첫 번째 비교 본문",
        ),
    ]
    second_members = [
        element(
            "el_comparison_2_field",
            "rect",
            "decoration",
            972,
            440,
            828,
            336,
            3,
        ),
        element(
            "el_comparison_2_index",
            "text",
            "highlight",
            1004,
            468,
            764,
            72,
            5,
            "02",
        ),
        element(
            "el_comparison_2",
            "text",
            "body",
            1004,
            560,
            764,
            180,
            5,
            "두 번째 비교 본문",
        ),
    ]
    group = {
        **element(
            "el_comparison_group_1",
            "group",
            "body",
            120,
            344,
            828,
            528,
            2,
        ),
        "props": {
            "childElementIds": [
                str(member["elementId"]) for member in first_members
            ]
        },
    }
    elements = [
        element(
            "el_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "명시적 그룹 비교",
        ),
        *first_members,
        *second_members,
        group,
    ]

    extraction = extract_motion_units(
        {
            "slideId": "slide_explicit_comparison",
            "order": 2,
            "title": "명시적 그룹 비교",
            "elements": elements,
            "semanticCues": [],
            "aiNotes": {
                "visualPlan": {"visualType": "comparison"},
                "compositionPlan": {"compositionId": "feature-comparison"},
            },
        },
        planning_context(
            [
                item
                for item in elements
                if item.get("role") != "decoration"
                and item.get("type") != "group"
            ]
        ),
    )

    assert len(extraction.context.units) == 3
    first_card = extraction.context.units[1]
    assert first_card.kind == "explicit-group"
    assert first_card.animation_element_ids == ["el_comparison_group_1"]
    assert first_card.member_element_ids == [
        "el_comparison_1_field",
        "el_comparison_1_index",
        "el_comparison_1",
    ]


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


def authored_slide(
    composition_id: str,
    visual_type: str,
    elements: list[dict[str, object]],
) -> dict[str, object]:
    return {
        "slideId": f"slide_{composition_id}",
        "order": 5,
        "title": "구조 장표",
        "elements": elements,
        "semanticCues": [],
        "aiNotes": {
            "visualPlan": {"visualType": visual_type},
            "compositionPlan": {"compositionId": composition_id},
        },
    }


def vertical_rail_elements(step_count: int) -> list[dict[str, object]]:
    elements = [
        element(
            "el_7_program_v2_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "단계별 실행 계획",
        ),
        element(
            "el_7_program_v2_vertical_rail",
            "rect",
            "decoration",
            286,
            272,
            8,
            560,
            2,
        ),
    ]
    for index in range(1, step_count + 1):
        y = 264 + (index - 1) * (520 // max(1, step_count - 1))
        elements.extend(
            [
                element(
                    f"el_7_program_v2_rail_marker_{index}",
                    "ellipse",
                    "decoration",
                    260,
                    y,
                    60,
                    60,
                    4,
                ),
                element(
                    f"el_7_program_v2_rail_marker_label_{index}",
                    "text",
                    "highlight",
                    260,
                    y + 8,
                    60,
                    44,
                    5,
                    str(index),
                ),
                element(
                    f"el_7_program_v2_rail_rule_{index}",
                    "rect",
                    "decoration",
                    360,
                    y + 26,
                    120,
                    4,
                    2,
                ),
                element(
                    f"el_7_program_v2_rail_step_{index}",
                    "text",
                    "body",
                    520,
                    y - 8,
                    1160,
                    80,
                    5,
                    f"{index}단계 전체 본문",
                ),
            ]
        )
    elements.append(
        element(
            "el_7_program_v2_rail_message",
            "text",
            "highlight",
            520,
            900,
            1160,
            64,
            5,
            "단계별 실행으로 도입을 완성합니다",
        )
    )
    return elements


def diagram_orbit_elements(node_count: int) -> list[dict[str, object]]:
    elements = [
        element(
            "el_5_program_v2_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "AI 운영 생태계",
        ),
        element(
            "el_5_program_v2_orbit_hub_field",
            "ellipse",
            "decoration",
            740,
            352,
            440,
            320,
            4,
        ),
        element(
            "el_5_program_v2_orbit_hub",
            "text",
            "highlight",
            784,
            396,
            352,
            232,
            5,
            "통합 운영 허브",
        ),
    ]
    positions = [
        (120, 272),
        (1420, 272),
        (120, 680),
        (1420, 680),
        (520, 792),
        (1040, 792),
    ]
    for index, (x, y) in enumerate(positions[:node_count], start=1):
        elements.extend(
            [
                element(
                    f"el_5_program_v2_orbit_connector_{index}",
                    "rect",
                    "decoration",
                    920,
                    508,
                    320,
                    6,
                    2,
                ),
                element(
                    f"el_5_program_v2_orbit_node_{index}_field",
                    "ellipse",
                    "decoration",
                    x,
                    y,
                    380,
                    144,
                    3,
                ),
                element(
                    f"el_5_program_v2_orbit_node_{index}",
                    "text",
                    "body",
                    x + 36,
                    y + 20,
                    308,
                    104,
                    5,
                    f"{index}번 노드 전체 본문",
                ),
            ]
        )
    return elements
