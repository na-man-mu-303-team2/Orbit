from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_qna_answer_uses_selected_references() -> None:
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
    assert response.json()["sourceReferences"] == ["file_1"]


def test_qna_answer_fails_without_grounding_sources() -> None:
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
