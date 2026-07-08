from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as api_module
from app.main import app
from app.references import EmbeddingResult, ReferenceSearchResult
from tests.test_config import VALID_ENV


class FakeChatClient:
    class Chat:
        class Completions:
            def __init__(self, parent: "FakeChatClient") -> None:
                self.parent = parent

            def create(self, **kwargs: object) -> object:
                self.parent.requests.append(kwargs)
                message = type("Message", (), {"content": "근거 기반 답변입니다."})()
                choice = type("Choice", (), {"message": message})()
                return type("ChatResponse", (), {"choices": [choice]})()

        def __init__(self, parent: "FakeChatClient") -> None:
            self.completions = self.Completions(parent)

    def __init__(self) -> None:
        self.requests: list[dict[str, object]] = []
        self.chat = self.Chat(self)


def test_qna_answer_uses_selected_references(monkeypatch) -> None:
    fake_chat_client = FakeChatClient()
    app.state.config = api_module.load_config(
        {**VALID_ENV, "OPENAI_API_KEY": "test-key"},
    )
    app.state.qna_chat_client = fake_chat_client

    def fake_search_reference_chunks(**kwargs: object) -> object:
        assert kwargs["file_ids"] == ["file_1", "file_2"]
        return (
            [
                ReferenceSearchResult(
                    chunk_id="chunk-1",
                    project_id="project_1",
                    file_id="file_2",
                    chunk_index=0,
                    content="선택된 참고자료 근거",
                    metadata={"title": "선택 자료"},
                    score=0.91,
                )
            ],
            EmbeddingResult(status="succeeded"),
        )

    monkeypatch.setattr(
        api_module,
        "search_reference_chunks",
        fake_search_reference_chunks,
    )
    client = TestClient(app)

    response = client.post(
        "/qna/answer",
        json={
            "projectId": "project_1",
            "sessionId": "session_1",
            "questionId": "question_00000000-0000-4000-8000-000000000001",
            "questionText": "핵심 내용은 무엇인가요?",
            "publicSlideContext": "공개 슬라이드 내용",
            "selectedReferenceIds": ["file_1", "file_2"],
            "retrievalLimit": 1,
            "confidenceThreshold": 0.65,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "answered"
    assert response.json()["answerText"] == "근거 기반 답변입니다."
    assert response.json()["sourceReferences"] == [
        "deck-slide:공개 슬라이드 내용",
        "reference-material:선택 자료",
    ]
    assert fake_chat_client.requests


def test_qna_answer_fails_without_grounding_sources() -> None:
    app.state.config = api_module.load_config(VALID_ENV)
    client = TestClient(app)

    response = client.post(
        "/qna/answer",
        json={
            "projectId": "project_1",
            "sessionId": "session_1",
            "questionId": "question_00000000-0000-4000-8000-000000000001",
            "questionText": "아무 질문",
            "publicSlideContext": "",
            "selectedReferenceIds": [],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "failed",
        "answerText": None,
        "sourceReferences": [],
        "confidence": 0.0,
        "failureReason": "no-grounding",
    }


def test_qna_answer_fails_without_openai_key_even_with_sources() -> None:
    app.state.config = api_module.load_config(VALID_ENV)
    client = TestClient(app)

    response = client.post(
        "/qna/answer",
        json={
            "projectId": "project_1",
            "sessionId": "session_1",
            "questionId": "question_00000000-0000-4000-8000-000000000001",
            "questionText": "핵심 내용은 무엇인가요?",
            "publicSlideContext": "공개 슬라이드 내용",
            "selectedReferenceIds": ["file_1"],
            "confidenceThreshold": 0.78,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "failed",
        "answerText": None,
        "sourceReferences": [
            "deck-slide:공개 슬라이드 내용",
            "reference-material:file_1",
        ],
        "confidence": 0.0,
        "failureReason": "no-grounding",
    }


def test_qna_answer_fails_on_weak_grounding(monkeypatch) -> None:
    app.state.config = api_module.load_config(
        {**VALID_ENV, "OPENAI_API_KEY": "test-key"},
    )
    app.state.qna_chat_client = FakeChatClient()

    def fake_search_reference_chunks(**kwargs: object) -> object:
        assert kwargs["file_ids"] == ["file_weak"]
        return (
            [
                ReferenceSearchResult(
                    chunk_id="chunk-weak",
                    project_id="project_1",
                    file_id="file_weak",
                    chunk_index=0,
                    content="약한 근거",
                    metadata={"title": "약한 자료"},
                    score=0.52,
                )
            ],
            EmbeddingResult(status="succeeded"),
        )

    monkeypatch.setattr(
        api_module,
        "search_reference_chunks",
        fake_search_reference_chunks,
    )
    client = TestClient(app)

    response = client.post(
        "/qna/answer",
        json={
            "projectId": "project_1",
            "sessionId": "session_1",
            "questionId": "question_00000000-0000-4000-8000-000000000001",
            "questionText": "근거가 약한가요?",
            "publicSlideContext": "",
            "selectedReferenceIds": ["file_weak"],
            "confidenceThreshold": 0.78,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "failed",
        "answerText": None,
        "sourceReferences": ["reference-material:약한 자료"],
        "confidence": 0.52,
        "failureReason": "low-confidence",
    }
