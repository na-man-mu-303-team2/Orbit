from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.ai.deck_generation.content_planning import plan_content
from app.ai.deck_generation.design_planning import (
    plan_design,
    resolve_style_prompt_context,
)
from app.ai.deck_generation.diagnostics import assemble_generation_diagnostics
from app.ai.deck_generation.layout_compiler import (
    compile_layout,
    core_geometry_fingerprint,
)
from app.ai.deck_generation.models import (
    ContentPlan,
    DesignPlan,
    GenerateDeckRequest,
    GenerateDeckResponse,
    GenerationDiagnosticsInput,
    ImageReviewMode,
    LayoutCompileResult,
    PythonQualityInput,
    RawInput,
    SourceGroundingResult,
    VisualRequirements,
)
from app.ai.deck_generation.pipeline import analyze_input, build_deck_from_layout
from app.ai.deck_generation.quality import (
    enforce_design_pack_constraints,
    finalize_python_quality,
    refine_python_quality,
    review_python_quality,
)
from app.ai.deck_generation.source_grounding import ground_sources
from app.ai.deck_generation.visual_requirements import (
    apply_visual_requirements,
    plan_visual_requirements,
)


class StageModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class SourceGroundingStageInput(StageModel):
    request: GenerateDeckRequest


class RegenerationContext(StageModel):
    instruction: str = Field(default="", max_length=240)
    previous_slide_titles: list[str] = Field(
        default_factory=list,
        alias="previousSlideTitles",
    )


class ContentPlanningStageInput(StageModel):
    grounding_result: SourceGroundingResult = Field(alias="groundingResult")
    regeneration_context: RegenerationContext | None = Field(
        default=None,
        alias="regenerationContext",
    )


class ContentPlanningStageResult(StageModel):
    raw_input: RawInput = Field(alias="rawInput")
    content_plan: ContentPlan = Field(alias="contentPlan")


class DesignPlanningStageInput(StageModel):
    raw_input: RawInput = Field(alias="rawInput")
    content_plan: ContentPlan = Field(alias="contentPlan")


class DesignPlanningStageResult(StageModel):
    design_plan: DesignPlan = Field(alias="designPlan")


class LayoutCompileStageInput(StageModel):
    raw_input: RawInput = Field(alias="rawInput")
    content_plan: ContentPlan = Field(alias="contentPlan")
    design_plan: DesignPlan = Field(alias="designPlan")
    source_warnings: list[str] = Field(default_factory=list, alias="sourceWarnings")


class LayoutCompileStageResult(StageModel):
    layout_result: LayoutCompileResult = Field(alias="layoutResult")
    visual_requirements: VisualRequirements = Field(alias="visualRequirements")
    worker_payload: GenerateDeckResponse = Field(alias="workerPayload")


def run_source_grounding_stage(
    stage_input: SourceGroundingStageInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
    current_date: date | None = None,
) -> SourceGroundingResult:
    return ground_sources(
        analyze_input(stage_input.request),
        client=client,
        model=model,
        api_key=api_key,
        current_date=current_date or date.today(),
    )


def run_content_planning_stage(
    stage_input: ContentPlanningStageInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> ContentPlanningStageResult:
    raw_input = stage_input.grounding_result.raw_input.model_copy(deep=True)
    if stage_input.regeneration_context is not None:
        raw_input = raw_input.model_copy(
            update={
                "regeneration_instruction": stage_input.regeneration_context.instruction,
                "previous_slide_titles": list(
                    stage_input.regeneration_context.previous_slide_titles
                ),
            }
        )
    content_plan = plan_content(
        raw_input,
        resolve_style_prompt_context(raw_input),
        client=client,
        model=model,
        api_key=api_key,
    )
    raw_input = raw_input.model_copy(
        update={
            "slide_count": content_plan.slide_count,
            "timing_plan": content_plan.timing_plan.model_copy(deep=True),
            "repair_attempted": content_plan.repair_attempted,
            "repair_reason_codes": list(content_plan.repair_reason_codes),
        }
    )
    return ContentPlanningStageResult(rawInput=raw_input, contentPlan=content_plan)


def run_design_planning_stage(
    stage_input: DesignPlanningStageInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> DesignPlanningStageResult:
    return DesignPlanningStageResult(
        designPlan=plan_design(
            stage_input.raw_input,
            stage_input.content_plan.slide_plans,
            client=client,
            model=model,
            api_key=api_key,
        )
    )


def run_layout_compile_stage(
    stage_input: LayoutCompileStageInput,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
    image_review_mode: ImageReviewMode = "auto",
) -> LayoutCompileStageResult:
    layout_result = compile_layout(stage_input.raw_input, stage_input.design_plan)
    visual_requirements = plan_visual_requirements(
        stage_input.raw_input,
        stage_input.design_plan,
        layout_result,
    )
    visualized_slides = apply_visual_requirements(layout_result, visual_requirements)
    deck = build_deck_from_layout(
        stage_input.raw_input,
        stage_input.content_plan.outline,
        stage_input.design_plan,
        visualized_slides,
    )
    deck = enforce_design_pack_constraints(deck, stage_input.raw_input)
    reviewer = review_python_quality(
        PythonQualityInput(rawInput=stage_input.raw_input, deck=deck)
    ).validation
    refined = refine_python_quality(
        PythonQualityInput(
            rawInput=stage_input.raw_input,
            deck=deck,
            reviewerValidation=reviewer,
        ),
        client=client,
        model=model,
        api_key=api_key,
        image_review_mode=image_review_mode,
    )
    finalized = finalize_python_quality(
        PythonQualityInput(rawInput=stage_input.raw_input, deck=refined.deck)
    )
    body_slides = finalized.deck.get("slides", [])[1:-1]
    diagnostics = assemble_generation_diagnostics(
        GenerationDiagnosticsInput(
            rawInput=stage_input.raw_input,
            validation=finalized.validation,
            generatedSlideCount=len(visualized_slides),
            uniqueCoreLayoutCount=len(
                {core_geometry_fingerprint(slide) for slide in body_slides}
            ),
            agentWarnings=stage_input.source_warnings,
        )
    )
    return LayoutCompileStageResult(
        layoutResult=layout_result,
        visualRequirements=visual_requirements,
        workerPayload=GenerateDeckResponse(
            deck=finalized.deck,
            templateSelection=[],
            warnings=diagnostics.warnings,
            validation=finalized.validation,
            diagnostics=diagnostics.diagnostics,
        ),
    )
