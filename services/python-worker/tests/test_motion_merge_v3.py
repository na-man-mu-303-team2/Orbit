from __future__ import annotations

import pytest

from app.ai.motion_planner import (
    ExtractedMotionContextV3,
    MotionMergeValidationError,
    NarrativeMotionPlanV3,
    merge_narrative_motion_v3,
)


def context() -> ExtractedMotionContextV3:
    return ExtractedMotionContextV3.model_validate(
        {
            "slideType": "feature-grid",
            "narrativeIntent": "sequence",
            "units": [
                {
                    "unitId": "motion_unit_card",
                    "kind": "spatial-cluster",
                    "animationElementIds": [
                        "el_card",
                        "el_number",
                        "el_body",
                    ],
                    "memberElementIds": ["el_card", "el_number", "el_body"],
                    "semanticRole": "card",
                    "readingOrder": 1,
                    "emphasis": "primary",
                    "geometryBucket": "center",
                }
            ],
            "approvedCueCount": 0,
            "notesPresent": False,
            "notesTruncated": False,
        }
    )


def plan() -> NarrativeMotionPlanV3:
    return NarrativeMotionPlanV3.model_validate(
        {
            "schemaVersion": 3,
            "pattern": "cluster-reveal",
            "pacing": "balanced",
            "beats": [
                {
                    "beatId": "beat_click_1",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "together",
                    "targets": [
                        {
                            "unitId": "motion_unit_card",
                            "motionIntent": "reveal",
                        }
                    ],
                }
            ],
        }
    )


def slide() -> dict:
    return {
        "slideId": "slide_1",
        "elements": [
            {"elementId": "el_card", "type": "rect"},
            {"elementId": "el_number", "type": "text"},
            {"elementId": "el_body", "type": "text"},
        ],
        "animations": [],
        "actions": [],
    }


def test_v3_merge_includes_every_spatial_unit_member() -> None:
    result = merge_narrative_motion_v3(
        deck_id="deck_1",
        slide=slide(),
        base_version=1,
        plan=plan(),
        context=context(),
    )

    assert {
        operation["animation"]["elementId"] for operation in result.operations
    } == {"el_card", "el_number", "el_body"}
    assert [operation["animation"]["startMode"] for operation in result.operations] == [
        "on-click",
        "with-previous",
        "with-previous",
    ]


def test_v3_merge_rejects_whole_unit_when_one_member_has_unsafe_effect() -> None:
    current = slide()
    current["animations"] = [
        {
            "animationId": "anim_user_number",
            "elementId": "el_number",
            "type": "rotate",
            "order": 1,
            "startMode": "on-click",
            "durationMs": 300,
            "delayMs": 0,
            "easing": "ease-out",
        }
    ]

    with pytest.raises(MotionMergeValidationError, match="atomic motion unit"):
        merge_narrative_motion_v3(
            deck_id="deck_1",
            slide=current,
            base_version=1,
            plan=plan(),
            context=context(),
        )


def test_v3_merge_rejects_referenced_member_timeline_conflict() -> None:
    current = slide()
    current["animations"] = [
        {
            "animationId": f"anim_user_{suffix}",
            "elementId": element_id,
            "type": "fade-in",
            "order": index,
            "startMode": start_mode,
            "durationMs": 300,
            "delayMs": 0,
            "easing": "ease-out",
        }
        for index, (suffix, element_id, start_mode) in enumerate(
            [
                ("card", "el_card", "on-click"),
                ("number", "el_number", "with-previous"),
                ("body", "el_body", "on-click"),
            ],
            start=1,
        )
    ]
    current["actions"] = [
        {
            "actionId": "action_play_body",
            "effect": {
                "kind": "play-animation",
                "animationId": "anim_user_body",
            },
        }
    ]

    with pytest.raises(MotionMergeValidationError, match="canonical unit timeline"):
        merge_narrative_motion_v3(
            deck_id="deck_1",
            slide=current,
            base_version=1,
            plan=plan(),
            context=context(),
        )
