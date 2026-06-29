import json
from typing import Any

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
            "targetDurationMinutes": 8,
            "slideCountRange": {"min": 4, "max": 5},
            "template": "report",
            "metadata": {
                "audience": "technical",
                "purpose": "inform",
                "tone": "professional",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    deck = payload["deck"]

    assert payload["validation"]["passed"] is True
    assert payload["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]
    assert deck["deckId"].startswith("deck_")
    assert deck["projectId"] == "project_demo_1"
    assert deck["metadata"]["generatedBy"] == "ai"
    assert deck["metadata"]["createdFrom"]["references"] == []
    assert 4 <= len(deck["slides"]) <= 5
    assert deck["slides"][0]["aiNotes"]["sourceEvidence"] == []
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
    payload = response.json()
    speaker_notes = payload["deck"]["slides"][0]["speakerNotes"]
    assert payload["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]
    assert "안녕하세요. 오늘은 ORBIT" in speaker_notes
    assert "슬라이드에서는" not in speaker_notes
    assert "설명합니다" not in speaker_notes
    assert "제공합니다" not in speaker_notes


def test_generate_deck_applies_content_aware_theme_and_fonts() -> None:
    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="Google Speech-to-Text 언어 및 방언 지원",
            slideCountRange={"min": 2, "max": 2},
        )
    )

    deck = response.deck
    title_element = next(
        element
        for element in deck["slides"][0]["elements"]
        if element["type"] == "text" and element["role"] == "title"
    )
    assert deck["theme"]["name"] == "default-voice-tech-ai"
    assert deck["theme"]["backgroundColor"] == "#f7fbff"
    assert deck["theme"]["accentColor"] == "#1a73e8"
    assert deck["theme"]["typography"]["headingFontFamily"] == "Noto Sans KR"
    assert title_element["props"]["fontFamily"] == "Noto Sans KR"
    assert title_element["props"]["fontSize"] == 64


def test_generate_deck_endpoint_requires_llm_for_reference_generation() -> None:
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

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_generate_deck_uses_llm_content_plan_with_reference_context() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "전기 타입 포켓몬",
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
    slide_keywords = [
        keyword["text"]
        for keyword in response.deck["slides"][0]["keywords"]
    ]
    assert response.deck["title"] == "피카츄 소개: 전기 타입 포켓몬"
    assert response.validation.passed is True
    assert body_texts[0] == "피카츄는 볼주머니에 전기를 저장하는 전기 타입 포켓몬입니다."
    assert slide_keywords == ["전기 타입", "볼주머니", "피카츄"]
    assert "피카츄는 볼주머니" in fake_client.requests[0]["input"]
    assert "actual Korean presenter script" in fake_client.requests[0]["instructions"]
    assert "목적과 기대 결과" not in "\n".join(body_texts)
    assert "결정 사항, 실행 순서" not in "\n".join(body_texts)


def test_generate_deck_uses_design_intents_without_schema_leak() -> None:
    fake_client = FakeOpenAIClient(
        {
            "title": "디자인 고도화",
            "slides": [
                slide_payload(
                    "한눈에 보는 ORBIT",
                    "발표 흐름을 먼저 보여주고 핵심 메시지를 고정합니다.",
                    "첫 장에서는 ORBIT의 목적과 흐름을 짧게 소개합니다.",
                    slide_type="title",
                    slot_preset="title_left_visual_right",
                    media_intent={
                        "kind": "generate",
                        "prompt": "생성형 발표 도구의 작업 흐름",
                        "alt": "AI 발표 자료 생성 흐름",
                        "caption": "AI 생성 흐름 이미지",
                        "rationale": "시각 자료가 이해를 돕기 때문입니다.",
                        "required": True,
                        "placement": "right",
                        "src": "",
                    },
                ),
                slide_payload(
                    "핵심 지표",
                    "반복 작업 시간을 줄이고 발표 준비 속도를 높이는 점을 강조합니다.",
                    "숫자와 근거를 함께 설명합니다.",
                    slide_type="data",
                    slot_preset="metric_cards",
                ),
                slide_payload(
                    "이전 방식과 ORBIT",
                    "수동 정리와 자동 초안 생성의 차이를 비교합니다.",
                    "두 방식의 차이를 기준별로 설명합니다.",
                    slide_type="comparison",
                    slot_preset="before_after",
                ),
                slide_payload(
                    "사용자가 기억할 한 문장",
                    "발표자는 내용에 집중하고 ORBIT는 반복 작업을 줄입니다.",
                    "마무리에서는 기억할 문장을 중심으로 정리합니다.",
                    slide_type="quote",
                    slot_preset="quote_with_source",
                ),
                slide_payload(
                    "기존 chart 동작",
                    "차트 슬라이드는 기존 chart-focus 레이아웃을 유지합니다.",
                    "기존 차트 생성 경로가 유지되는지 확인합니다.",
                    slide_type="chart",
                    slot_preset="insight_with_evidence",
                ),
            ],
        }
    )

    response = generate_deck(
        GenerateDeckRequest(
            projectId="project_demo_1",
            topic="ORBIT",
            prompt="AI 덱 생성 디자인 고도화",
            slideCountRange={"min": 5, "max": 5},
        ),
        client=fake_client,
    )

    deck_text = json.dumps(response.deck, ensure_ascii=False)
    assert "visualIntent" not in deck_text
    assert "mediaIntent" not in deck_text
    assert "slotPreset" not in deck_text
    assert has_element(response.deck["slides"][0], "el_1_media_placeholder")
    assert response.deck["slides"][1]["style"]["layout"] == "two-column"
    assert has_element(response.deck["slides"][1], "el_2_metric_card")
    generated_texts = [
        element["props"]["text"]
        for slide in response.deck["slides"]
        for element in slide["elements"]
        if element["type"] == "text"
    ]
    assert all(not text.startswith("핵심\n") for text in generated_texts)
    assert has_element(response.deck["slides"][2], "el_3_comparison_divider")
    assert has_element(response.deck["slides"][3], "el_4_quote_block")
    assert any(
        element["type"] == "chart"
        for element in response.deck["slides"][4]["elements"]
    )
    assert response.deck["slides"][4]["style"]["layout"] == "chart-focus"
    assert response.validation.passed is True
    assert response.validation.design_issues[0].message == (
        "이미지 소스가 없어 자리 표시자를 생성했습니다."
    )
    assert "\ufffd" not in json.dumps(
        response.model_dump(by_alias=True),
        ensure_ascii=False,
    )


def slide_payload(
    title: str,
    message: str,
    speaker_notes: str,
    *,
    slide_type: str,
    slot_preset: str,
    media_intent: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "title": title,
        "message": message,
        "speakerNotes": speaker_notes,
        "keywords": ["ORBIT"],
        "slideType": slide_type,
        "layoutVariant": slot_preset.split("_", maxsplit=1)[0],
        "slotPreset": slot_preset,
        "visualIntent": {
            "emphasis": "핵심 메시지",
            "mood": "professional",
            "structure": "safe slots",
        },
        "mediaIntent": media_intent
        or {
            "kind": "none",
            "prompt": "",
            "alt": "",
            "caption": "",
            "rationale": "",
            "required": False,
            "placement": "auto",
            "src": "",
        },
    }


def has_element(slide: dict[str, Any], element_id: str) -> bool:
    return any(
        element["elementId"] == element_id
        for element in slide["elements"]
    )


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
