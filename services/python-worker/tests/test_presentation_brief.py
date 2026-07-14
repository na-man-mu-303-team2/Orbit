from typing import Any

from app.ai.presentation_brief import (
    PresentationBriefExtractRequest,
    extract_presentation_brief,
)


def request() -> PresentationBriefExtractRequest:
    return PresentationBriefExtractRequest.model_validate(
        {
            "deckId": "deck_1",
            "title": "2026년 사업 전략",
            "slides": [
                {"slideId": "slide_1", "title": "시장 기회", "texts": []},
                {"slideId": "slide_2", "title": "투자 우선순위", "texts": []},
            ],
        }
    )


def test_returns_deterministic_fallback_without_provider() -> None:
    result = extract_presentation_brief(
        request(), model="gpt-4.1-mini", api_key=None
    )

    assert result.brief_extraction.status == "fallback"
    assert result.brief_draft.target_duration_minutes == 5
    assert [item.text for item in result.brief_draft.requirements] == [
        "시장 기회",
        "투자 우선순위",
    ]


def test_validates_structured_provider_output() -> None:
    class Responses:
        def create(self, **_: Any) -> Any:
            return type(
                "Response",
                (),
                {
                    "output_text": """
                    {
                      "audience": "decision-maker",
                      "purpose": "report",
                      "evaluatorLensRef": {"lensId": "decision-maker", "revision": 1},
                      "targetDurationMinutes": 12,
                      "desiredOutcome": "투자 우선순위를 승인한다.",
                      "requirements": [],
                      "terminology": [],
                      "challengeTopics": []
                    }
                    """
                },
            )()

    client = type("Client", (), {"responses": Responses()})()
    result = extract_presentation_brief(
        request(), model="gpt-4.1-mini", api_key="configured", client=client
    )

    assert result.brief_extraction.status == "ai"
    assert result.brief_draft.purpose == "report"
