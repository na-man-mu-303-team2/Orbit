from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.ai.motion_planner import (
    ExtractedMotionContextV3,
    MotionCompileError,
    NarrativeMotionPlanV3,
    compile_narrative_motion_v3,
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
                    "geometryBucket": "left",
                },
                {
                    "unitId": "motion_unit_insight",
                    "kind": "element",
                    "animationElementIds": ["el_insight"],
                    "memberElementIds": ["el_insight"],
                    "semanticRole": "focal",
                    "readingOrder": 2,
                    "emphasis": "primary",
                    "geometryBucket": "bottom",
                },
            ],
            "approvedCueCount": 0,
            "notesPresent": False,
            "notesTruncated": False,
        }
    )


def plan(relation: str = "sequence") -> NarrativeMotionPlanV3:
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
                    "relation": relation,
                    "targets": [
                        {
                            "unitId": "motion_unit_card",
                            "motionIntent": "reveal",
                        },
                        {
                            "unitId": "motion_unit_insight",
                            "motionIntent": "conclude",
                        },
                    ],
                }
            ],
        }
    )


def test_v3_compiler_keeps_spatial_members_atomic_and_stable() -> None:
    first = compile_narrative_motion_v3(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan(),
        context=context(),
    )
    second = compile_narrative_motion_v3(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan(),
        context=context(),
    )

    assert first.model_dump(by_alias=True) == second.model_dump(by_alias=True)
    assert first.compiler_version == "motion-compiler-v3"
    assert [
        operation.animation.element_id for operation in first.operations
    ] == ["el_card", "el_number", "el_body", "el_insight"]
    assert [operation.animation.type for operation in first.operations] == [
        "appear",
        "appear",
        "appear",
        "fade-in",
    ]
    assert [operation.animation.start_mode for operation in first.operations] == [
        "on-click",
        "with-previous",
        "with-previous",
        "after-previous",
    ]
    assert first.max_click_step_motion_ms == 700
    assert first.total_motion_ms == 700


def test_v3_compiler_counts_unit_duration_once_for_together_beat() -> None:
    result = compile_narrative_motion_v3(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan("together"),
        context=context(),
    )

    assert [operation.animation.start_mode for operation in result.operations] == [
        "on-click",
        "with-previous",
        "with-previous",
        "with-previous",
    ]
    assert result.max_click_step_motion_ms == 400
    assert result.total_motion_ms == 400


def test_v3_compiler_animates_explicit_group_as_one_target() -> None:
    explicit_context = context().model_copy(deep=True)
    explicit_context.units[0] = explicit_context.units[0].model_copy(
        update={
            "kind": "explicit-group",
            "animation_element_ids": ["el_group"],
            "member_element_ids": ["el_card", "el_number", "el_body"],
        }
    )

    result = compile_narrative_motion_v3(
        deck_id="deck_1",
        slide_id="slide_1",
        base_version=7,
        plan=plan(),
        context=explicit_context,
    )

    assert [operation.animation.element_id for operation in result.operations] == [
        "el_group",
        "el_insight",
    ]


def test_v3_compiler_rejects_partial_spatial_target() -> None:
    partial_context = context().model_copy(deep=True)
    partial_context.units[0] = partial_context.units[0].model_copy(
        update={"animation_element_ids": ["el_card", "el_number_missing"]}
    )

    with pytest.raises(MotionCompileError, match="complete members"):
        compile_narrative_motion_v3(
            deck_id="deck_1",
            slide_id="slide_1",
            base_version=7,
            plan=plan(),
            context=partial_context,
        )


def test_v3_context_rejects_more_than_24_animation_elements() -> None:
    unit = context().units[0].model_dump(by_alias=True)
    units = []
    for index in range(7):
        units.append(
            {
                **unit,
                "unitId": f"motion_unit_card_{index}",
                "animationElementIds": [
                    f"el_{index}_{member}" for member in range(4)
                ],
                "memberElementIds": [
                    f"el_{index}_{member}" for member in range(4)
                ],
                "readingOrder": index + 1,
            }
        )

    with pytest.raises(ValidationError, match="at most 24"):
        ExtractedMotionContextV3.model_validate(
            {
                "slideType": "feature-grid",
                "narrativeIntent": "sequence",
                "units": units,
                "approvedCueCount": 0,
                "notesPresent": False,
                "notesTruncated": False,
            }
        )
