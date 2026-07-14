from app.ai.deck_generation.content_planning import plan_content
from app.ai.deck_generation.design_planning import resolve_style_prompt_context
from app.ai.deck_generation.models import (
    ContentPlan,
    GenerateDeckRequest,
    SourceGroundingResult,
)
from app.ai.deck_generation.pipeline import analyze_input
from app.ai.deck_generation.source_grounding import ground_sources


def test_source_and_content_stage_entrypoints_return_boundary_dtos() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(projectId="project_demo_1", topic="ORBIT")
    )

    grounding_result = ground_sources(raw_input)
    content_plan = plan_content(
        grounding_result.raw_input,
        resolve_style_prompt_context(grounding_result.raw_input),
    )

    assert isinstance(grounding_result, SourceGroundingResult)
    assert grounding_result.source_records == grounding_result.raw_input.source_records
    assert grounding_result.warnings == []
    assert isinstance(content_plan, ContentPlan)
    assert content_plan.outline.slide_titles == [
        slide_plan.title for slide_plan in content_plan.slide_plans
    ]
