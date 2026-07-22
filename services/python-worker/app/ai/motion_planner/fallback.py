from __future__ import annotations

from typing import Any, Literal

from app.ai.motion_planner.extractor import MotionPromptInput
from app.ai.motion_planner.library import narrative_pattern_for_slide_type
from app.ai.motion_planner.models import NarrativeBeat, NarrativeMotionPlan, SlideType

BeatPurpose = Literal[
    "orient", "reveal", "connect", "contrast", "emphasize", "conclude"
]


def deterministic_fallback_plan(
    extraction: MotionPromptInput,
) -> NarrativeMotionPlan:
    targets = sorted(extraction.context.targets, key=lambda target: target.reading_order)
    if not targets:
        raise ValueError("Motion fallback requires at least one target")
    slide_type = extraction.context.slide_type
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
        slide_type in {"cover", "title", "quote"}
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
    grouped = _fallback_groups(slide_type, remaining)
    for index, group in enumerate(grouped[:4], start=1):
        beats.append(
            NarrativeBeat(
                beatId=f"beat_click_{index}",
                purpose=_click_purpose(slide_type, index, len(grouped)),
                trigger="click",
                targetElementIds=[target.element_id for target in group],
                relation=(
                    "together"
                    if slide_type in {"comparison", "feature-grid"}
                    else "sequence"
                ),
            )
        )
    return NarrativeMotionPlan(
        schemaVersion=1,
        pattern=narrative_pattern_for_slide_type(slide_type),
        beats=beats,
    )


def _fallback_groups(slide_type: SlideType, targets: list[Any]) -> list[list[Any]]:
    if not targets:
        return []
    if slide_type in {"comparison", "feature-grid", "architecture", "summary"}:
        return [targets[index : index + 2] for index in range(0, len(targets), 2)]
    return [[target] for target in targets]


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
