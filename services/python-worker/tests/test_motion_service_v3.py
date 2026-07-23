from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

from app.ai.motion_planner import (
    MotionImportContext,
    MotionPlanningContext,
    extract_motion_units,
    plan_and_compile_motion,
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
    slide = process_slide()
    planning_context = authored_planning_context(slide)
    extraction = extract_motion_units(slide, planning_context)
    title = next(
        unit for unit in extraction.context.units if unit.semantic_role == "title"
    )
    cards = [
        unit for unit in extraction.context.units if unit.semantic_role == "card"
    ]
    conclusion = extraction.context.units[-1]
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
                    {"unitId": title.unit_id, "motionIntent": "introduce"}
                ],
            },
            *(
                {
                    "beatId": f"beat_click_{index}",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {"unitId": card.unit_id, "motionIntent": "reveal"},
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
        deck_id="deck_1",
        base_version=3,
        slide=slide,
        planning_context=planning_context,
        import_context=None,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
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


def process_slide() -> dict[str, Any]:
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
    return {
        "slideId": "slide_process",
        "kind": "content",
        "order": 3,
        "title": "안전한 AI 협업 도구 도입 가이드",
        "elements": elements,
        "semanticCues": [],
        "aiNotes": {
            "visualPlan": {"visualType": "process"},
            "compositionPlan": {"compositionId": "process-horizontal"},
        },
    }


def authored_planning_context(slide: dict[str, Any]) -> MotionPlanningContext:
    return MotionPlanningContext.model_validate(
        {
            "allowedTargetElementIds": [
                element["elementId"]
                for element in slide["elements"]
                if element["role"] != "decoration"
            ],
            "effectiveTypography": [],
            "speakerNotes": "",
            "notesPresent": False,
            "notesTruncated": False,
        }
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
