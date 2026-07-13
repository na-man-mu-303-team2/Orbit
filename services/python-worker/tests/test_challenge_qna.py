from fastapi.testclient import TestClient

from app.main import app


def test_generates_exact_grounded_question_count() -> None:
    response = TestClient(app).post(
        "/challenge-qna/generate",
        json={
            "source": {"mode": "final", "sourceFullRunId": "run-a", "questionCount": 3},
            "sourceSnapshot": {
                "deck": {"deckVersion": 2, "slides": [{
                    "slideId": "slide-a", "order": 1, "title": "시장 기회", "visibleText": "Editor preview 시장 규모 10조",
                    "contentHash": "a" * 64,
                }]},
                "linkedGoalRefs": [{"goalId": "goal-a"}],
            },
            "groundingSnapshot": {"chunks": []},
        },
    )

    assert response.status_code == 200
    questions = response.json()["questions"]
    assert len(questions) == 3
    assert questions[0]["answerGuide"]["supportState"] == "grounded"
    assert questions[0]["sourceRefs"][0]["slideId"] == "slide-a"
    assert [question["questionType"] for question in questions] == [
        "evidence",
        "objection",
        "decision",
    ]
    assert len({question["questionText"] for question in questions}) == 3
    assert all("시장 기회" in question["questionText"] for question in questions)
    assert all("Editor preview" not in question["questionText"] for question in questions)
    assert len({tuple(question["answerGuide"]["suggestedStructure"]) for question in questions}) == 3


def test_analyzes_answer_without_returning_raw_text() -> None:
    response = TestClient(app).post(
        "/challenge-qna/analyze-answer",
        json={
            "answerText": "시장 규모 10조라는 근거를 바탕으로 투자 결정을 요청합니다.",
            "questionText": "근거는 무엇입니까?",
            "answerGuide": {"mustIncludeConcepts": [{"conceptId": "concept-a", "label": "시장 규모 10조"}]},
            "sourceSnapshot": {},
        },
    )

    assert response.status_code == 200
    assert response.json()["conceptOutcomes"][0]["outcome"] == "covered"
    assert "answerText" not in response.json()
