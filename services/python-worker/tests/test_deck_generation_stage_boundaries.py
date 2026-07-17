from datetime import date
import json
from types import SimpleNamespace
from typing import Any

import pytest

import app.ai.deck_generation.design_planning as design_planning_module
from app.ai.design_program import DeckDesignProgram
from app.ai.deck_generation.content_planning import plan_content, plan_story_content
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
from app.ai.deck_generation.stage_runtime import (
    ContentPlanningStageInput,
    DesignPlanningStageInput,
    LayoutCompileStageInput,
    SourceGroundingStageInput,
    run_content_planning_stage,
    run_design_planning_stage,
    run_layout_compile_stage,
    run_source_grounding_stage,
)


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


def test_staged_story_plan_uses_one_llm_call_without_slide_details() -> None:
    raw_input = ground_sources(
        analyze_input(
            GenerateDeckRequest(
                projectId="project_demo_1",
                topic="ORBIT",
                prompt="ORBIT 생성 흐름을 설명해줘",
            )
        ),
        current_date=date(2026, 7, 17),
    ).raw_input
    source_id = raw_input.source_records[0].source_id

    class Responses:
        def __init__(self) -> None:
            self.calls = 0

        def create(self, **_kwargs: Any) -> SimpleNamespace:
            self.calls += 1
            slides = [
                {
                    "title": f"슬라이드 {order}",
                    "message": f"핵심 메시지 {order}",
                    "slideType": (
                        "cover"
                        if order == 1
                        else "summary"
                        if order == raw_input.slide_count
                        else "solution"
                    ),
                    "sourceRefs": [source_id],
                }
                for order in range(1, raw_input.slide_count + 1)
            ]
            return SimpleNamespace(
                output_text=json.dumps(
                    {"title": "ORBIT", "slides": slides},
                    ensure_ascii=False,
                )
            )

    responses = Responses()
    content = plan_story_content(
        raw_input,
        resolve_style_prompt_context(raw_input),
        client=SimpleNamespace(responses=responses),
    )

    assert responses.calls == 1
    assert all(not slide.speaker_notes for slide in content.slide_plans)
    assert all(not slide.content_items for slide in content.slide_plans)


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


def test_planning_stage_runtime_preserves_typed_stage_boundaries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def create_design_program(
        _context: Any,
        slides: list[dict[str, Any]],
        **_kwargs: Any,
    ) -> DeckDesignProgram:
        return DeckDesignProgram.model_validate(
            {
                "version": "program-v2",
                "visualConcept": "Typed stage boundary",
                "paletteRoles": {
                    "dominant": "#111827",
                    "surface": "#FFFFFF",
                    "text": "#111827",
                    "focal": "#2563EB",
                    "secondary": "#64748B",
                },
                "typography": {
                    "headingFont": "Pretendard",
                    "bodyFont": "Pretendard",
                    "typeScale": {
                        "cover": 52,
                        "title": 36,
                        "body": 24,
                        "caption": 16,
                    },
                },
                "backgroundSequence": ["light"] * len(slides),
                "imageStyle": "documentary",
                "surfaceStyle": "flat",
                "slides": [
                    {
                        "order": order,
                        "compositionId": "hero-split",
                        "variant": "light",
                        "backgroundMode": "light",
                        "focalType": "none",
                        "assetRole": "none",
                        "requiredAsset": False,
                    }
                    for order in range(1, len(slides) + 1)
                ],
            }
        )

    monkeypatch.setattr(
        design_planning_module,
        "create_design_program",
        create_design_program,
    )
    source = run_source_grounding_stage(
        SourceGroundingStageInput(
            request=GenerateDeckRequest(projectId="project_demo_1", topic="ORBIT")
        ),
        current_date=date(2026, 7, 15),
    )
    content = run_content_planning_stage(
        ContentPlanningStageInput(groundingResult=source)
    )
    design = run_design_planning_stage(
        DesignPlanningStageInput(
            rawInput=content.raw_input,
            contentPlan=content.content_plan,
        )
    )
    layout = run_layout_compile_stage(
        LayoutCompileStageInput(
            rawInput=content.raw_input,
            contentPlan=content.content_plan,
            designPlan=design.design_plan,
        )
    )

    assert content.content_plan.slide_count == len(content.content_plan.slide_plans)
    assert len(design.design_plan.design_program.slides) == content.content_plan.slide_count
    assert layout.artifact_version == 2
    assert len(layout.slides) == content.content_plan.slide_count
    assert [slide.shard_key for slide in layout.slides] == [
        f"{order:03d}-slide_{order}"
        for order in range(1, content.content_plan.slide_count + 1)
    ]
    assert "slides" not in layout.deck_shell
