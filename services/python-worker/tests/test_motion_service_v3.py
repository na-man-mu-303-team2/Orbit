from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from app.ai.motion_planner import (
    MotionImportContext,
    MotionPlanningContext,
    extract_motion_units,
    plan_and_compile_motion,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-golden"
    / "semantic-process-v3.json"
)


class FakeResponses:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload))


class FakeClient:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.responses = FakeResponses(payload)


def test_authored_five_step_slide_compiles_seven_units_and_seventeen_elements() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    slide = fixture["slide"]
    planning_context = MotionPlanningContext.model_validate(
        fixture["planningContext"]
    )
    extraction = extract_motion_units(slide, planning_context)

    result = plan_and_compile_motion(
        deck_id="deck_1",
        base_version=3,
        slide=slide,
        planning_context=planning_context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(fixture["planDraft"]),
    )

    assert result.outcome == "applicable"
    assert result.click_count == 5
    assert result.beat_count == 6
    assert len(result.affected_element_ids) == 17
    assert set(result.affected_element_ids) == {
        element["elementId"] for element in slide["elements"]
        if "connector" not in element["elementId"]
    }
    assert len(result.operations) == 17
    assert {
        operation["animation"]["type"] for operation in result.operations
    } <= {"appear", "fade-in"}
    assert result.motion_plan is not None
    assert result.motion_plan.compiler_version == "motion-compiler-v3"
    assert len(result.motion_plan.units) == 7
    serialized_metadata = result.motion_plan.model_dump(by_alias=True)
    assert all(
        set(unit) == {
            "unitId",
            "kind",
            "animationElementIds",
            "memberElementIds",
            "semanticRole",
            "readingOrder",
        }
        for unit in serialized_metadata["units"]
    )
    assert [
        unit.unit_id for unit in extraction.context.units
    ] == fixture["expected"]["unitIds"]
    assert sum(
        len(unit.animation_element_ids) for unit in extraction.context.units
    ) == fixture["expected"]["animationElementCount"]
    assert len(
        {
            element_id
            for unit in extraction.context.units
            for element_id in unit.member_element_ids
        }
    ) == fixture["expected"]["memberElementCount"]
    operation_target_ids = {
        operation["animation"]["elementId"] for operation in result.operations
    }
    card_unit_ids = [
        unit.unit_id
        for unit in extraction.context.units
        if unit.semantic_role == "card"
    ]
    planned_card_ids = [
        target.unit_id
        for beat in result.motion_plan.plan.beats
        for target in beat.targets
        if target.unit_id in set(card_unit_ids)
    ]
    invariants = {
        "partialCompositeTarget": sum(
            not set(unit.animation_element_ids).issubset(operation_target_ids)
            for unit in extraction.context.units
        ),
        "skippedSequentialUnit": int(planned_card_ids != card_unit_ids),
        "patternMismatch": int(
            result.motion_plan.plan.pattern != "stepwise-process"
        ),
    }
    assert invariants == fixture["expected"]["invariants"]


