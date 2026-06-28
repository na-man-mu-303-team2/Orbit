import json

from fastapi.testclient import TestClient

import app.main as api_module
from app.ai.generate_deck import GenerateDeckRequest, ReferenceContext, generate_deck
from tests.test_config import VALID_ENV


def client() -> TestClient:
    api_module.app.state.config = api_module.load_config(VALID_ENV)
    return TestClient(api_module.app)


def test_generate_deck_endpoint_returns_deck_contract() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={
            "projectId": "project_demo_1",
            "topic": "AI 덱 생성",
            "prompt": "참고자료 기반으로 핵심 메시지를 정리",
            "targetDurationMinutes": 8,
            "slideCountRange": {"min": 4, "max": 5},
            "template": "report",
            "metadata": {
                "audience": "technical",
                "purpose": "inform",
                "tone": "professional",
            },
            "references": [{"fileId": "file_1"}],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    deck = payload["deck"]

    assert payload["validation"]["passed"] is True
    assert payload["warnings"] == []
    assert deck["deckId"].startswith("deck_")
    assert deck["projectId"] == "project_demo_1"
    assert deck["metadata"]["generatedBy"] == "ai"
    assert deck["metadata"]["createdFrom"]["references"] == [{"fileId": "file_1"}]
    assert 4 <= len(deck["slides"]) <= 5
    assert deck["slides"][0]["aiNotes"]["sourceEvidence"][0]["fileId"] == "file_1"
    assert all(
        element["x"] + element["width"] <= deck["canvas"]["width"]
        for slide in deck["slides"]
        for element in slide["elements"]
    )
    assert all(
        any(element["role"] == "decoration" for element in slide["elements"])
        for slide in deck["slides"]
    )
    assert any(
        sum(1 for element in slide["elements"] if element["type"] != "text") >= 3
        for slide in deck["slides"]
    )


def test_generate_deck_endpoint_supports_topic_only_generation() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={"projectId": "project_demo_1", "topic": "ORBIT"},
    )

    assert response.status_code == 200
    assert response.json()["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]


def test_generate_deck_endpoint_uses_reference_keywords() -> None:
    response = client().post(
        "/ai/generate-deck",
        json={
            "projectId": "project_demo_1",
            "topic": "피카츄 소개",
            "slideCountRange": {"min": 2, "max": 2},
            "references": [{"fileId": "file_1"}],
            "referenceKeywords": [
                {"text": "전기 타입"},
                {"text": " 전기 타입 "},
                {"text": "볼주머니"},
            ],
        },
    )

    assert response.status_code == 200
    slides = response.json()["deck"]["slides"]
    assert all(
        [keyword["text"] for keyword in slide["keywords"]]
        == ["전기 타입", "볼주머니"]
        for slide in slides
    )
    body_text = "\n".join(
        element["props"]["text"]
        for slide in slides
        for element in slide["elements"]
        if element["type"] == "text" and element["role"] == "body"
    )
    assert "피카츄" in body_text
    assert "목적과 기대 결과" not in body_text
    assert "결정 사항, 실행 순서" not in body_text


def test_generate_deck_uses_llm_content_plan_with_reference_context() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "피카츄 소개 발표안",
            "slides": [
                {
                    "title": "피카츄란?",
                    "message": "피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬입니다.",
                    "speakerNotes": "볼주머니와 전기 타입 특징을 연결해 소개합니다.",
                    "keywords": ["피카츄", "전기 타입"],
                },
                {
                    "title": "핵심 특징",
                    "message": "볼주머니, 번개 모양 꼬리, 친근한 이미지가 대표 특징입니다.",
                    "speakerNotes": "참고자료의 특징을 청중이 기억하기 쉽게 설명합니다.",
                    "keywords": ["볼주머니", "꼬리"],
                },
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="피카츄 소개",
            slideCountRange={"min": 2, "max": 2},
            references=[{"fileId": "file_1"}],
            referenceKeywords=[{"text": "전기 타입"}, {"text": "볼주머니"}],
        ),
        client=fake_client,
        model="gpt-test",
        reference_context=[
            ReferenceContext(
                fileId="file_1",
                title="pikachu.pdf",
                content="피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬이다.",
            )
        ],
    )

    body_texts = [
        element["props"]["text"]
        for slide in response.deck["slides"]
        for element in slide["elements"]
        if element["type"] == "text" and element["role"] == "body"
    ]
    assert body_texts[0] == "피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬입니다."
    assert "피카츄는 볼주머니" in fake_client.requests[0]["input"]


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.requests: list[dict[str, object]] = []
        self.responses = FakeResponses(self, payload)


class FakeResponses:
    def __init__(self, parent: FakeOpenAIClient, payload: dict[str, object]) -> None:
        self.parent = parent
        self.payload = payload

    def create(self, **kwargs: object) -> object:
        self.parent.requests.append(kwargs)
        return type(
            "Response",
            (),
            {"output_text": json.dumps(self.payload, ensure_ascii=False)},
        )()
