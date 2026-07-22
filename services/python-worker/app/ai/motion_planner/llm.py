from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.extractor import MotionPromptInput
from app.ai.motion_planner.fallback import deterministic_fallback_plan
from app.ai.motion_planner.models import NarrativeMotionPlan
from app.ai.motion_planner.prompt import (
    motion_planner_system_prompt,
    motion_planner_user_prompt,
    narrative_motion_response_format,
)

MotionPlannerFallbackReason = Literal[
    "provider-unavailable", "provider-error", "empty-response", "invalid-plan"
]


@dataclass(frozen=True)
class MotionPlannerResult:
    plan: NarrativeMotionPlan
    fallback_used: bool
    reason_code: MotionPlannerFallbackReason | None


def plan_narrative_motion(
    extraction: MotionPromptInput,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> MotionPlannerResult:
    fallback = deterministic_fallback_plan(extraction)
    api_client: Any = client
    if api_client is None:
        if not api_key:
            return MotionPlannerResult(fallback, True, "provider-unavailable")
        try:
            from openai import OpenAI

            api_client = OpenAI(api_key=api_key)
        except Exception:
            return MotionPlannerResult(fallback, True, "provider-unavailable")

    try:
        response = api_client.responses.create(
            model=model,
            instructions=motion_planner_system_prompt(),
            input=motion_planner_user_prompt(extraction),
            text=narrative_motion_response_format(),
        )
        output_text = str(getattr(response, "output_text", "")).strip()
        if not output_text:
            return MotionPlannerResult(fallback, True, "empty-response")
        plan = NarrativeMotionPlan.model_validate_json(output_text)
        plan.validate_allowlist(
            {target.element_id for target in extraction.context.targets}
        )
        return MotionPlannerResult(plan, False, None)
    except Exception:
        return MotionPlannerResult(fallback, True, "invalid-plan")
