import json

from fastapi.testclient import TestClient

import app.main as api_module
from app.audio.transcribe import TranscriptSegment
from app.config import load_config
from app.rehearsal import (
    DeckKeyword,
    FillerWordDetail,
    RehearsalMetricsResult,
    analyze_rehearsal_metrics,
    generate_rehearsal_coaching,
)
from tests.test_config import VALID_ENV


class FakeResponses:
    def create(self, **kwargs: object) -> object:
        return type(
            "Response",
            (),
            {
                "output_text": json.dumps(
                    {
                        "summary": "핵심 메시지가 분명합니다.",
                        "strengths": ["키워드를 언급했습니다."],
                        "improvements": ["불필요한 filler를 줄이세요."],
                        "nextPracticeFocus": "도입부를 더 짧게 연습하세요.",
                    }
                )
            },
        )()


class FakeClient:
    responses = FakeResponses()


def test_analyze_rehearsal_metrics_counts_pauses_fillers_and_keywords() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="음 오늘은 ORBIT 실시간 피드백을 설명합니다",
        duration_seconds=30,
        segments=[
            TranscriptSegment(text="음 오늘은 ORBIT", startSeconds=0, endSeconds=2),
            TranscriptSegment(text="실시간 피드백", startSeconds=3.5, endSeconds=5),
        ],
        deck_keywords=[
            DeckKeyword(text="ORBIT", synonyms=["오르빗"]),
            DeckKeyword(text="실시간 피드백"),
        ],
    )

    assert metrics.words_per_minute == 12
    assert metrics.filler_word_count == 1
    assert metrics.pause_count == 1
    assert metrics.keyword_coverage == 1


def test_analyze_rehearsal_metrics_builds_safe_report_details() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="음 오늘은 ORBIT 발표입니다",
        duration_seconds=30,
        segments=[
            TranscriptSegment(text="음 오늘은 ORBIT", startSeconds=0, endSeconds=2),
            TranscriptSegment(text="발표입니다", startSeconds=3.5, endSeconds=5),
        ],
        deck_keywords=[
            DeckKeyword(keyword_id="kw_1", slide_id="slide_1", text="ORBIT"),
            DeckKeyword(keyword_id="kw_2", slide_id="slide_1", text="리포트"),
        ],
    )

    assert metrics.speed_samples[0].words_per_minute == 90
    assert metrics.filler_word_details == [FillerWordDetail(word="음", count=1)]
    assert metrics.pause_details[0].duration_seconds == 1.5
    assert metrics.missed_keywords[0].keyword_id == "kw_2"
    assert metrics.keyword_coverage == 0.5


def test_generate_rehearsal_coaching_parses_structured_llm_response() -> None:
    coaching = generate_rehearsal_coaching(
        transcript="ORBIT 발표입니다",
        metrics=RehearsalMetricsResult(
            words_per_minute=120,
            filler_word_count=1,
            pause_count=0,
            keyword_coverage=1,
        ),
        client=FakeClient(),
        model="fake-model",
        api_key=None,
    )

    assert coaching.status == "succeeded"
    assert coaching.summary == "핵심 메시지가 분명합니다."
    assert coaching.next_practice_focus == "도입부를 더 짧게 연습하세요."


def test_rehearsal_analyze_endpoint_fails_when_coaching_is_unavailable() -> None:
    api_module.app.state.config = load_config(VALID_ENV)
    client = TestClient(api_module.app)

    response = client.post(
        "/rehearsal/analyze",
        json={
            "runId": "run-1",
            "projectId": "project-a",
            "deckId": "deck-a",
            "transcript": "어 ORBIT 발표입니다",
            "durationSeconds": 30,
            "segments": [
                {
                    "text": "어 ORBIT 발표입니다",
                    "startSeconds": 0,
                    "endSeconds": 3,
                }
            ],
            "deckKeywords": [{"text": "ORBIT"}],
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "OPENAI_API_KEY is not configured."
