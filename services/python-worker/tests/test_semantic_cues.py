from fastapi.testclient import TestClient

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
