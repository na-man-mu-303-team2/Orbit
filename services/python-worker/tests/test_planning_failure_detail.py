import json

import pytest

from app.ai.deck_generation.models import DeckContentGenerationError
from app.main import _planning_failure_detail


@pytest.mark.parametrize(
    ("message", "reason_code"),
    [
        (
            "LLM deck content generation failed: raw-provider-body-sentinel",
            "CONTENT_LLM_PROVIDER_FAILURE",
        ),
        ("LLM returned empty deck content.", "CONTENT_LLM_EMPTY_RESPONSE"),
        (
            "LLM returned invalid deck content: raw-provider-body-sentinel",
            "CONTENT_LLM_INVALID_RESPONSE",
        ),
        (
            "LLM content plan referenced unavailable source IDs: source_private",
            "CONTENT_LLM_INVALID_RESPONSE",
        ),
        (
            "UNSUPPORTED_NUMERIC_CLAIM: unsupported claim",
            "CONTENT_LLM_INVALID_RESPONSE",
        ),
        (
            "LLM slide count repair failed: requested 10, received 0.",
            "CONTENT_LLM_SLIDE_COUNT_REPAIR_FAILED",
        ),
        (
            "Art Director could not create a valid design plan.",
            "ART_DIRECTOR_INVALID_RESPONSE",
        ),
        (
            "No composition supports summary with 4 content items",
            "DESIGN_COMPOSITION_UNSUPPORTED",
        ),
    ],
)
def test_planning_failure_detail_uses_safe_reason_codes(
    message: str,
    reason_code: str,
) -> None:
    detail = _planning_failure_detail(DeckContentGenerationError(message))

    assert detail["reasonCode"] == reason_code
    assert "raw-provider-body-sentinel" not in json.dumps(detail)
