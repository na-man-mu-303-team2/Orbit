from __future__ import annotations

import pytest

from app.ai.motion_planner import (
    MotionMergeValidationError,
    merge_narrative_motion,
    validate_existing_motion_graph,
)
from app.ai.motion_planner.models import ExtractedMotionContext, NarrativeMotionPlan


def context() -> ExtractedMotionContext:
    return ExtractedMotionContext.model_validate(
        {
            "slideType": "solution",
            "narrativeIntent": "emphasize",
            "targets": [
                {
                    "elementId": "el_existing",
                    "semanticRole": "title",
                    "groupId": None,
                    "readingOrder": 1,
                    "emphasis": "primary",
                    "geometryBucket": "top",
                },
                {
                    "elementId": "el_new",
                    "semanticRole": "media",
                    "groupId": None,
                    "readingOrder": 2,
                    "emphasis": "secondary",
                    "geometryBucket": "right",
                },
            ],
            "approvedCueCount": 0,
            "notesPresent": False,
            "notesTruncated": False,
        }
    )


def plan() -> NarrativeMotionPlan:
    return NarrativeMotionPlan.model_validate(
        {
            "schemaVersion": 1,
            "pattern": "hero-then-support",
            "beats": [
                {
                    "beatId": "beat_entry",
                    "purpose": "orient",
                    "trigger": "entry",
                    "targetElementIds": ["el_existing"],
                    "relation": "together",
                },
                {
                    "beatId": "beat_click_1",
                    "purpose": "reveal",
                    "trigger": "click",
                    "targetElementIds": ["el_new"],
                    "relation": "together",
                },
            ],
        }
    )


def slide(existing_type: str = "rotate") -> dict:
    return {
        "slideId": "slide_1",
        "elements": [
            {"elementId": "el_existing", "type": "text"},
            {"elementId": "el_new", "type": "image"},
        ],
        "animations": [
            {
                "animationId": "anim_existing",
                "elementId": "el_existing",
                "type": existing_type,
                "order": 1,
                "startMode": "on-click",
                "durationMs": 500,
                "delayMs": 0,
                "easing": "ease-out",
            }
        ],
        "actions": [
            {
                "actionId": "act_1",
                "effect": {
                    "kind": "play-animation",
                    "animationId": "anim_existing",
                },
            }
        ],
    }


def test_merge_preserves_referenced_user_effect_and_adds_only_new_target() -> None:
    result = merge_narrative_motion(
        deck_id="deck_1",
        slide=slide(),
        base_version=1,
        plan=plan(),
        context=context(),
    )

    assert [operation["type"] for operation in result.operations] == [
        "add_animation"
    ]
    assert result.operations[0]["animation"]["elementId"] == "el_new"
    assert all(operation["type"] != "delete_animation" for operation in result.operations)


def test_safe_update_keeps_existing_animation_id() -> None:
    current = slide("fade-in")
    current["actions"] = []
    result = merge_narrative_motion(
        deck_id="deck_1",
        slide=current,
        base_version=1,
        plan=plan(),
        context=context(),
    )

    update = result.operations[0]
    assert update["type"] == "update_animation"
    assert update["animationId"] == "anim_existing"
    assert "elementId" not in update["animation"]
    assert all(operation["type"] != "delete_animation" for operation in result.operations)


def test_merge_rejects_multiple_target_animations_without_partial_result() -> None:
    current = slide()
    current["animations"].append(
        {
            **current["animations"][0],
            "animationId": "anim_existing_2",
            "order": 2,
        }
    )

    with pytest.raises(MotionMergeValidationError, match="multiple animations"):
        merge_narrative_motion(
            deck_id="deck_1",
            slide=current,
            base_version=1,
            plan=plan(),
            context=context(),
        )


@pytest.mark.parametrize("failure", ["duplicate", "missing-target", "dangling", "orphan"])
def test_existing_graph_validation_fails_closed(failure: str) -> None:
    current = slide()
    if failure == "duplicate":
        current["animations"].append({**current["animations"][0], "order": 2})
    elif failure == "missing-target":
        current["animations"][0]["elementId"] = "el_missing"
    elif failure == "dangling":
        current["actions"][0]["effect"]["animationId"] = "anim_missing"
    else:
        current["actions"] = []
        current["animations"][0]["startMode"] = "after-previous"

    with pytest.raises(MotionMergeValidationError):
        validate_existing_motion_graph(current)
