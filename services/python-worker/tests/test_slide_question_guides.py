import json
from types import SimpleNamespace
from typing import Any

from app.slide_question_guides import (
    SlideQuestionGuideRequest,
    generate_slide_question_guides,
)


def test_generates_three_grounded_questions_with_strict_ai_output() -> None:
    request = source_request()
    source_ref = {
        "kind": "slide",
        "slideId": "slide-1",
        "objectId": None,
        "deckVersion": 3,
        "contentHash": "a" * 64,
    }
    items = [
        {
            "questionType": question_type,
            "questionText": f"{question_type} 질문",
            "supportState": "grounded",
            "keyConcepts": [{"label": "시장 진입", "sourceRefs": [source_ref]}],
            "suggestedAnswer": {
                "summary": "교육 시장에서 먼저 검증합니다.",
                "structure": ["결론", "근거", "한계"],
                "caveats": ["제공된 근거 밖의 수치는 단정하지 않습니다."],
            },
            "remediation": None,
            "sourceRefs": [source_ref],
        }
        for question_type in ["evidence", "objection", "decision"]
    ]
    client = FakeClient({"items": items})

    response = generate_slide_question_guides(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    payload = response.model_dump(by_alias=True)
    assert len(payload["items"]) == 3
    assert all(item["supportState"] == "grounded" for item in payload["items"])
    assert payload["items"][0]["sourceRefs"] == [source_ref]
    assert client.responses.last_request["model"] == "test-model"


def test_returns_remediation_instead_of_calling_ai_without_sources() -> None:
    request = SlideQuestionGuideRequest.model_validate(
        {
            "slide": {
                "slideId": "slide-1",
                "deckVersion": 3,
                "contentHash": "a" * 64,
                "title": "",
                "content": "",
            },
            "references": [],
            "brief": None,
            "questionCount": 3,
        }
    )
    client = FakeClient({"items": []})

    response = generate_slide_question_guides(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    payload = response.model_dump(by_alias=True)
    assert all(item["supportState"] == "insufficient" for item in payload["items"])
    assert all(item["suggestedAnswer"] is None for item in payload["items"])
    assert all(item["remediation"] is not None for item in payload["items"])
    assert client.responses.last_request is None


def source_request() -> SlideQuestionGuideRequest:
    return SlideQuestionGuideRequest.model_validate(
        {
            "slide": {
                "slideId": "slide-1",
                "deckVersion": 3,
                "contentHash": "a" * 64,
                "title": "시장 진입 전략",
                "content": "첫 고객군을 교육 시장으로 한정하고 검증합니다.",
            },
            "references": [
                {
                    "fileId": "file-1",
                    "chunkId": "chunk-1",
                    "contentHash": "b" * 64,
                    "content": "교육 시장의 초기 전환율은 12%입니다.",
                }
            ],
            "brief": None,
            "questionCount": 3,
        }
    )


class FakeResponses:
    def __init__(self, output: dict[str, object]) -> None:
        self.output = output
        self.last_request: dict[str, Any] | None = None

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.last_request = kwargs
        return SimpleNamespace(output_text=json.dumps(self.output, ensure_ascii=False))


class FakeClient:
    def __init__(self, output: dict[str, object]) -> None:
        self.responses = FakeResponses(output)
