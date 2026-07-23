from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.ai.motion_planner.models import (
    MotionIntent,
    MotionTarget,
    MotionUnit,
    SlideType,
)

COMPILER_VERSION: Literal["motion-compiler-v2"] = "motion-compiler-v2"
COMPILER_VERSION_V3: Literal["motion-compiler-v3"] = "motion-compiler-v3"
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


def effect_spec_for_target(
    target: MotionTarget,
    motion_intent: MotionIntent,
    pacing: Literal["deliberate", "balanced", "brisk"],
) -> MotionEffectSpec:
    emphasis_roles = {"focal", "media", "data"}
    if motion_intent == "introduce":
        effect: AnimationEffect = "fade-in"
    elif motion_intent == "reveal":
        effect = "zoom-in" if target.semantic_role in emphasis_roles else "appear"
    elif motion_intent == "focus":
        effect = "zoom-in"
    elif motion_intent == "compare":
        effect = "fade-in"
    elif motion_intent in {"support", "connect"}:
        effect = "appear"
    else:
        effect = "zoom-in" if target.semantic_role in emphasis_roles else "fade-in"
    durations = {
        "deliberate": {"appear": 400, "fade-in": 500, "zoom-in": 550},
        "balanced": {"appear": 300, "fade-in": 400, "zoom-in": 450},
        "brisk": {"appear": 200, "fade-in": 300, "zoom-in": 350},
    }
    return MotionEffectSpec(effect=effect, duration_ms=durations[pacing][effect])


def effect_spec_for_unit(
    unit: MotionUnit,
    motion_intent: MotionIntent,
    pacing: Literal["deliberate", "balanced", "brisk"],
) -> MotionEffectSpec:
    del unit
    effect: AnimationEffect = (
        "fade-in"
        if motion_intent in {"introduce", "focus", "compare", "conclude"}
        else "appear"
    )
    durations = {
        "deliberate": {"appear": 400, "fade-in": 500},
        "balanced": {"appear": 300, "fade-in": 400},
        "brisk": {"appear": 200, "fade-in": 300},
    }
    return MotionEffectSpec(effect=effect, duration_ms=durations[pacing][effect])
