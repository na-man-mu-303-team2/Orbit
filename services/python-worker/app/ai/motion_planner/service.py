from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.compiler import MotionCompileError
from app.ai.motion_planner.errors import MotionPlannerError
from app.ai.motion_planner.eligibility import (
    MotionImportContext,
    evaluate_motion_eligibility,
    motion_eligibility_message,
)
from app.ai.motion_planner.extractor import (
    extract_motion_context,
    extract_motion_units,
)
from app.ai.motion_planner.llm import (
    plan_narrative_motion,
    plan_narrative_motion_v3,
)
from app.ai.motion_planner.merge import (
    merge_narrative_motion,
    merge_narrative_motion_v3,
)
from app.ai.motion_planner.models import (
    MotionPlanMetadata,
    MotionPlanMetadataV3,
    MotionPlanningContext,
    MotionPlanUnit,
)


@dataclass(frozen=True)
class SemanticMotionResult:
    outcome: Literal["applicable", "not-needed", "refused-unsafe"]
    message: str
    operations: list[dict[str, Any]]
    affected_element_ids: list[str]
    reason_code: str | None
    beat_count: int
    click_count: int
    motion_plan: MotionPlanMetadata | MotionPlanMetadataV3 | None


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
            reason_code=eligibility.reason_code,
            beat_count=0,
            click_count=0,
            motion_plan=None,
        )
    if planning_context is None or set(
        planning_context.allowed_target_element_ids
    ) != set(eligibility.allowed_target_element_ids):
        return _unsafe("MOTION_CONTEXT_MISMATCH")
    use_semantic_units = eligibility.source == "authored"
    extraction_v3 = (
        extract_motion_units(slide, planning_context) if use_semantic_units else None
    )
    extraction_v2 = (
        extract_motion_context(slide, planning_context)
        if not use_semantic_units
        else None
    )
    if (
        extraction_v3 is not None
        and not extraction_v3.context.units
        or extraction_v2 is not None
        and not extraction_v2.context.targets
    ):
        return SemanticMotionResult(
            outcome="not-needed",
            message="추천할 수 있는 새 애니메이션 대상이 없습니다.",
            operations=[],
            affected_element_ids=[],
            reason_code="NO_MOTION_TARGETS",
            beat_count=0,
            click_count=0,
            motion_plan=None,
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
    for attempt_count in range(1, 3):
        try:
            if extraction_v3 is not None:
                planner_v3 = plan_narrative_motion_v3(
                    extraction_v3,
                    model=model,
                    api_key=api_key,
                    client=client,
                    max_attempts=1,
                )
                compiled = merge_narrative_motion_v3(
                    deck_id=deck_id,
                    slide=slide,
                    base_version=base_version,
                    plan=planner_v3.plan,
                    context=extraction_v3.context,
                )
            else:
                assert extraction_v2 is not None
                planner_v2 = plan_narrative_motion(
                    extraction_v2,
                    model=model,
                    api_key=api_key,
                    client=client,
                    max_attempts=1,
                )
                compiled = merge_narrative_motion(
                    deck_id=deck_id,
                    slide=slide,
                    base_version=base_version,
                    plan=planner_v2.plan,
                    context=extraction_v2.context,
                )
            break
        except MotionPlannerError as error:
            if not error.retryable or attempt_count == 2:
                raise
        except (MotionCompileError, ValueError) as error:
            if attempt_count == 2:
                raise MotionPlannerError("MOTION_AI_COMPILE_UNSAFE") from error
    else:
        raise MotionPlannerError("MOTION_AI_COMPILE_UNSAFE")
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
    completed_attempt: Literal[1, 2] = 1 if attempt_count == 1 else 2
    if extraction_v3 is not None:
        selected_unit_ids = {
            target.unit_id
            for beat in planner_v3.plan.beats
            for target in beat.targets
        }
        motion_plan: MotionPlanMetadata | MotionPlanMetadataV3 = MotionPlanMetadataV3(
            source="llm",
            model=model,
            attemptCount=completed_attempt,
            compilerVersion="motion-compiler-v3",
            units=[
                MotionPlanUnit(
                    unitId=unit.unit_id,
                    kind=unit.kind,
                    animationElementIds=unit.animation_element_ids,
                    memberElementIds=unit.member_element_ids,
                    semanticRole=unit.semantic_role,
                    readingOrder=unit.reading_order,
                )
                for unit in extraction_v3.context.units
                if unit.unit_id in selected_unit_ids
            ],
            plan=planner_v3.plan,
        )
        beat_count = len(planner_v3.plan.beats)
        click_count = sum(
            beat.trigger == "click" for beat in planner_v3.plan.beats
        )
    else:
        motion_plan = MotionPlanMetadata(
            source="llm",
            model=model,
            attemptCount=completed_attempt,
            compilerVersion="motion-compiler-v2",
            plan=planner_v2.plan,
        )
        beat_count = len(planner_v2.plan.beats)
        click_count = sum(
            beat.trigger == "click" for beat in planner_v2.plan.beats
        )
    return SemanticMotionResult(
        outcome="applicable",
        message=(
            f"발표 흐름에 맞춘 {len(compiled.operations)}개의 "
            "애니메이션 변경안을 준비했습니다."
        ),
        operations=operations,
        affected_element_ids=affected_element_ids,
        reason_code=None,
        beat_count=beat_count,
        click_count=click_count,
        motion_plan=motion_plan,
    )


def _unsafe(reason_code: str) -> SemanticMotionResult:
    return SemanticMotionResult(
        outcome="refused-unsafe",
        message="현재 슬라이드의 애니메이션 흐름을 안전하게 구성할 수 없습니다.",
        operations=[],
        affected_element_ids=[],
        reason_code=reason_code,
        beat_count=0,
        click_count=0,
        motion_plan=None,
    )
