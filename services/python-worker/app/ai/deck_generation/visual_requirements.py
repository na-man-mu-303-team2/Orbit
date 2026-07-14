from __future__ import annotations

import re
from typing import Any

from app.ai.design_program import DeckDesignProgram, SlideCompositionDirection
from app.ai.deck_generation.design_planning import design_pack_forbidden_styles
from app.ai.deck_generation.models import (
    DesignPlan,
    LayoutCompileResult,
    RawInput,
    SlidePlan,
    VisualRequirement,
    VisualRequirements,
)
from app.ai.deck_generation.source_grounding import unique_non_empty


def plan_visual_requirements(
    raw_input: RawInput,
    design_plan: DesignPlan,
    layout_result: LayoutCompileResult,
) -> VisualRequirements:
    return VisualRequirements(
        items=[
            VisualRequirement(
                slideId=str(slide["slideId"]),
                visualPlan=program_v2_visual_plan(
                    raw_input,
                    slide_plan,
                    design_plan.design_program,
                    design_plan.design_program.slides[slide_plan.order - 1],
                ),
            )
            for slide_plan, slide in zip(
                design_plan.slide_plans,
                layout_result.slides,
                strict=True,
            )
        ]
    )


def apply_visual_requirements(
    layout_result: LayoutCompileResult,
    requirements: VisualRequirements,
) -> LayoutCompileResult:
    visual_plans = {
        requirement.slide_id: requirement.visual_plan
        for requirement in requirements.items
    }
    for slide in layout_result.slides:
        ai_notes = slide["aiNotes"]
        updated_ai_notes: dict[str, Any] = {}
        for key, value in ai_notes.items():
            updated_ai_notes[key] = value
            if key == "sourceEvidence":
                updated_ai_notes["visualPlan"] = visual_plans[str(slide["slideId"])]
        slide["aiNotes"] = updated_ai_notes
    return layout_result


def program_v2_visual_plan(
    raw_input: RawInput,
    slide_plan: SlidePlan,
    program: DeckDesignProgram,
    direction: SlideCompositionDirection,
) -> dict[str, Any]:
    image_needed = direction.asset_role != "none"
    media_policy = raw_input.design.media_policy
    if not image_needed:
        source_policy = "minimal"
    elif media_policy == "hybrid":
        source_policy = (
            "official-assets" if direction.asset_role == "evidence" else "ai-generated"
        )
    elif media_policy in {"ai-generated", "public-assets", "provided-only"}:
        source_policy = media_policy
    else:
        source_policy = "minimal"
    prompt = (
        program_v2_image_prompt(raw_input, slide_plan, program, direction)
        if image_needed
        else ""
    )
    alt = (
        slide_plan.media_intent.alt.strip()
        or slide_plan.media_intent.caption.strip()
        or slide_plan.title
    )
    result: dict[str, Any] = {
        "visualType": program_v2_visual_type(slide_plan, direction),
        "imageNeeded": image_needed,
        "imageSourcePolicy": source_policy,
        "reason": (
            f"{direction.asset_role} asset supports the slide focal point."
            if image_needed
            else "Native composition uses typography and editable shapes."
        ),
    }
    if prompt:
        result["imagePrompt"] = prompt
    if alt:
        result["imageAlt"] = alt
    if slide_plan.media_intent.placement.strip():
        result["imagePlacement"] = slide_plan.media_intent.placement.strip()
    return result


def program_v2_image_prompt(
    raw_input: RawInput,
    slide_plan: SlidePlan,
    program: DeckDesignProgram,
    direction: SlideCompositionDirection,
) -> str:
    role_context = {
        "evidence": "official product evidence",
        "atmosphere": "atmospheric key visual",
        "decoration": "editorial decorative visual",
    }.get(direction.asset_role, "presentation visual")
    style_parts = [
        part
        for value in (
            slide_plan.media_intent.prompt,
            slide_plan.visual_intent.media_style,
            program.image_style,
        )
        if (part := descriptive_media_prompt_part(value))
    ]
    forbidden_styles = sorted(design_pack_forbidden_styles(raw_input))
    constraints = f"avoid {' and '.join(forbidden_styles)}" if forbidden_styles else ""
    return ". ".join(
        unique_non_empty(
            [
                raw_input.topic,
                slide_plan.title,
                role_context,
                *style_parts,
                constraints,
            ]
        )
    )


def descriptive_media_prompt_part(value: str) -> str:
    normalized = " ".join(value.casefold().split())
    if not normalized:
        return ""
    tokens = set(re.findall(r"[0-9a-z가-힣]+", normalized))
    generic_tokens = {
        "auto",
        "clean",
        "default",
        "icon",
        "icons",
        "image",
        "media",
        "minimal",
        "none",
        "아이콘",
    }
    return "" if tokens and tokens <= generic_tokens else value.strip()


def program_v2_visual_type(
    slide_plan: SlidePlan,
    direction: SlideCompositionDirection,
) -> str:
    if direction.order == 1 or slide_plan.slide_type in {"cover", "title"}:
        return "cover"
    if direction.composition_id == "cta-closing":
        return "summary"
    return {
        "feature-comparison": "comparison",
        "process-horizontal": "process",
        "timeline": "process",
        "diagram-hub": "architecture",
        "metric-poster": "data",
        "kpi-strip-evidence": "data",
        "image-evidence": "data",
    }.get(direction.composition_id, slide_plan.slide_type)
