from __future__ import annotations

import json
from pathlib import Path

from app.ai.motion_planner.library import (
    effect_spec_for_target,
    narrative_pattern_for_slide_type,
)
from app.ai.motion_planner import (
    MotionPlanningContext,
    deterministic_fallback_plan,
    evaluate_motion_eligibility,
    extract_motion_context,
)
from app.ai.motion_planner.extractor import MotionPromptInput
from app.ai.motion_planner.models import ExtractedMotionContext, MotionTarget

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-golden"
    / "slide-types.json"
)


def target(role: str) -> MotionTarget:
    return MotionTarget.model_validate(
        {
            "elementId": f"el_{role}",
            "semanticRole": role,
            "groupId": None,
            "readingOrder": 1,
            "emphasis": "primary",
            "geometryBucket": "center",
        }
    )


def test_all_twelve_slide_types_use_the_bounded_pattern_library() -> None:
    fixtures = json.loads(FIXTURE.read_text(encoding="utf-8"))

    assert len(fixtures) == 12
    for fixture in fixtures:
        assert (
            narrative_pattern_for_slide_type(fixture["slideType"])
            == fixture["expectedPattern"]
        )


def test_effect_library_only_emits_serializer_safe_entrance_effects() -> None:
    specs = {
        role: effect_spec_for_target(target(role))
        for role in ("title", "subtitle", "body", "label", "focal", "media", "data")
    }

    assert {spec.effect for spec in specs.values()} == {
        "appear",
        "fade-in",
        "zoom-in",
    }
    assert specs["title"].duration_ms == 400
    assert specs["body"].duration_ms == 300
    assert specs["media"].duration_ms == 450
    assert all(spec.easing == "ease-out" for spec in specs.values())


def test_all_twelve_golden_types_exclude_decoration_footer_background_and_connectors() -> None:
    fixtures = json.loads(FIXTURE.read_text(encoding="utf-8"))
    for index, fixture in enumerate(fixtures, start=1):
        slide = {
            "slideId": f"slide_{index}",
            "order": index + 1,
            "title": fixture["slideType"],
            "elements": [
                {
                    "elementId": f"el_title_{index}",
                    "type": "text",
                    "role": "title",
                    "x": 80,
                    "y": 60,
                    "width": 800,
                    "height": 100,
                    "visible": True,
                    "props": {"text": fixture["slideType"]},
                },
                {
                    "elementId": f"el_decoration_{index}",
                    "type": "rect",
                    "role": "decoration",
                    "visible": True,
                },
                {
                    "elementId": f"el_footer_{index}",
                    "type": "text",
                    "role": "footer",
                    "visible": True,
                    "props": {"text": "footer"},
                },
                {
                    "elementId": f"el_connector_{index}",
                    "type": "arrow",
                    "visible": True,
                },
            ],
            "semanticCues": [],
        }
        eligibility = evaluate_motion_eligibility(slide)
        assert eligibility.outcome == "applicable"
        extraction = extract_motion_context(
            slide,
            MotionPlanningContext.model_validate(
                {
                    "allowedTargetElementIds": eligibility.allowed_target_element_ids,
                    "effectiveTypography": [],
                    "speakerNotes": "",
                    "notesPresent": False,
                    "notesTruncated": False,
                }
            ),
        )
        assert [target.element_id for target in extraction.context.targets] == [
            f"el_title_{index}"
        ]


def test_fallback_preserves_process_order_and_pairs_comparison_items() -> None:
    process = fallback_input(
        "process",
        [("el_title", "title"), ("el_step_1", "body"), ("el_step_2", "body")],
    )
    comparison = fallback_input(
        "comparison",
        [("el_title", "title"), ("el_left", "body"), ("el_right", "body")],
    )

    process_plan = deterministic_fallback_plan(process)
    comparison_plan = deterministic_fallback_plan(comparison)

    assert [beat.target_element_ids for beat in process_plan.beats] == [
        ["el_title"],
        ["el_step_1"],
        ["el_step_2"],
    ]
    assert comparison_plan.beats[1].target_element_ids == ["el_left", "el_right"]
    assert comparison_plan.beats[1].relation == "together"


def test_data_fallback_keeps_whole_evidence_and_insight_in_separate_beats() -> None:
    plan = deterministic_fallback_plan(
        fallback_input(
            "data",
            [
                ("el_title", "title"),
                ("el_chart", "data"),
                ("el_insight", "focal"),
            ],
        )
    )

    assert [beat.target_element_ids for beat in plan.beats] == [
        ["el_title"],
        ["el_chart"],
        ["el_insight"],
    ]


def fallback_input(slide_type: str, targets: list[tuple[str, str]]) -> MotionPromptInput:
    context = ExtractedMotionContext.model_validate(
        {
            "slideType": slide_type,
            "narrativeIntent": "sequence",
            "targets": [
                {
                    "elementId": element_id,
                    "semanticRole": role,
                    "groupId": None,
                    "readingOrder": index,
                    "emphasis": "primary" if index == 1 else "supporting",
                    "geometryBucket": "center",
                }
                for index, (element_id, role) in enumerate(targets, start=1)
            ],
            "approvedCueCount": 0,
            "notesPresent": False,
            "notesTruncated": False,
        }
    )
    return MotionPromptInput(context=context, target_labels={}, speaker_notes="")
