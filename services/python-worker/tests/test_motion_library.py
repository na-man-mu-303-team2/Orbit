from __future__ import annotations

import json
from pathlib import Path

import pytest

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
    fixtures = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]

    assert len(fixtures) == 12
    for fixture in fixtures:
        assert (
            narrative_pattern_for_slide_type(fixture["expected"]["slideType"])
            == fixture["expected"]["plan"]["pattern"]
        )


def test_effect_library_only_emits_serializer_safe_entrance_effects() -> None:
    specs = {
        "introduce": effect_spec_for_target(
            target("body"), "introduce", "balanced"
        ),
        "reveal-body": effect_spec_for_target(target("body"), "reveal", "balanced"),
        "reveal-media": effect_spec_for_target(
            target("media"), "reveal", "balanced"
        ),
        "focus": effect_spec_for_target(target("body"), "focus", "balanced"),
        "compare": effect_spec_for_target(target("data"), "compare", "balanced"),
        "connect": effect_spec_for_target(target("media"), "connect", "balanced"),
        "conclude-media": effect_spec_for_target(
            target("media"), "conclude", "balanced"
        ),
    }

    assert {spec.effect for spec in specs.values()} == {
        "appear",
        "fade-in",
        "zoom-in",
    }
    assert specs["introduce"].effect == "fade-in"
    assert specs["reveal-body"].effect == "appear"
    assert specs["reveal-media"].effect == "zoom-in"
    assert specs["focus"].effect == "zoom-in"
    assert specs["compare"].effect == "fade-in"
    assert specs["connect"].effect == "appear"
    assert specs["conclude-media"].effect == "zoom-in"
    assert specs["introduce"].duration_ms == 400
    assert specs["reveal-body"].duration_ms == 300
    assert specs["reveal-media"].duration_ms == 450
    assert all(spec.easing == "ease-out" for spec in specs.values())


@pytest.mark.parametrize(
    ("pacing", "expected"),
    [
        ("deliberate", (400, 500, 550)),
        ("balanced", (300, 400, 450)),
        ("brisk", (200, 300, 350)),
    ],
)
def test_pacing_maps_to_bounded_durations(
    pacing: str, expected: tuple[int, int, int]
) -> None:
    assert (
        effect_spec_for_target(target("body"), "support", pacing).duration_ms,
        effect_spec_for_target(target("body"), "introduce", pacing).duration_ms,
        effect_spec_for_target(target("body"), "focus", pacing).duration_ms,
    ) == expected


def test_all_twelve_golden_types_exclude_decoration_footer_background_and_connectors() -> None:
    fixtures = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]
    for index, fixture in enumerate(fixtures, start=1):
        slide_type = fixture["expected"]["slideType"]
        slide = {
            "slideId": f"slide_{index}",
            "order": index + 1,
            "title": slide_type,
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
                    "props": {"text": slide_type},
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


@pytest.mark.parametrize("step_count", [3, 4, 6])
def test_process_preserves_every_target_within_four_click_beats(
    step_count: int,
) -> None:
    plan = deterministic_fallback_plan(
        fallback_input(
            "process",
            [
                ("el_title", "title"),
                *[
                    (f"el_step_{index}", "body")
                    for index in range(1, step_count + 1)
                ],
            ],
        )
    )

    click_beats = [beat for beat in plan.beats if beat.trigger == "click"]
    assert len(click_beats) <= 4
    assert [
        element_id
        for beat in click_beats
        for element_id in beat.target_element_ids
    ] == [f"el_step_{index}" for index in range(1, step_count + 1)]


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
