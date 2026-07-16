import json
from pathlib import Path

from fastapi.testclient import TestClient

import app.main as api_module
from app.audio.analysis.models import RehearsalSilenceAnalysis
from app.audio.transcribe import TranscriptSegment
from app.config import load_config
from app.rehearsal import (
    DeckKeyword,
    FillerWordDetail,
    RehearsalMetricsResult,
    SlideTimelineEntry,
    analyze_rehearsal_metrics,
    generate_rehearsal_coaching,
)
from tests.test_config import VALID_ENV


P0_FIXTURE_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "shared"
    / "src"
    / "coaching"
    / "p0-core-contract.fixtures.json"
)


class FakeResponses:
    def create(self, **kwargs: object) -> object:
        return type(
            "Response",
            (),
            {
                "output_text": json.dumps(
                    {
                        "summary": "핵심 메시지가 분명합니다.",
                        "aiSummary": {
                            "headline": "핵심 메시지가 분명합니다.",
                            "paragraphs": [
                                "발표 흐름은 안정적입니다.",
                                "다음 연습에서는 도입부를 더 짧게 연습하세요.",
                            ],
                        },
                        "strengths": ["키워드를 언급했습니다."],
                        "improvements": ["불필요한 filler를 줄이세요."],
                        "nextPracticeFocus": "도입부를 더 짧게 연습하세요.",
                    }
                )
            },
        )()


def test_rehearsal_analyze_v1_request_uses_the_compatibility_fixture() -> None:
    fixtures = json.loads(P0_FIXTURE_PATH.read_text(encoding="utf-8"))

    request = api_module.RehearsalAnalyzeRequest.model_validate(
        fixtures["rehearsalAnalyzeRequestV1"]
    )

    assert request.deck_keywords[0].required is True


class FakeClient:
    responses = FakeResponses()


def _measured_silence_analysis(
    segments: list[tuple[float, float]],
) -> RehearsalSilenceAnalysis:
    total_silence_seconds = sum(end - start for start, end in segments)
    window_end = max(end for _start, end in segments) + 1
    return RehearsalSilenceAnalysis(
        metricDefinitionVersion=1,
        measurementState="measured",
        reasonCode=None,
        detector="silero-vad",
        detectorVersion="test-vad",
        speechThreshold=0.5,
        minimumSilenceMs=250,
        longSilenceMs=1000,
        analysisWindowStartSeconds=0,
        analysisWindowEndSeconds=window_end,
        totalSilenceSeconds=total_silence_seconds,
        silenceRatio=total_silence_seconds / window_end,
        longSilenceCount=sum(end - start >= 1 for start, end in segments),
        detectedSegmentCount=len(segments),
        segmentsTruncated=False,
        segments=[
            {
                "category": "long" if end - start >= 1 else "brief",
                "startSeconds": start,
                "endSeconds": end,
                "durationSeconds": end - start,
            }
            for start, end in segments
        ],
    )


def test_analyze_rehearsal_metrics_counts_silences_fillers_and_keywords() -> None:
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
        silence_analysis=_measured_silence_analysis([(2.0, 3.5)]),
    )

    assert metrics.words_per_minute == 12
    assert metrics.filler_word_count == 1
    assert metrics.long_silence_count == 1
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
        silence_analysis=_measured_silence_analysis([(2.0, 3.5)]),
    )

    assert metrics.speed_samples[0].words_per_minute == 90
    assert metrics.filler_word_details == [FillerWordDetail(word="음", count=1)]
    assert metrics.long_silence_count == 1
    assert metrics.missed_keywords[0].keyword_id == "kw_2"
    assert metrics.keyword_coverage == 0.5


def test_analyze_rehearsal_metrics_builds_slide_insights_from_timeline() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="음 ORBIT 소개입니다 어 다음은 실시간 피드백입니다",
        duration_seconds=12,
        segments=[
            TranscriptSegment(text="음 ORBIT 소개입니다", startSeconds=0, endSeconds=3),
            TranscriptSegment(text="어 다음은", startSeconds=4.5, endSeconds=5.5),
            TranscriptSegment(text="실시간 피드백입니다", startSeconds=6, endSeconds=8),
        ],
        deck_keywords=[],
        slide_timeline=[
            SlideTimelineEntry(slide_id="slide_1", entered_second=0),
            SlideTimelineEntry(slide_id="slide_2", entered_second=4),
        ],
        silence_analysis=_measured_silence_analysis([(3.0, 4.5)]),
    )

    assert len(metrics.slide_insights) == 2
    assert metrics.slide_insights[0].slide_id == "slide_1"
    assert metrics.slide_insights[0].filler_word_count == 1
    assert metrics.slide_insights[0].long_silence_count == 1
    assert metrics.slide_insights[1].slide_id == "slide_2"
    assert metrics.slide_insights[1].filler_word_count == 1
    assert metrics.slide_insights[1].long_silence_count == 0


def test_analyze_rehearsal_metrics_uses_segment_duration_when_total_duration_is_missing() -> (
    None
):
    metrics = analyze_rehearsal_metrics(
        transcript="하나 둘 셋 넷 다섯 여섯",
        duration_seconds=0,
        segments=[
            TranscriptSegment(text="하나 둘 셋", startSeconds=10, endSeconds=20),
            TranscriptSegment(text="넷 다섯 여섯", startSeconds=20, endSeconds=40),
        ],
        deck_keywords=[],
    )

    assert metrics.words_per_minute == 12


