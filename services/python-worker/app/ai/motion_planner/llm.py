from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.ai.motion_planner.errors import MotionPlannerError
from app.ai.motion_planner.extractor import MotionPromptInput, MotionPromptInputV3
from app.ai.motion_planner.library import narrative_pattern_for_slide_type
from app.ai.motion_planner.models import (
    NarrativeMotionPlan,
    NarrativeMotionPlanDraftV3,
    NarrativeMotionPlanV3,
)
from app.ai.motion_planner.prompt import (
    motion_planner_system_prompt,
    motion_planner_v3_system_prompt,
    motion_planner_user_prompt,
    motion_planner_v3_user_prompt,
    narrative_motion_response_format,
    narrative_motion_v3_response_format,
)

@dataclass(frozen=True)
class MotionPlannerResult:
    plan: NarrativeMotionPlan
    attempt_count: int


@dataclass(frozen=True)
class MotionPlannerResultV3:
    plan: NarrativeMotionPlanV3
    attempt_count: int


def _motion_api_client(api_key: str | None, client: Any | None) -> Any:
    if client is not None:
        return client
    if not api_key:
        raise MotionPlannerError(
            "MOTION_AI_PROVIDER_UNAVAILABLE",
            retryable=False,
        )
    try:
        from openai import OpenAI

        return OpenAI(api_key=api_key, max_retries=0, timeout=15.0)
    except Exception as error:
        raise MotionPlannerError(
            "MOTION_AI_PROVIDER_UNAVAILABLE",
            retryable=False,
        ) from error


def plan_narrative_motion(
    extraction: MotionPromptInput,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
    max_attempts: int = 2,
) -> MotionPlannerResult:
    if max_attempts not in {1, 2}:
        raise ValueError("Motion planner max_attempts must be 1 or 2")
    api_client = _motion_api_client(api_key, client)

    last_error = MotionPlannerError("MOTION_AI_PROVIDER_UNAVAILABLE")
    for attempt_count in range(1, max_attempts + 1):
        try:
            response = api_client.responses.create(
                model=model,
                instructions=motion_planner_system_prompt(),
                input=motion_planner_user_prompt(extraction),
                text=narrative_motion_response_format(),
            )
        except Exception:
            last_error = MotionPlannerError("MOTION_AI_PROVIDER_UNAVAILABLE")
            continue
        output_text = str(getattr(response, "output_text", "")).strip()
        if not output_text:
            last_error = MotionPlannerError("MOTION_AI_EMPTY_RESPONSE")
            continue
        try:
            plan = NarrativeMotionPlan.model_validate_json(output_text)
            plan.validate_allowlist(
                {target.element_id for target in extraction.context.targets}
            )
        except ValueError:
            last_error = MotionPlannerError("MOTION_AI_INVALID_PLAN")
            continue
        return MotionPlannerResult(plan=plan, attempt_count=attempt_count)
    raise last_error


def plan_narrative_motion_v3(
    extraction: MotionPromptInputV3,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
    max_attempts: int = 2,
) -> MotionPlannerResultV3:
    if max_attempts not in {1, 2}:
        raise ValueError("Motion planner max_attempts must be 1 or 2")
    api_client = _motion_api_client(api_key, client)

    last_error = MotionPlannerError("MOTION_AI_PROVIDER_UNAVAILABLE")
    allowed_unit_ids = {unit.unit_id for unit in extraction.context.units}
    pattern = narrative_pattern_for_slide_type(extraction.context.slide_type)
    for attempt_count in range(1, max_attempts + 1):
        try:
            response = api_client.responses.create(
                model=model,
                instructions=motion_planner_v3_system_prompt(),
                input=motion_planner_v3_user_prompt(extraction),
                text=narrative_motion_v3_response_format(),
            )
        except Exception:
            last_error = MotionPlannerError("MOTION_AI_PROVIDER_UNAVAILABLE")
            continue
        output_text = str(getattr(response, "output_text", "")).strip()
        if not output_text:
            last_error = MotionPlannerError("MOTION_AI_EMPTY_RESPONSE")
            continue
        try:
            draft = NarrativeMotionPlanDraftV3.model_validate_json(output_text)
            draft.validate_allowlist(allowed_unit_ids)
            plan = NarrativeMotionPlanV3(
                **draft.model_dump(by_alias=True),
                pattern=pattern,
            )
            plan.validate_canonical_structure(
                extraction.context.units,
                extraction.context.structure_family,
            )
        except ValueError:
            last_error = MotionPlannerError("MOTION_AI_INVALID_PLAN")
            continue
        return MotionPlannerResultV3(plan=plan, attempt_count=attempt_count)
    raise last_error
