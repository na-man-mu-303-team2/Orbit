import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.main as api_module
from app.ai.speaker_notes import (
    SpeakerNotesSuggestionError,
    SpeakerNotesSuggestionRequest,
    generate_speaker_notes_suggestion,
)
from tests.test_config import VALID_ENV


class FakeOpenAIClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []
        self.responses = self

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload, ensure_ascii=False))


def test_generates_structured_spoken_korean_suggestion() -> None:
    fake = FakeOpenAIClient(
        {
            "suggestedNotes": "먼저 기존 워크스페이스의 한계를 짚어보겠습니다.",
            "summary": "문장을 말하듯 자연스럽게 다듬었습니다.",
            "warnings": [],
        }
    )
    payload = SpeakerNotesSuggestionRequest.model_validate(
        {
            "mode": "naturalize",
            "slideTitle": "개편 배경",
            "slideContent": ["기존 워크스페이스 한계", "AI 발표자료 생성 효율화"],
            "currentNotes": "기존 한계를 해결하고자 합니다.",
            "targetSpeakerNotesChars": 180,
            "charsPerMinute": 320,
        }
    )

    result = generate_speaker_notes_suggestion(
        payload,
        model="test-model",
        api_key=None,
        client=fake,
    )

    assert result.suggested_notes.startswith("먼저")
    assert fake.calls[0]["text"]["format"]["strict"] is True
    assert "untrusted data" in fake.calls[0]["instructions"]


def test_generates_an_icebreaker_before_existing_notes() -> None:
    fake = FakeOpenAIClient(
        {
            "suggestedNotes": "여러분은 발표를 시작할 때 무엇이 가장 궁금하신가요? 기존 설명을 이어가겠습니다.",
            "summary": "기존 대본 앞에 아이스브레이킹을 추가했습니다.",
            "warnings": [],
        }
    )
    payload = SpeakerNotesSuggestionRequest.model_validate(
        {
            "mode": "icebreaker",
            "slideTitle": "서비스 소개",
            "slideContent": ["사용자 경험 개선"],
            "currentNotes": "기존 설명을 이어가겠습니다.",
        }
    )

    result = generate_speaker_notes_suggestion(
        payload,
        model="test-model",
        api_key=None,
        client=fake,
    )

    assert result.suggested_notes.startswith("여러분은")
    assert "icebreaker introduction" in fake.calls[0]["instructions"]


def test_does_not_generate_fallback_without_openai_key() -> None:
    payload = SpeakerNotesSuggestionRequest.model_validate(
        {
            "mode": "draft",
            "slideTitle": "개편 배경",
            "slideContent": ["기존 워크스페이스 한계"],
            "currentNotes": "",
        }
    )

    with pytest.raises(SpeakerNotesSuggestionError, match="OPENAI_API_KEY"):
        generate_speaker_notes_suggestion(payload, model="test-model", api_key=None)


def test_endpoint_returns_503_without_openai_key() -> None:
    api_module.app.state.config = api_module.load_config(VALID_ENV)
    response = TestClient(api_module.app).post(
        "/ai/speaker-notes/suggest",
        json={
            "mode": "draft",
            "slideTitle": "개편 배경",
            "slideContent": ["기존 워크스페이스 한계"],
            "currentNotes": "",
        },
    )

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
