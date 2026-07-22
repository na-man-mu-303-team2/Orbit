from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.extractor import MotionPromptInput
from app.ai.motion_planner.models import (
    NarrativeBeat,
    NarrativeMotionPlan,
    SlideType,
)
from app.ai.motion_planner.prompt import (
    motion_planner_system_prompt,
    motion_planner_user_prompt,
    narrative_motion_response_format,
)

MotionPlannerFallbackReason = Literal[
    "provider-unavailable", "provider-error", "empty-response", "invalid-plan"
]
NarrativePattern = Literal[
    "hero-then-support",
    "stepwise-process",
    "paired-comparison",
    "evidence-then-insight",
    "cluster-reveal",
    "summary-recap",
]
BeatPurpose = Literal[
    "orient", "reveal", "connect", "contrast", "emphasize", "conclude"
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


def deterministic_fallback_plan(
    extraction: MotionPromptInput,
) -> NarrativeMotionPlan:
    targets = sorted(extraction.context.targets, key=lambda target: target.reading_order)
    if not targets:
        raise ValueError("Motion fallback requires at least one target")
    pattern = _pattern(extraction.context.slide_type)
    primary = next(
        (
            target
            for target in targets
            if target.semantic_role in {"title", "subtitle", "focal"}
            or target.emphasis == "primary"
        ),
        targets[0],
    )
    entry_ids = [primary.element_id]
    if (
        extraction.context.slide_type in {"cover", "title", "quote"}
        and len(targets) > 1
        and targets[1].semantic_role in {"subtitle", "supporting"}
    ):
        entry_ids.append(targets[1].element_id)
    remaining = [target for target in targets if target.element_id not in entry_ids]
    beats = [
        NarrativeBeat(
            beatId="beat_entry",
            purpose="orient",
            trigger="entry",
            targetElementIds=entry_ids,
            relation="together",
        )
    ]
    grouped = _fallback_groups(extraction.context.slide_type, remaining)
    for index, group in enumerate(grouped[:4], start=1):
        beats.append(
            NarrativeBeat(
                beatId=f"beat_click_{index}",
                purpose=_click_purpose(extraction.context.slide_type, index, len(grouped)),
                trigger="click",
                targetElementIds=[target.element_id for target in group],
                relation=(
                    "together"
                    if extraction.context.slide_type in {"comparison", "feature-grid"}
                    else "sequence"
                ),
            )
        )
    return NarrativeMotionPlan(schemaVersion=1, pattern=pattern, beats=beats)


def _fallback_groups(slide_type: SlideType, targets: list[Any]) -> list[list[Any]]:
    if not targets:
        return []
    if slide_type in {"comparison", "feature-grid", "architecture", "summary"}:
        return [targets[index : index + 2] for index in range(0, len(targets), 2)]
    return [[target] for target in targets]


def _pattern(slide_type: SlideType) -> NarrativePattern:
    patterns: dict[SlideType, NarrativePattern] = {
        "process": "stepwise-process",
        "comparison": "paired-comparison",
        "data": "evidence-then-insight",
        "chart": "evidence-then-insight",
        "feature-grid": "cluster-reveal",
        "architecture": "cluster-reveal",
        "summary": "summary-recap",
    }
    return patterns.get(slide_type, "hero-then-support")


def _click_purpose(
    slide_type: SlideType, index: int, total: int
) -> BeatPurpose:
    if slide_type == "comparison":
        return "contrast"
    if slide_type in {"data", "chart"} and index == total:
        return "emphasize"
    if slide_type == "summary" and index == total:
        return "conclude"
    return "reveal"
