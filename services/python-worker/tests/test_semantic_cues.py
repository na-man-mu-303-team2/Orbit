import json
import sys
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ai.semantic_cues import (
    SemanticCueExtractionError,
    SemanticCueExtractionRequest,
    extract_semantic_cues,
)
import app.main as api_module
from tests.test_config import VALID_ENV


def client() -> TestClient:
    api_module.app.state.config = api_module.load_config(VALID_ENV)
    return TestClient(api_module.app)


def test_extract_semantic_cues_endpoint_returns_503_without_openai_key() -> None:
    response = client().post(
        "/ai/extract-semantic-cues",
        json={
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_intro",
                        "title": "문제 정의",
                        "speakerNotes": "고객은 반복 리허설에서 피드백을 놓칩니다.",
                        "keywords": [
                            {
                                "text": "리허설 피드백",
                                "synonyms": ["발표 코칭"],
                                "abbreviations": ["RF"],
                            }
                        ],
                        "elements": [{"text": "반복 리허설"}],
                    }
                ],
            },
        },
    )

    assert response.status_code == 503
    assert "OpenAI API key" in response.json()["detail"]


def test_extract_semantic_cues_does_not_generate_fallback_without_llm() -> None:
    payload = SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_intro",
                        "title": "문제 정의",
                        "speakerNotes": "고객은 반복 리허설에서 피드백을 놓칩니다.",
                        "keywords": [{"text": "리허설 피드백"}],
                    }
                ],
            },
        }
    )

    with pytest.raises(SemanticCueExtractionError, match="OpenAI API key"):
        extract_semantic_cues(payload)


def test_extract_semantic_cues_uses_openai_structured_output() -> None:
    fake_client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_imported",
                    "semanticCues": [
                        {
                            "meaning": "기존 고객 확장 매출의 의미를 설명했다",
                            "reportLabel": "기존 고객 확장 매출",
                            "presenterTag": "확장 매출",
                            "cueType": "definition",
                            "importance": "core",
                            "candidateKeywords": ["ARR 확장 매출"],
                            "aliasEntries": [
                                {"term": "ARR 확장 매출", "values": ["Expansion ARR"]}
                            ],
                            "requiredConcepts": ["기존 고객 확장", "매출 유지"],
                            "nliHypotheses": [
                                "발표자가 기존 고객 확장 매출의 의미를 설명했다"
                            ],
                            "negativeHints": ["신규 매출만 언급"],
                            "targetElementIds": ["headline"],
                            "triggerActionIds": [],
                        }
                    ],
                }
            ]
        }
    )
    payload = SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_imported",
                        "title": "Slide 1",
                        "speakerNotes": "여기서 저희는 ARR 확장 매출을 설명합니다.",
                        "keywords": [{"text": "ARR 확장 매출"}],
                        "elements": [
                            {
                                "elementId": "headline",
                                "props": {
                                    "text": "ARR expansion from existing customers"
                                },
                            }
                        ],
                    }
                ],
            },
        }
    )

    result = extract_semantic_cues(payload, client=fake_client, model="gpt-test")

    assert fake_client.requests[0]["model"] == "gpt-test"
    assert fake_client.requests[0]["text"]["format"]["type"] == "json_schema"
    llm_input = json.loads(fake_client.requests[0]["input"])
    assert llm_input["slides"][0]["title"] == ""
    assert llm_input["slides"][0]["keywords"] == [
        {"text": "ARR 확장 매출", "synonyms": [], "abbreviations": []}
    ]
    cues = result.model_dump(by_alias=True)["slides"][0]["semanticCues"]
    assert cues[0]["cueId"].startswith("scue_")
    assert len(cues[0]["sourceFingerprint"]) == 64
    assert cues[0]["importance"] == "core"
    assert cues[0]["required"] is True
    assert cues[0]["priority"] == 1
    assert cues[0]["reviewStatus"] == "suggested"
    assert cues[0]["origin"] == "ai"
    assert cues[0]["sourceDeckVersion"] == 1
    assert cues[0]["candidateKeywords"] == ["ARR 확장 매출"]
    assert cues[0]["requiredConcepts"] == ["기존 고객 확장", "매출 유지"]
    assert cues[0]["targetElementIds"] == ["headline"]


