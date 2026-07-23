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
