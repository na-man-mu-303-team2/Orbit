from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.ai.motion_planner.compiler import compile_narrative_motion
from app.ai.motion_planner.models import ExtractedMotionContext, NarrativeMotionPlan
from app.ai.motion_planner.validation import (
    MotionMergeValidationError,
    validate_existing_motion_graph,
)

SAFE_EFFECTS = {"appear", "fade-in", "zoom-in"}


@dataclass(frozen=True)
class MergedMotion:
    operations: list[dict[str, Any]]
    entry_motion_ms: int
    max_click_step_motion_ms: int
    total_motion_ms: int


def merge_narrative_motion(
    *,
    deck_id: str,
    slide: dict[str, Any],
    base_version: int,
    plan: NarrativeMotionPlan,
    context: ExtractedMotionContext,
) -> MergedMotion:
    validate_existing_motion_graph(slide)
    existing = [
        animation
        for animation in slide.get("animations", [])
        if isinstance(animation, dict)
    ]
    by_target: dict[str, list[dict[str, Any]]] = {}
    for animation in existing:
        by_target.setdefault(str(animation.get("elementId", "")), []).append(animation)
    referenced_ids = {
        str(effect.get("animationId"))
        for action in slide.get("actions", [])
        if isinstance(action, dict)
        and isinstance((effect := action.get("effect")), dict)
        and effect.get("kind") == "play-animation"
    }
    compiled = compile_narrative_motion(
        deck_id=deck_id,
        slide_id=str(slide.get("slideId", "")),
        base_version=base_version,
        plan=plan,
        context=context,
        existing_animations=existing,
        allow_existing_targets=True,
    )
    operations: list[dict[str, Any]] = []
    for desired_operation in compiled.operations:
        desired = desired_operation.animation
        matches = by_target.get(desired.element_id, [])
        if len(matches) > 1:
            raise MotionMergeValidationError(
                "multiple animations on a target require unsafe reordering"
            )
        if not matches:
            operations.append(desired_operation.model_dump(by_alias=True))
            continue
        existing_animation = matches[0]
        existing_id = str(existing_animation["animationId"])
        existing_type = str(existing_animation.get("type", ""))
        if existing_type not in SAFE_EFFECTS:
            continue
        if existing_id in referenced_ids and existing_animation.get(
            "startMode"
        ) != desired.start_mode:
            continue
        patch = {
            "type": desired.type,
            "durationMs": desired.duration_ms,
            "delayMs": desired.delay_ms,
            "easing": desired.easing,
        }
        if all(existing_animation.get(key) == value for key, value in patch.items()):
            continue
        operations.append(
            {
                "type": "update_animation",
                "slideId": str(slide.get("slideId", "")),
                "animationId": existing_id,
                "animation": patch,
            }
        )
    if any(operation.get("type") == "delete_animation" for operation in operations):
        raise MotionMergeValidationError("recommendation must not delete animations")
    return MergedMotion(
        operations=operations,
        entry_motion_ms=compiled.entry_motion_ms,
        max_click_step_motion_ms=compiled.max_click_step_motion_ms,
        total_motion_ms=compiled.total_motion_ms,
    )
