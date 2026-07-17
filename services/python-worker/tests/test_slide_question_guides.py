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
    response_format = client.responses.last_request["text"]["format"]
    serialized_schema = json.dumps(response_format["schema"])
    assert response_format["strict"] is True
    assert '"anyOf"' in serialized_schema
    assert '"oneOf"' not in serialized_schema
    assert '"discriminator"' not in serialized_schema


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


def test_uses_only_vetted_official_web_sources_and_keeps_search_query_bounded() -> None:
    request = source_request()
    client = OfficialWebClient()

    response = generate_slide_question_guides(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    payload = response.model_dump(by_alias=True)
    assert payload["research"] == {
        "status": "succeeded",
        "attempts": 1,
        "officialSourceCount": 1,
        "issueCodes": [],
        "researchedAt": payload["research"]["researchedAt"],
    }
    assert payload["webSources"][0]["authority"] == "official"
    assert payload["items"][0]["sourceRefs"] == [payload["webSources"][0]]
    search_request = client.responses.requests[0]
    assert search_request["tools"] == [
        {"type": "web_search", "search_context_size": "medium"}
    ]
    assert "시장 진입 전략" in search_request["input"]
    assert "첫 고객군을 교육 시장으로 한정" not in search_request["input"]
    assert "초기 전환율은 12%" not in search_request["input"]


def test_web_search_failure_degrades_to_slide_only_generation() -> None:
    request = source_request()
    source_ref = {
        "kind": "slide",
        "slideId": "slide-1",
        "objectId": None,
        "deckVersion": 3,
        "contentHash": "a" * 64,
    }
    items = grounded_items(source_ref)
    client = SearchFailureClient({"items": items})

    response = generate_slide_question_guides(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    payload = response.model_dump(by_alias=True)
    assert payload["research"]["status"] == "unavailable"
    assert payload["research"]["attempts"] == 2
    assert payload["research"]["issueCodes"] == ["provider-call-failed"]
    assert payload["webSources"] == []
    assert all(item["supportState"] == "grounded" for item in payload["items"])


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


def grounded_items(source_ref: dict[str, object]) -> list[dict[str, object]]:
    return [
        {
            "questionType": question_type,
            "questionText": f"{question_type} 질문",
            "supportState": "grounded",
            "keyConcepts": [{"label": "공식 근거", "sourceRefs": [source_ref]}],
            "suggestedAnswer": {
                "summary": "제공된 공식 근거 범위에서 답합니다.",
                "structure": ["결론", "근거"],
                "caveats": [],
            },
            "remediation": None,
            "sourceRefs": [source_ref],
        }
        for question_type in ["evidence", "objection", "decision"]
    ]


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


class OfficialWebResponses:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(kwargs)
        if kwargs.get("tools"):
            text = "KAIST 공식 페이지는 교육과정의 프로젝트 기반 학습을 설명합니다. [공식 안내]"
            start = text.index("[공식 안내]")
            return SimpleNamespace(
                output_text=text,
                output=[
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": text,
                                "annotations": [
                                    {
                                        "type": "url_citation",
                                        "url": "https://kaist.example.edu/program?utm_source=test",
                                        "title": "KAIST 공식 교육과정",
                                        "start_index": start,
                                        "end_index": len(text),
                                    }
                                ],
                            }
                        ],
                    }
                ],
            )
        format_name = kwargs.get("text", {}).get("format", {}).get("name")
        if format_name == "slide_question_official_web_sources":
            vetting_input = json.loads(kwargs["input"])
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "sources": [
                            {
                                "sourceId": vetting_input["sources"][0]["sourceId"],
                                "relevant": True,
                                "authority": "official",
                            }
                        ]
                    }
                )
            )
        generation_input = json.loads(kwargs["input"])
        web_source = dict(generation_input["officialWebSources"][0])
        web_source.pop("content")
        return SimpleNamespace(
            output_text=json.dumps(
                {"items": grounded_items(web_source)},
                ensure_ascii=False,
            )
        )


class OfficialWebClient:
    def __init__(self) -> None:
        self.responses = OfficialWebResponses()


class SearchFailureResponses:
    def __init__(self, output: dict[str, object]) -> None:
        self.output = output

    def create(self, **kwargs: Any) -> SimpleNamespace:
        if kwargs.get("tools"):
            raise RuntimeError("provider unavailable")
        return SimpleNamespace(output_text=json.dumps(self.output, ensure_ascii=False))


class SearchFailureClient:
    def __init__(self, output: dict[str, object]) -> None:
        self.responses = SearchFailureResponses(output)
