from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as api_module
from app.main import app
from tests.test_config import VALID_ENV


def test_qna_answer_uses_selected_references() -> None:
    app.state.config = api_module.load_config(
        {**VALID_ENV, "OPENAI_API_KEY": "test-key"},
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
    assert response.json()["sourceReferences"] == ["deck-slide:공개 슬라이드 내용"]


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
