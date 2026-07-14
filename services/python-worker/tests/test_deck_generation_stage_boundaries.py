from datetime import date

from app.ai.deck_generation.content_planning import plan_content
from app.ai.deck_generation.design_planning import resolve_style_prompt_context
from app.ai.deck_generation.diagnostics import assemble_generation_diagnostics
from app.ai.deck_generation.models import (
    ContentPlan,
    GenerationDiagnosticsInput,
    GenerationDiagnosticsResult,
    GenerateDeckRequest,
    PythonQualityInput,
    PythonQualityResult,
    SourceGroundingResult,
    ValidationResult,
)
from app.ai.deck_generation.pipeline import analyze_input
from app.ai.deck_generation.quality import review_python_quality
from app.ai.deck_generation.source_grounding import ground_sources


def test_source_and_content_stage_entrypoints_return_boundary_dtos() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(projectId="project_demo_1", topic="ORBIT")
    )

    grounding_result = ground_sources(raw_input, current_date=date(2026, 7, 15))
    content_stage_input = grounding_result.raw_input.model_copy(deep=True)
    original_content_stage_input = content_stage_input.model_copy(deep=True)
    content_plan = plan_content(
        content_stage_input,
        resolve_style_prompt_context(content_stage_input),
    )
    checkpoint = ContentPlan.model_validate_json(
        content_plan.model_dump_json(by_alias=True)
    )
    restored_input = original_content_stage_input.model_copy(
        update={
            "slide_count": checkpoint.slide_count,
            "timing_plan": checkpoint.timing_plan.model_copy(deep=True),
            "repair_attempted": checkpoint.repair_attempted,
            "repair_reason_codes": list(checkpoint.repair_reason_codes),
        }
    )

    assert isinstance(grounding_result, SourceGroundingResult)
    assert grounding_result.source_records == grounding_result.raw_input.source_records
    assert grounding_result.warnings == []
    assert isinstance(content_plan, ContentPlan)
    assert content_plan.outline.slide_titles == [
        slide_plan.title for slide_plan in content_plan.slide_plans
    ]
    assert restored_input.slide_count == content_stage_input.slide_count
    assert restored_input.timing_plan == content_stage_input.timing_plan
    assert restored_input.repair_attempted == content_stage_input.repair_attempted
    assert restored_input.repair_reason_codes == content_stage_input.repair_reason_codes


def test_quality_and_diagnostics_stage_entrypoints_use_pydantic_boundaries() -> None:
    raw_input = analyze_input(
        GenerateDeckRequest(projectId="project_demo_1", topic="ORBIT")
    )
    deck = {
        "title": "ORBIT",
        "metadata": {"createdFrom": {"topic": "ORBIT"}},
        "slides": [],
    }
    quality_result = review_python_quality(
        PythonQualityInput(rawInput=raw_input, deck=deck)
    )
    diagnostics_result = assemble_generation_diagnostics(
        GenerationDiagnosticsInput(
            rawInput=raw_input,
            validation=ValidationResult(passed=True),
            generatedSlideCount=0,
            uniqueCoreLayoutCount=0,
            agentWarnings=["stage warning", "stage warning"],
        )
    )

    assert isinstance(quality_result, PythonQualityResult)
    assert isinstance(diagnostics_result, GenerationDiagnosticsResult)
    assert diagnostics_result.warnings.count("stage warning") == 1
    assert diagnostics_result.diagnostics.unique_core_layout_count == 0
