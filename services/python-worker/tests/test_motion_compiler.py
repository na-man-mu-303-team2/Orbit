from __future__ import annotations

import pytest

from app.ai.motion_planner.compiler import (
    MotionCompileError,
    compile_narrative_motion,
)
from app.ai.motion_planner.models import ExtractedMotionContext, NarrativeMotionPlan


def context() -> ExtractedMotionContext:
    return ExtractedMotionContext.model_validate(
        {
            "slideType": "solution",
            "narrativeIntent": "emphasize",
            "targets": [
                {
                    "elementId": "el_title",
                    "semanticRole": "title",
                    "groupId": None,
                    "readingOrder": 1,
                    "emphasis": "primary",
                    "geometryBucket": "top",
                },
                {
                    "elementId": "el_body",
                    "semanticRole": "body",
                    "groupId": None,
                    "readingOrder": 2,
                    "emphasis": "secondary",
                    "geometryBucket": "left",
                },
                {
                    "elementId": "el_media",
                    "semanticRole": "media",
                    "groupId": None,
                    "readingOrder": 3,
                    "emphasis": "primary",
                    "geometryBucket": "right",
                },
            ],
            "approvedCueCount": 1,
            "notesPresent": False,
            "notesTruncated": False,
        }
    )


def plan() -> NarrativeMotionPlan:
    return NarrativeMotionPlan.model_validate(
        {
            "schemaVersion": 2,
            "pattern": "hero-then-support",
            "pacing": "balanced",
            "beats": [
                {
                    "beatId": "beat_entry",
                    "purpose": "orient",
                    "trigger": "entry",
                    "relation": "together",
                    "targets": [
                        {
                            "elementId": "el_title",
                            "motionIntent": "introduce",
                        }
                    ],
                },
                {
                    "beatId": "beat_click_1",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {"elementId": "el_body", "motionIntent": "support"},
                        {"elementId": "el_media", "motionIntent": "reveal"},
                    ],
                },
            ],
        }
    )


def test_compiler_generates_stable_ids_modes_effects_and_budget() -> None:
    first = compile_narrative_motion(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan(),
        context=context(),
    )
    second = compile_narrative_motion(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan(),
        context=context(),
    )

    assert first.model_dump(by_alias=True) == second.model_dump(by_alias=True)
    assert [operation.animation.type for operation in first.operations] == [
        "fade-in",
        "appear",
        "zoom-in",
    ]
    assert [operation.animation.start_mode for operation in first.operations] == [
        "on-slide-enter",
        "on-click",
        "after-previous",
    ]
    assert all(
        operation.animation.animation_id.startswith("anim_motion_")
        for operation in first.operations
    )
    assert first.entry_motion_ms == 400
    assert first.max_click_step_motion_ms == 750
    assert first.total_motion_ms == 1_150


def test_compiler_rejects_click_step_over_1200ms_without_partial_operations() -> None:
    over_budget_context = context().model_copy(deep=True)
    over_budget_context.targets.append(
        over_budget_context.targets[-1].model_copy(
            update={"element_id": "el_media_2", "reading_order": 4}
        )
    )
    over_budget_context.targets.append(
        over_budget_context.targets[-1].model_copy(
            update={"element_id": "el_media_3", "reading_order": 5}
        )
    )
    over_budget_plan = NarrativeMotionPlan.model_validate(
        {
            "schemaVersion": 2,
            "pattern": "cluster-reveal",
            "pacing": "deliberate",
            "beats": [
                {
                    "beatId": "beat_click_1",
                    "purpose": "reveal",
                    "trigger": "click",
                    "targets": [
                        {"elementId": "el_media", "motionIntent": "focus"},
                        {"elementId": "el_media_2", "motionIntent": "focus"},
                        {"elementId": "el_media_3", "motionIntent": "focus"},
                    ],
                    "relation": "sequence",
                }
            ],
        }
    )

    with pytest.raises(MotionCompileError, match="1200ms"):
        compile_narrative_motion(
            deck_id="deck_1",
            slide_id="slide_1",
            base_version=7,
            plan=over_budget_plan,
            context=over_budget_context,
        )


def test_compiler_uses_ai_intent_and_pacing_for_slide_specific_motion() -> None:
    deliberate = plan().model_copy(deep=True)
    deliberate.pacing = "deliberate"
    deliberate.beats[1].targets[0].motion_intent = "focus"
    brisk = deliberate.model_copy(deep=True)
    brisk.pacing = "brisk"
    brisk.beats[1].targets[0].motion_intent = "connect"

    deliberate_result = compile_narrative_motion(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=deliberate,
        context=context(),
    )
    brisk_result = compile_narrative_motion(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=brisk,
        context=context(),
    )

    assert deliberate_result.operations[1].animation.type == "zoom-in"
    assert deliberate_result.operations[1].animation.duration_ms == 550
    assert brisk_result.operations[1].animation.type == "appear"
    assert brisk_result.operations[1].animation.duration_ms == 200


def test_compiler_fails_closed_when_merge_is_required() -> None:
    with pytest.raises(MotionCompileError, match="merge-and-safety"):
        compile_narrative_motion(
            deck_id="deck_1",
            slide_id="slide_1",
            base_version=7,
            plan=plan(),
            context=context(),
            existing_animations=[
                {
                    "animationId": "anim_existing",
                    "elementId": "el_body",
                    "order": 1,
                }
            ],
        )