def test_extract_semantic_cues_endpoint_uses_openai_when_api_key_is_configured(
    monkeypatch: Any,
) -> None:
    fake_openai = FakeOpenAIModule(
        {
            "slides": [
                {
                    "slideId": "slide_ai",
                    "semanticCues": [
                        {
                            "meaning": "가격 실험의 전환율 영향을 설명했다",
                            "required": True,
                            "priority": 1,
                            "candidateKeywords": ["가격 실험"],
                            "aliasEntries": [],
                            "requiredConcepts": ["가격 실험", "전환율 영향"],
                            "nliHypotheses": [
                                "발표자가 가격 실험이 전환율에 준 영향을 설명했다"
                            ],
                            "negativeHints": [],
                            "targetElementIds": [],
                            "triggerActionIds": [],
                        }
                    ],
                }
            ]
        }
    )
    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=fake_openai))
    api_module.app.state.config = api_module.load_config(
        {
            **VALID_ENV,
            "OPENAI_API_KEY": "sk-test-placeholder",
            "OPENAI_MODEL": "gpt-test",
        }
    )

    response = TestClient(api_module.app).post(
        "/ai/extract-semantic-cues",
        json={
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_ai",
                        "title": "Slide 2",
                        "speakerNotes": "가격 실험이 전환율에 준 영향을 설명합니다.",
                        "keywords": [],
                        "elements": [],
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    assert fake_openai.clients[0].requests[0]["model"] == "gpt-test"
    cues = response.json()["slides"][0]["semanticCues"]
    assert cues[0]["candidateKeywords"] == ["가격 실험"]


def test_extract_semantic_cues_keeps_empty_slides_empty_when_llm_returns_no_cues() -> None:
    fake_client = FakeOpenAIClient(
        {"slides": [{"slideId": "slide_empty", "semanticCues": []}]}
    )
    payload = SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [{"slideId": "slide_empty"}],
            },
        }
    )

    result = extract_semantic_cues(payload, client=fake_client, model="gpt-test")

    assert result.model_dump(by_alias=True)["slides"] == [
        {
            "slideId": "slide_empty",
            "status": "succeeded",
            "semanticCues": [],
            "warnings": [],
        }
    ]


def test_extract_semantic_cues_filters_filler_cues_returned_by_llm() -> None:
    fake_client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_imported",
                    "semanticCues": [
                        {
                            "meaning": "담화 표지만 언급했다",
                            "required": True,
                            "priority": 2,
                            "candidateKeywords": ["먼저"],
                            "aliasEntries": [],
                            "requiredConcepts": [],
                            "nliHypotheses": ["발표자가 먼저라고 말했다."],
                            "negativeHints": [],
                            "targetElementIds": [],
                            "triggerActionIds": [],
                        }
                    ],
                }
            ]
        }
    )
    payload = SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_imported",
                        "title": "Slide 1",
                        "speakerNotes": (
                            "먼저 여기서 저희는 이를 이번에는 마지막으로 "
                            "본격적인 내용을 설명합니다."
                        ),
                        "keywords": [],
                        "elements": [],
                    }
                ],
            },
        }
    )

    result = extract_semantic_cues(payload, client=fake_client, model="gpt-test")

    assert result.model_dump(by_alias=True)["slides"] == [
        {
            "slideId": "slide_imported",
            "status": "succeeded",
            "semanticCues": [],
            "warnings": [],
        }
    ]


def test_extract_semantic_cues_rejects_unknown_llm_slide_ids() -> None:
    fake_client = FakeOpenAIClient(
        {"slides": [{"slideId": "slide_unknown", "semanticCues": []}]}
    )
    payload = SemanticCueExtractionRequest.model_validate(
        {
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_keyword",
                        "title": "Slide 2",
                    }
                ],
            },
        }
    )

    with pytest.raises(SemanticCueExtractionError, match="unknown slide"):
        extract_semantic_cues(payload, client=fake_client, model="gpt-test")


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.requests: list[dict[str, Any]] = []
        self.responses = FakeResponses(self, payload)


class FakeOpenAIModule:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.clients: list[FakeOpenAIClient] = []

    def __call__(self, *, api_key: str) -> FakeOpenAIClient:
        client = FakeOpenAIClient(self.payload)
        self.clients.append(client)
        return client


class FakeResponses:
    def __init__(self, parent: FakeOpenAIClient, payload: dict[str, object]) -> None:
        self.parent = parent
        self.payload = payload

    def create(self, **kwargs: Any) -> object:
        self.parent.requests.append(kwargs)
        return type(
            "Response",
            (),
            {"output_text": json.dumps(self.payload, ensure_ascii=False)},
        )()
