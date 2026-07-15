from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.ai.deck_generation.content_planning import plan_content
from app.ai.deck_generation.design_planning import (
    plan_design,
    resolve_style_prompt_context,
)
from app.ai.deck_generation.layout_compiler import compile_layout
from app.ai.deck_generation.models import (
    ContentPlan,
    DesignPlan,
    GenerateDeckRequest,
    LayoutCompileResult,
    RawInput,
    SourceGroundingResult,
    VisualRequirements,
)
from app.ai.deck_generation.pipeline import analyze_input
from app.ai.deck_generation.source_grounding import ground_sources
from app.ai.deck_generation.visual_requirements import plan_visual_requirements


class StageModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class SourceGroundingStageInput(StageModel):
    request: GenerateDeckRequest


class ContentPlanningStageInput(StageModel):
    grounding_result: SourceGroundingResult = Field(alias="groundingResult")


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
    design_plan: DesignPlan = Field(alias="designPlan")


class LayoutCompileStageResult(StageModel):
    layout_result: LayoutCompileResult = Field(alias="layoutResult")
    visual_requirements: VisualRequirements = Field(alias="visualRequirements")


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
) -> LayoutCompileStageResult:
    layout_result = compile_layout(stage_input.raw_input, stage_input.design_plan)
    return LayoutCompileStageResult(
        layoutResult=layout_result,
        visualRequirements=plan_visual_requirements(
            stage_input.raw_input,
            stage_input.design_plan,
            layout_result,
        ),
    )
