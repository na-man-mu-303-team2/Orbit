from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ai.motion_planner.library import (
    COMPILER_VERSION,
    MAX_CLICK_STEP_MOTION_MS,
    MAX_ENTRY_MOTION_MS,
    MAX_TOTAL_MOTION_MS,
    AnimationEffect,
    effect_spec_for_target,
)
from app.ai.motion_planner.models import ExtractedMotionContext, NarrativeMotionPlan


class MotionCompileError(ValueError):
    pass


class CompiledAnimation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    animation_id: str = Field(alias="animationId", pattern=r"^anim_")
    element_id: str = Field(alias="elementId", min_length=1)
    type: AnimationEffect
    order: int = Field(gt=0)
    start_mode: Literal[
        "on-slide-enter", "on-click", "with-previous", "after-previous"
    ] = Field(alias="startMode")
    duration_ms: int = Field(alias="durationMs", gt=0)
    delay_ms: int = Field(alias="delayMs", ge=0, le=50)
    easing: Literal["ease-out"]


class AddAnimationOperation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    type: Literal["add_animation"]
    slide_id: str = Field(alias="slideId", min_length=1)
    animation: CompiledAnimation


class CompiledMotion(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    compiler_version: Literal["motion-compiler-v2"] = Field(alias="compilerVersion")
    operations: list[AddAnimationOperation]
    entry_motion_ms: int = Field(alias="entryMotionMs", ge=0)
    max_click_step_motion_ms: int = Field(alias="maxClickStepMotionMs", ge=0)
    total_motion_ms: int = Field(alias="totalMotionMs", ge=0)


def compile_narrative_motion(
    *,
    deck_id: str,
    slide_id: str,
    base_version: int,
    plan: NarrativeMotionPlan,
    context: ExtractedMotionContext,
    existing_animations: list[dict[str, object]] | None = None,
    allow_existing_targets: bool = False,
) -> CompiledMotion:
    targets = {target.element_id: target for target in context.targets}
    plan.validate_allowlist(set(targets))
    existing = existing_animations or []
    existing_ids = {
        str(animation.get("animationId"))
        for animation in existing
        if animation.get("animationId")
    }
    existing_target_ids = {
        str(animation.get("elementId"))
        for animation in existing
        if animation.get("elementId")
    }
    plan_target_ids = {
        element_id for beat in plan.beats for element_id in beat.target_element_ids
    }
    if not allow_existing_targets and plan_target_ids & existing_target_ids:
        raise MotionCompileError(
            "existing animation targets require the merge-and-safety stage"
        )
    next_order = max((_existing_order(animation) for animation in existing), default=0) + 1
    operations: list[AddAnimationOperation] = []
    beat_durations: list[tuple[str, int]] = []

    for beat_index, beat in enumerate(plan.beats):
        durations: list[int] = []
        for target_index, planned_target in enumerate(beat.targets):
            element_id = planned_target.element_id
            target = targets.get(element_id)
            if target is None:
                raise MotionCompileError("plan target is absent from extracted context")
            spec = effect_spec_for_target(
                target,
                planned_target.motion_intent,
                plan.pacing,
            )
            durations.append(spec.duration_ms)
            animation_id = _stable_animation_id(
                deck_id=deck_id,
                slide_id=slide_id,
                element_id=element_id,
                beat_index=beat_index,
                base_version=base_version,
                existing_ids=existing_ids,
            )
            existing_ids.add(animation_id)
            operations.append(
                AddAnimationOperation(
                    type="add_animation",
                    slideId=slide_id,
                    animation=CompiledAnimation(
                        animationId=animation_id,
                        elementId=element_id,
                        type=spec.effect,
                        order=next_order,
                        startMode=_start_mode(beat.trigger, beat.relation, target_index),
                        durationMs=spec.duration_ms,
                        delayMs=0,
                        easing=spec.easing,
                    ),
                )
            )
            next_order += 1
        beat_duration = (
            max(durations, default=0)
            if beat.relation == "together"
            else sum(durations)
        )
        beat_durations.append((beat.trigger, beat_duration))

    entry_motion_ms = sum(
        duration for trigger, duration in beat_durations if trigger == "entry"
    )
    click_durations = [
        duration for trigger, duration in beat_durations if trigger == "click"
    ]
    max_click_step_motion_ms = max(click_durations, default=0)
    total_motion_ms = sum(duration for _, duration in beat_durations)
    if entry_motion_ms > MAX_ENTRY_MOTION_MS:
        raise MotionCompileError("entry motion exceeds 900ms")
    if max_click_step_motion_ms > MAX_CLICK_STEP_MOTION_MS:
        raise MotionCompileError("click step motion exceeds 1200ms")
    if total_motion_ms > MAX_TOTAL_MOTION_MS:
        raise MotionCompileError("total motion exceeds 6000ms")
    return CompiledMotion(
        compilerVersion=COMPILER_VERSION,
        operations=operations,
        entryMotionMs=entry_motion_ms,
        maxClickStepMotionMs=max_click_step_motion_ms,
        totalMotionMs=total_motion_ms,
    )


def _start_mode(
    trigger: Literal["entry", "click"],
    relation: Literal["together", "sequence"],
    target_index: int,
) -> Literal["on-slide-enter", "on-click", "with-previous", "after-previous"]:
    if target_index == 0:
        return "on-slide-enter" if trigger == "entry" else "on-click"
    return "with-previous" if relation == "together" else "after-previous"


def _existing_order(animation: dict[str, object]) -> int:
    value = animation.get("order", 0)
    return int(value) if isinstance(value, (int, float)) else 0


def _stable_animation_id(
    *,
    deck_id: str,
    slide_id: str,
    element_id: str,
    beat_index: int,
    base_version: int,
    existing_ids: set[str],
) -> str:
    source = (
        f"{COMPILER_VERSION}\0{deck_id}\0{slide_id}\0{base_version}"
        f"\0{element_id}\0{beat_index}"
    )
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    candidate = f"anim_motion_{digest}"
    suffix = 1
    while candidate in existing_ids:
        candidate = f"anim_motion_{digest}_{suffix}"
        suffix += 1
    return candidate