def test_imported_editable_slide_keeps_v2_planning_path() -> None:
    slide = {
        "slideId": "slide_imported",
        "kind": "content",
        "importRenderMode": "editable",
        "ooxmlSourceSlidePart": "ppt/slides/slide1.xml",
        "elements": [
            {
                "elementId": "el_imported",
                "type": "image",
                "role": "media",
                "visible": True,
                "locked": False,
                "opacity": 1,
                "x": 100,
                "y": 100,
                "width": 800,
                "height": 600,
            }
        ],
    }
    planning_context = MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": ["el_imported"],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
    payload = {
        "schemaVersion": 2,
        "pattern": "hero-then-support",
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_click_1",
                "purpose": "reveal",
                "trigger": "click",
                "relation": "together",
                "targets": [
                    {
                        "elementId": "el_imported",
                        "motionIntent": "reveal",
                    }
                ],
            }
        ],
    }

    result = plan_and_compile_motion(
        deck_id="deck_1",
        base_version=3,
        slide=slide,
        planning_context=planning_context,
        import_context=MotionImportContext.model_validate(
            {
                "renderMode": "editable",
                "sourceSlidePartPresent": True,
                "importedMainSequenceCoverage": "complete",
                "stableTargetElementIds": ["el_imported"],
            }
        ),
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.outcome == "applicable"
    assert result.motion_plan is not None
    assert result.motion_plan.compiler_version == "motion-compiler-v2"


def test_authored_incomplete_timeline_fails_closed_before_llm() -> None:
    slide = {
        "slideId": "slide_timeline",
        "order": 4,
        "title": "불완전한 타임라인",
        "elements": [
            {
                "elementId": "el_title",
                "type": "text",
                "role": "title",
                "visible": True,
                "locked": False,
                "opacity": 1,
                "x": 120,
                "y": 96,
                "width": 1680,
                "height": 120,
                "zIndex": 5,
                "props": {"text": "불완전한 타임라인"},
            }
        ],
        "animations": [],
        "semanticCues": [],
        "aiNotes": {
            "visualPlan": {"visualType": "process"},
            "compositionPlan": {"compositionId": "timeline"},
        },
    }
    context = MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": ["el_title"],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
    client = FakeClient({"schemaVersion": 3, "pacing": "balanced", "beats": []})

    result = plan_and_compile_motion(
        deck_id="deck_1",
        base_version=3,
        slide=slide,
        planning_context=context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=client,
    )

    assert result.outcome == "refused-unsafe"
    assert result.reason_code == "MOTION_AI_COMPILE_UNSAFE"
    assert client.responses.calls == []


def test_authored_five_step_timeline_compiles_22_elements_and_five_clicks() -> None:
    slide, context = timeline_slide(5)
    extraction = extract_motion_units(slide, context)
    title, *middle, conclusion = extraction.context.units
    cards = [unit for unit in middle if unit.semantic_role == "card"]
    payload = {
        "schemaVersion": 3,
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {
                        "unitId": title.unit_id,
                        "motionIntent": "introduce",
                    }
                ],
            },
            *(
                {
                    "beatId": f"beat_click_{index}",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {
                            "unitId": card.unit_id,
                            "motionIntent": "reveal",
                        },
                        *(
                            [
                                {
                                    "unitId": conclusion.unit_id,
                                    "motionIntent": "conclude",
                                }
                            ]
                            if index == 5
                            else []
                        ),
                    ],
                }
                for index, card in enumerate(cards, start=1)
            ),
        ],
    }

    result = plan_and_compile_motion(
        deck_id="deck_timeline",
        base_version=3,
        slide=slide,
        planning_context=context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.outcome == "applicable"
    assert result.click_count == 5
    assert result.beat_count == 6
    assert len(result.operations) == 22
    assert len(result.affected_element_ids) == 22


def test_authored_six_step_timeline_compiles_26_elements_with_five_clicks() -> None:
    slide, context = timeline_slide(6)
    extraction = extract_motion_units(slide, context)
    title, *middle, conclusion = extraction.context.units
    cards = [unit for unit in middle if unit.semantic_role == "card"]
    payload = {
        "schemaVersion": 3,
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {
                        "unitId": title.unit_id,
                        "motionIntent": "introduce",
                    },
                    {
                        "unitId": cards[0].unit_id,
                        "motionIntent": "reveal",
                    },
                ],
            },
            *(
                {
                    "beatId": f"beat_click_{index}",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {
                            "unitId": card.unit_id,
                            "motionIntent": "reveal",
                        },
                        *(
                            [
                                {
                                    "unitId": conclusion.unit_id,
                                    "motionIntent": "conclude",
                                }
                            ]
                            if index == 6
                            else []
                        ),
                    ],
                }
                for index, card in enumerate(cards[1:], start=2)
            ),
        ],
    }

    result = plan_and_compile_motion(
        deck_id="deck_timeline",
        base_version=3,
        slide=slide,
        planning_context=context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.outcome == "applicable"
    assert result.click_count == 5
    assert result.beat_count == 6
    assert len(result.operations) == 26
    assert len(result.affected_element_ids) == 26


def test_authored_six_step_vertical_rail_compiles_with_five_clicks() -> None:
    slide, context = vertical_rail_slide(6)
    extraction = extract_motion_units(slide, context)
    title, *middle, conclusion = extraction.context.units
    cards = [unit for unit in middle if unit.semantic_role == "card"]
    payload = {
        "schemaVersion": 3,
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {
                        "unitId": title.unit_id,
                        "motionIntent": "introduce",
                    },
                    {
                        "unitId": cards[0].unit_id,
                        "motionIntent": "reveal",
                    },
                ],
            },
            *(
                {
                    "beatId": f"beat_click_{index}",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {
                            "unitId": card.unit_id,
                            "motionIntent": "reveal",
                        },
                        *(
                            [
                                {
                                    "unitId": conclusion.unit_id,
                                    "motionIntent": "conclude",
                                }
                            ]
                            if index == 6
                            else []
                        ),
                    ],
                }
                for index, card in enumerate(cards[1:], start=2)
            ),
        ],
    }

    result = plan_and_compile_motion(
        deck_id="deck_vertical_rail",
        base_version=3,
        slide=slide,
        planning_context=context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.outcome == "applicable"
    assert result.click_count == 5
    assert result.beat_count == 6
    assert len(result.operations) == 20
    assert len(result.affected_element_ids) == 20
    assert all(
        "vertical_rail" not in element_id and "rail_rule" not in element_id
        for element_id in result.affected_element_ids
    )


def timeline_slide(
    step_count: int,
) -> tuple[dict[str, Any], MotionPlanningContext]:
    elements: list[dict[str, Any]] = [
        motion_element(
            "el_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "90일 실행 로드맵",
        ),
        motion_element(
            "el_timeline_line",
            "rect",
            "decoration",
            120,
            579,
            1680,
            10,
            2,
        ),
    ]
    step_width = 340 if step_count == 5 else 280
    content_width = step_width - 24
    for index in range(1, step_count + 1):
        x = 120 + (index - 1) * step_width
        above = index % 2 == 1
        elements.extend(
            [
                motion_element(
                    f"el_timeline_{index}_index",
                    "text",
                    "highlight",
                    x,
                    292 if above else 668,
                    content_width,
                    56,
                    5,
                    f"{index:02d}",
                ),
                motion_element(
                    f"el_timeline_{index}",
                    "text",
                    "body",
                    x,
                    360 if above else 736,
                    content_width,
                    168,
                    5,
                    f"{index}단계 전체 본문",
                ),
                motion_element(
                    f"el_timeline_stem_{index}",
                    "rect",
                    "decoration",
                    x + content_width // 2 - 4,
                    536 if above else 616,
                    8,
                    32,
                    2,
                ),
                motion_element(
                    f"el_timeline_marker_{index}",
                    "rect",
                    "decoration",
                    x + content_width // 2 - 32,
                    552,
                    64,
                    64,
                    4,
                ),
                motion_element(
                    f"el_timeline_marker_label_{index}",
                    "text",
                    "highlight",
                    x + content_width // 2 - 32,
                    560,
                    64,
                    48,
                    5,
                    str(index),
                ),
            ]
        )
    elements.append(
        motion_element(
            "el_timeline_message",
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
    slide = {
        "slideId": "slide_timeline",
        "order": 4,
        "title": "90일 실행 로드맵",
        "elements": elements,
        "animations": [],
        "semanticCues": [],
        "aiNotes": {
            "visualPlan": {"visualType": "process"},
            "compositionPlan": {"compositionId": "timeline"},
        },
    }
    context = MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": [
                element["elementId"]
                for element in elements
                if element["role"] != "decoration"
            ],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
    return slide, context


def vertical_rail_slide(
    step_count: int,
) -> tuple[dict[str, Any], MotionPlanningContext]:
    elements: list[dict[str, Any]] = [
        motion_element(
            "el_title",
            "text",
            "title",
            120,
            96,
            1680,
            120,
            5,
            "단계별 실행 계획",
        ),
        motion_element(
            "el_vertical_rail",
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
                motion_element(
                    f"el_rail_marker_{index}",
                    "ellipse",
                    "decoration",
                    260,
                    y,
                    60,
                    60,
                    4,
                ),
                motion_element(
                    f"el_rail_marker_label_{index}",
                    "text",
                    "highlight",
                    260,
                    y + 8,
                    60,
                    44,
                    5,
                    str(index),
                ),
                motion_element(
                    f"el_rail_rule_{index}",
                    "rect",
                    "decoration",
                    360,
                    y + 26,
                    120,
                    4,
                    2,
                ),
                motion_element(
                    f"el_rail_step_{index}",
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
        motion_element(
            "el_rail_message",
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
    slide = {
        "slideId": "slide_vertical_rail",
        "order": 7,
        "title": "단계별 실행 계획",
        "elements": elements,
        "animations": [],
        "semanticCues": [],
        "aiNotes": {
            "visualPlan": {"visualType": "process"},
            "compositionPlan": {"compositionId": "process-vertical-rail"},
        },
    }
    context = MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": [
                element["elementId"]
                for element in elements
                if element["role"] != "decoration"
            ],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
    return slide, context


def motion_element(
    element_id: str,
    element_type: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    text: str | None = None,
) -> dict[str, Any]:
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
