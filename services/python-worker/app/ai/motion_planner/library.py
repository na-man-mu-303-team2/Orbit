from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.ai.motion_planner.models import MotionTarget, SlideType

COMPILER_VERSION: Literal["motion-compiler-v1"] = "motion-compiler-v1"
MAX_ENTRY_MOTION_MS = 900
MAX_CLICK_STEP_MOTION_MS = 1_200
MAX_TOTAL_MOTION_MS = 6_000

NarrativePattern = Literal[
    "hero-then-support",
    "stepwise-process",
    "paired-comparison",
    "evidence-then-insight",
    "cluster-reveal",
    "summary-recap",
]
AnimationEffect = Literal["appear", "fade-in", "zoom-in"]


@dataclass(frozen=True)
class MotionEffectSpec:
    effect: AnimationEffect
    duration_ms: int
    easing: Literal["ease-out"] = "ease-out"


def narrative_pattern_for_slide_type(slide_type: SlideType) -> NarrativePattern:
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


def effect_spec_for_target(target: MotionTarget) -> MotionEffectSpec:
    if target.semantic_role in {"focal", "media", "data"}:
        return MotionEffectSpec(effect="zoom-in", duration_ms=450)
    if target.semantic_role in {"title", "subtitle"}:
        return MotionEffectSpec(effect="fade-in", duration_ms=400)
    return MotionEffectSpec(effect="appear", duration_ms=300)
