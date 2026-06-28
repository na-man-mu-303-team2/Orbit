from fastapi.testclient import TestClient

import app.main as api_module


def test_generate_deck_endpoint_returns_deck_contract() -> None:
    client = TestClient(api_module.app)
    response = client.post(
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
    client = TestClient(api_module.app)
    response = client.post(
        "/ai/generate-deck",
        json={"projectId": "project_demo_1", "topic": "ORBIT"},
    )

    assert response.status_code == 200
    assert response.json()["warnings"] == [
        "참고자료 없이 topic-only generation으로 생성했습니다."
    ]


def test_generate_deck_endpoint_uses_reference_keywords() -> None:
    client = TestClient(api_module.app)
    response = client.post(
        "/ai/generate-deck",
        json={
            "projectId": "project_demo_1",
            "topic": "AI 덱 생성",
            "slideCountRange": {"min": 2, "max": 2},
            "references": [{"fileId": "file_1"}],
            "referenceKeywords": [
                {"text": "실시간 발표 피드백"},
                {"text": " 실시간 발표 피드백 "},
                {"text": "전환율"},
            ],
        },
    )

    assert response.status_code == 200
    slides = response.json()["deck"]["slides"]
    assert all(
        [keyword["text"] for keyword in slide["keywords"]]
        == ["실시간 발표 피드백", "전환율"]
        for slide in slides
    )
