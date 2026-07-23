from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.ai.motion_planner.compiler import (
    compile_narrative_motion,
    compile_narrative_motion_v3,
)
from app.ai.motion_planner.models import (
    ExtractedMotionContext,
    ExtractedMotionContextV3,
    NarrativeMotionPlan,
    NarrativeMotionPlanV3,
)
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


def merge_narrative_motion_v3(
    *,
    deck_id: str,
    slide: dict[str, Any],
    base_version: int,
    plan: NarrativeMotionPlanV3,
    context: ExtractedMotionContextV3,
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
    compiled = compile_narrative_motion_v3(
        deck_id=deck_id,
        slide_id=str(slide.get("slideId", "")),
        base_version=base_version,
        plan=plan,
        context=context,
        existing_animations=existing,
        allow_existing_targets=True,
    )
    desired_by_target = {
        operation.animation.element_id: operation.animation
        for operation in compiled.operations
    }
    unit_by_id = {unit.unit_id: unit for unit in context.units}
    for beat in plan.beats:
        for target in beat.targets:
            unit = unit_by_id[target.unit_id]
            existing_members = [
                by_target[element_id][0]
                for element_id in unit.animation_element_ids
                if len(by_target.get(element_id, [])) == 1
            ]
            if 0 < len(existing_members) < len(unit.animation_element_ids):
                raise MotionMergeValidationError(
                    "existing animation covers only part of an atomic motion unit"
                )
            if len(existing_members) > 1:
                orders = [
                    int(animation.get("order", 0))
                    for animation in existing_members
                ]
                if orders != list(range(orders[0], orders[0] + len(orders))):
                    raise MotionMergeValidationError(
                        "existing unit member animations are not contiguous"
                    )
                for element_id, animation in zip(
                    unit.animation_element_ids,
                    existing_members,
                    strict=True,
                ):
                    if (
                        animation.get("startMode")
                        != desired_by_target[element_id].start_mode
                    ):
                        raise MotionMergeValidationError(
                            "existing animation conflicts with the canonical unit timeline"
                        )
    operations: list[dict[str, Any]] = []
    accounted_target_ids: set[str] = set()
    for desired_operation in compiled.operations:
        desired = desired_operation.animation
        matches = by_target.get(desired.element_id, [])
        if len(matches) > 1:
            raise MotionMergeValidationError(
                "multiple animations on a unit member require unsafe reordering"
            )
        if not matches:
            operations.append(desired_operation.model_dump(by_alias=True))
            accounted_target_ids.add(desired.element_id)
            continue
        existing_animation = matches[0]
        existing_id = str(existing_animation["animationId"])
        existing_type = str(existing_animation.get("type", ""))
        if existing_type not in SAFE_EFFECTS:
            raise MotionMergeValidationError(
                "unsafe existing effect conflicts with an atomic motion unit"
            )
        if existing_animation.get("startMode") != desired.start_mode:
            raise MotionMergeValidationError(
                "referenced animation conflicts with the canonical unit timeline"
            )
        patch = {
            "type": desired.type,
            "durationMs": desired.duration_ms,
            "delayMs": desired.delay_ms,
            "easing": desired.easing,
        }
        operations.append(
            {
                "type": "update_animation",
                "slideId": str(slide.get("slideId", "")),
                "animationId": existing_id,
                "animation": patch,
            }
        )
        accounted_target_ids.add(desired.element_id)

    expected_target_ids = {
        operation.animation.element_id for operation in compiled.operations
    }
    if accounted_target_ids != expected_target_ids:
        raise MotionMergeValidationError(
            "atomic motion unit expansion is incomplete"
        )
    if any(operation.get("type") == "delete_animation" for operation in operations):
        raise MotionMergeValidationError("recommendation must not delete animations")
    return MergedMotion(
        operations=operations,
        entry_motion_ms=compiled.entry_motion_ms,
        max_click_step_motion_ms=compiled.max_click_step_motion_ms,
        total_motion_ms=compiled.total_motion_ms,
    )
