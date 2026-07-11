from fastapi.testclient import TestClient

from app.main import app


def test_focused_practice_returns_only_bounded_goal_outcomes() -> None:
    response = TestClient(app).post(
        "/focused-practice/analyze",
        json={
            "transcript": "핵심 가치를 충분히 설명했습니다",
            "durationMs": 25_000,
            "goals": [
                {
                    "goalId": "goal-1",
                    "criterionRef": {"criterionId": "timing-1", "revision": 1},
                    "criterion": {
                        "measurement": {
                            "type": "max-duration-seconds",
                            "maximum": 30,
                        }
                    },
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["outcomes"][0]["outcome"] == "passed"
    assert "transcript" not in response.text
