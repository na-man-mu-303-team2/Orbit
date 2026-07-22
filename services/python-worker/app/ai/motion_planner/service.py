from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.compiler import MotionCompileError
from app.ai.motion_planner.eligibility import (
    MotionImportContext,
    evaluate_motion_eligibility,
    motion_eligibility_message,
)
from app.ai.motion_planner.extractor import extract_motion_context
from app.ai.motion_planner.llm import plan_narrative_motion
from app.ai.motion_planner.merge import merge_narrative_motion
from app.ai.motion_planner.models import MotionPlanningContext


@dataclass(frozen=True)
class SemanticMotionResult:
    outcome: Literal["applicable", "not-needed", "refused-unsafe"]
    message: str
    operations: list[dict[str, Any]]
    affected_element_ids: list[str]
    fallback_used: bool
    reason_code: str | None
    beat_count: int
    click_count: int


def plan_and_compile_motion(
    *,
    deck_id: str,
    base_version: int,
    slide: dict[str, Any],
    planning_context: MotionPlanningContext | None,
    import_context: MotionImportContext | None,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> SemanticMotionResult:
    eligibility = evaluate_motion_eligibility(slide, import_context=import_context)
    if eligibility.outcome != "applicable":
        assert eligibility.reason_code is not None
        return SemanticMotionResult(
            outcome=eligibility.outcome,
            message=motion_eligibility_message(eligibility.reason_code),
            operations=[],
            affected_element_ids=[],
            fallback_used=False,
            reason_code=eligibility.reason_code,
            beat_count=0,
            click_count=0,
        )
    if planning_context is None or set(
        planning_context.allowed_target_element_ids
    ) != set(eligibility.allowed_target_element_ids):
        return _unsafe("MOTION_CONTEXT_MISMATCH")
    extraction = extract_motion_context(slide, planning_context)
    if not extraction.context.targets:
        return SemanticMotionResult(
            outcome="not-needed",
            message="추천할 수 있는 새 애니메이션 대상이 없습니다.",
            operations=[],
            affected_element_ids=[],
            fallback_used=False,
            reason_code="NO_MOTION_TARGETS",
            beat_count=0,
            click_count=0,
        )
    planner = plan_narrative_motion(
        extraction,
        model=model,
        api_key=api_key,
        client=client,
    )
    slide_id = str(slide.get("slideId", ""))
    if not slide_id:
        return _unsafe("SLIDE_ID_MISSING")
    animations = [
        animation
        for animation in slide.get("animations", [])
        if isinstance(animation, dict)
    ]
    animations_by_id = {
        str(animation.get("animationId")): animation for animation in animations
    }
    try:
        compiled = merge_narrative_motion(
            deck_id=deck_id,
            slide=slide,
            base_version=base_version,
            plan=planner.plan,
            context=extraction.context,
        )
    except (MotionCompileError, ValueError):
        return _unsafe("MOTION_COMPILE_UNSAFE", fallback_used=planner.fallback_used)
    operations = [
        operation for operation in compiled.operations
    ]
    affected_element_ids = [
        (
            str(operation["animation"]["elementId"])
            if operation["type"] == "add_animation"
            else str(animations_by_id[operation["animationId"]]["elementId"])
        )
        for operation in compiled.operations
    ]
    return SemanticMotionResult(
        outcome="applicable",
        message=(
            f"발표 흐름에 맞춘 {len(compiled.operations)}개의 "
            "애니메이션 변경안을 준비했습니다."
        ),
        operations=operations,
        affected_element_ids=affected_element_ids,
        fallback_used=planner.fallback_used,
        reason_code=planner.reason_code,
        beat_count=len(planner.plan.beats),
        click_count=sum(beat.trigger == "click" for beat in planner.plan.beats),
    )


def _unsafe(
    reason_code: str, *, fallback_used: bool = False
) -> SemanticMotionResult:
    return SemanticMotionResult(
        outcome="refused-unsafe",
        message="현재 슬라이드의 애니메이션 흐름을 안전하게 구성할 수 없습니다.",
        operations=[],
        affected_element_ids=[],
        fallback_used=fallback_used,
        reason_code=reason_code,
        beat_count=0,
        click_count=0,
    )
