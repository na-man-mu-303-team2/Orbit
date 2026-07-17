from datetime import date

from app.ai.deck_generation.content_planning import deck_content_prompt
from app.ai.deck_generation.design_planning import resolve_style_prompt_context
from app.ai.deck_generation.models import GenerateDeckRequest
from app.ai.deck_generation.stage_runtime import (
    ContentPlanningStageInput,
    RegenerationContext,
    SourceGroundingStageInput,
    run_content_planning_stage,
    run_source_grounding_stage,
)


def test_regeneration_context_is_prompt_guidance_not_evidence() -> None:
    source = run_source_grounding_stage(
        SourceGroundingStageInput(
            request=GenerateDeckRequest(projectId="project-1", topic="ORBIT")
        ),
        current_date=date(2026, 7, 16),
    )
    result = run_content_planning_stage(
        ContentPlanningStageInput(
            groundingResult=source,
            regenerationContext=RegenerationContext(
                instruction="결론을 먼저 보여줘",
                previousSlideTitles=["기존 구성"],
            ),
        )
    )

    prompt = deck_content_prompt(
        result.raw_input,
        resolve_style_prompt_context(result.raw_input),
    )
    assert "결론을 먼저 보여줘" in prompt
    assert "기존 구성" in prompt
    assert "not evidence" in prompt
    assert "cannot override source" in prompt
