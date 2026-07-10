import json
import sys
from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from app.ai.semantic_cues import SemanticCueExtractionRequest, extract_semantic_cues
import app.main as api_module
from tests.test_config import VALID_ENV


def client() -> TestClient:
    api_module.app.state.config = api_module.load_config(VALID_ENV)
    return TestClient(api_module.app)


def test_extract_semantic_cues_builds_bounded_slide_cues() -> None:
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

    assert response.status_code == 200
    body = response.json()
    assert body["deckId"] == "deck_demo_1"
    cues = body["slides"][0]["semanticCues"]
    assert cues[0]["cueId"].startswith("scue_intro_")
    assert cues[0]["slideId"] == "slide_intro"
    assert cues[0]["candidateKeywords"] == ["리허설 피드백"]
    assert cues[0]["aliases"] == {"리허설 피드백": ["발표 코칭", "RF"]}
    assert cues[0]["requiredConcepts"] == ["리허설 피드백", "발표 코칭", "RF"]
    assert 1 <= len(cues[0]["nliHypotheses"]) <= 3


def test_extract_semantic_cues_uses_openai_structured_output() -> None:
    fake_client = FakeOpenAIClient(
        {
            "slides": [
                {
                    "slideId": "slide_imported",
                    "semanticCues": [
                        {
                            "meaning": "기존 고객 확장 매출의 의미를 설명했다",
                            "required": True,
                            "priority": 1,
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
                        "keywords": [],
                        "elements": [
                            {
                                "elementId": "headline",
                                "props": {"text": "ARR expansion from existing customers"},
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
    cues = result.model_dump(by_alias=True)["slides"][0]["semanticCues"]
    assert cues[0]["cueId"] == "scue_imported_1"
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


def test_extract_semantic_cues_returns_empty_slide_result_without_terms() -> None:
    response = client().post(
        "/ai/extract-semantic-cues",
        json={
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [{"slideId": "slide_empty"}],
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["slides"] == [
        {"slideId": "slide_empty", "semanticCues": []}
    ]


def test_extract_semantic_cues_skips_generic_import_title_and_fillers() -> None:
    response = client().post(
        "/ai/extract-semantic-cues",
        json={
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
        },
    )

    assert response.status_code == 200
    assert response.json()["slides"] == [
        {"slideId": "slide_imported", "semanticCues": []}
    ]


def test_extract_semantic_cues_preserves_explicit_keyword_priority() -> None:
    response = client().post(
        "/ai/extract-semantic-cues",
        json={
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_keyword",
                        "title": "Slide 2",
                        "speakerNotes": "먼저 여기서 저희는 이를 설명합니다.",
                        "keywords": [{"text": "리텐션 분석"}],
                        "elements": [],
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    cues = response.json()["slides"][0]["semanticCues"]
    assert [cue["candidateKeywords"] for cue in cues] == [["리텐션 분석"]]


def test_extract_semantic_cues_keeps_meaningful_korean_terms_after_fillers() -> None:
    response = client().post(
        "/ai/extract-semantic-cues",
        json={
            "projectId": "project_demo_1",
            "deck": {
                "deckId": "deck_demo_1",
                "slides": [
                    {
                        "slideId": "slide_metrics",
                        "title": "슬라이드 3",
                        "speakerNotes": (
                            "먼저 여기서 저희는 결제 전환율과 이탈 원인을 비교합니다."
                        ),
                        "keywords": [],
                        "elements": [],
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    cues = response.json()["slides"][0]["semanticCues"]
    assert [cue["candidateKeywords"] for cue in cues] == [
        ["결제"],
        ["전환율"],
        ["이탈"],
    ]


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