def test_analyze_rehearsal_metrics_does_not_inflate_speed_without_duration_data() -> (
    None
):
    metrics = analyze_rehearsal_metrics(
        transcript="하나 둘 셋 넷 다섯 여섯",
        duration_seconds=0,
        segments=[],
        deck_keywords=[],
    )

    assert metrics.words_per_minute == 0


def test_analyze_rehearsal_metrics_does_not_count_contextual_geu_as_filler() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="그 프로젝트는 음 안정적이고 그니까 다음으로 넘어가겠습니다",
        duration_seconds=30,
        segments=[],
        deck_keywords=[],
    )

    assert metrics.filler_word_count == 2
    assert metrics.filler_word_details == [
        FillerWordDetail(word="그니까", count=1),
        FillerWordDetail(word="음", count=1),
    ]


def test_analyze_rehearsal_metrics_counts_normalized_and_phrase_fillers() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="으음 오늘은 뭐 랄까 ORBIT 소개입니다 you know 핵심은 umm 자동 리포트입니다",
        duration_seconds=30,
        segments=[],
        deck_keywords=[],
    )

    assert metrics.filler_word_count == 4
    assert metrics.filler_word_details == [
        FillerWordDetail(word="um", count=1),
        FillerWordDetail(word="you know", count=1),
        FillerWordDetail(word="뭐랄까", count=1),
        FillerWordDetail(word="음", count=1),
    ]


def test_analyze_rehearsal_metrics_counts_common_korean_fillers() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="아 이제 일단 ORBIT을 소개하고 사실 뭐냐면 발표 연습을 자동화합니다",
        duration_seconds=30,
        segments=[],
        deck_keywords=[],
    )

    assert metrics.filler_word_count == 5
    assert metrics.filler_word_details == [
        FillerWordDetail(word="뭐냐면", count=1),
        FillerWordDetail(word="사실", count=1),
        FillerWordDetail(word="아", count=1),
        FillerWordDetail(word="이제", count=1),
        FillerWordDetail(word="일단", count=1),
    ]


def test_analyze_rehearsal_metrics_does_not_count_non_filler_substrings() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="음악 자료와 그 프로젝트를 설명합니다",
        duration_seconds=30,
        segments=[],
        deck_keywords=[],
    )

    assert metrics.filler_word_count == 0
    assert metrics.filler_word_details == []


def test_analyze_rehearsal_metrics_uses_vad_silence_instead_of_segment_gaps() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="첫 문장 다음 문장",
        duration_seconds=10,
        segments=[
            TranscriptSegment(text="첫 문장", startSeconds=0.5, endSeconds=1.5),
            TranscriptSegment(text="다음 문장", startSeconds=4.25, endSeconds=5.25),
        ],
        deck_keywords=[],
        silence_analysis=_measured_silence_analysis([(2.0, 3.0), (6.0, 6.5)]),
    )

    assert metrics.long_silence_count == 1


def test_analyze_rehearsal_metrics_does_not_derive_silence_from_segment_gaps() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="하나 둘 셋",
        duration_seconds=5,
        segments=[
            TranscriptSegment(text="셋", startSeconds=2.9, endSeconds=4),
            TranscriptSegment(text="하나", startSeconds=0, endSeconds=1),
            TranscriptSegment(text="겹침", startSeconds=0.5, endSeconds=1.5),
            TranscriptSegment(text="무시", startSeconds=None, endSeconds=None),
        ],
        deck_keywords=[],
    )

    assert metrics.long_silence_count is None


def test_generate_rehearsal_coaching_parses_structured_llm_response() -> None:
    coaching = generate_rehearsal_coaching(
        transcript="ORBIT 발표입니다",
        metrics=RehearsalMetricsResult(
            words_per_minute=120,
            filler_word_count=1,
            long_silence_count=0,
            keyword_coverage=1,
        ),
        client=FakeClient(),
        model="fake-model",
        api_key=None,
    )

    assert coaching.status == "succeeded"
    assert coaching.summary == "핵심 메시지가 분명합니다."
    assert coaching.ai_summary_headline == "핵심 메시지가 분명합니다."
    assert coaching.ai_summary_paragraphs == [
        "발표 흐름은 안정적입니다.",
        "다음 연습에서는 도입부를 더 짧게 연습하세요.",
    ]
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


def test_rehearsal_analyze_endpoint_rejects_unknown_top_level_fields() -> None:
    api_module.app.state.config = load_config(VALID_ENV)
    client = TestClient(api_module.app)

    response = client.post(
        "/rehearsal/analyze",
        json={
            "runId": "run-1",
            "projectId": "project-a",
            "deckId": "deck-a",
            "transcript": "ORBIT 발표입니다",
            "durationSeconds": 30,
            "segments": [],
            "deckKeywords": [],
            "unexpectedField": "must-be-rejected",
        },
    )

    assert response.status_code == 422


def test_rehearsal_analyze_endpoint_rejects_unknown_nested_fields() -> None:
    api_module.app.state.config = load_config(VALID_ENV)
    client = TestClient(api_module.app)

    response = client.post(
        "/rehearsal/analyze",
        json={
            "runId": "run-1",
            "projectId": "project-a",
            "deckId": "deck-a",
            "transcript": "ORBIT 발표입니다",
            "durationSeconds": 30,
            "segments": [
                {
                    "text": "ORBIT 발표입니다",
                    "startSeconds": 0,
                    "endSeconds": 3,
                    "providerPayload": "must-be-rejected",
                }
            ],
            "deckKeywords": [],
        },
    )

    assert response.status_code == 422
