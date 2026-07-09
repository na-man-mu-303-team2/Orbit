import json

from fastapi.testclient import TestClient

import app.main as api_module
from app.audio.transcribe import TranscriptSegment
from app.config import load_config
from app.rehearsal import (
    ActualSlideMessage,
    DeckKeyword,
    FillerWordDetail,
    MessageUnit,
    RehearsalMetricsResult,
    SlideContext,
    SlideContextInsight,
    SlideRawInput,
    SlideTimelineEntry,
    analyze_rehearsal_metrics,
    build_script_revision_suggestions,
    detect_pronunciation_cautions,
    evaluate_message_coverage,
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


class FakeClient:
    responses = FakeResponses()


class FakeCoverageResponses:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def create(self, **kwargs: object) -> object:
        return type(
            "Response",
            (),
            {
                "output_text": json.dumps(self.payload),
            },
        )()


class FakeCoverageClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.responses = FakeCoverageResponses(payload)


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
    )

    assert len(metrics.slide_insights) == 2
    assert metrics.slide_insights[0].slide_id == "slide_1"
    assert metrics.slide_insights[0].filler_word_count == 1
    assert metrics.slide_insights[0].pause_count == 1
    assert metrics.slide_insights[1].slide_id == "slide_2"
    assert metrics.slide_insights[1].filler_word_count == 1
    assert metrics.slide_insights[1].pause_count == 0


def test_analyze_rehearsal_metrics_uses_segment_duration_when_total_duration_is_missing() -> None:
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


def test_analyze_rehearsal_metrics_does_not_inflate_speed_without_duration_data() -> None:
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


def test_analyze_rehearsal_metrics_records_long_silence_details() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="첫 문장 다음 문장",
        duration_seconds=10,
        segments=[
            TranscriptSegment(text="첫 문장", startSeconds=0.5, endSeconds=1.5),
            TranscriptSegment(text="다음 문장", startSeconds=4.25, endSeconds=5.25),
        ],
        deck_keywords=[],
    )

    assert metrics.pause_count == 1
    assert metrics.pause_details[0].start_second == 1.5
    assert metrics.pause_details[0].end_second == 4.25
    assert metrics.pause_details[0].duration_seconds == 2.75


def test_analyze_rehearsal_metrics_sorts_segments_before_counting_pauses() -> None:
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

    assert metrics.pause_count == 1
    assert metrics.pause_details[0].start_second == 1.5
    assert metrics.pause_details[0].end_second == 2.9
    assert metrics.pause_details[0].duration_seconds == 1.4


def test_analyze_rehearsal_metrics_ignores_short_segment_gaps() -> None:
    metrics = analyze_rehearsal_metrics(
        transcript="하나 둘",
        duration_seconds=3,
        segments=[
            TranscriptSegment(text="하나", startSeconds=0, endSeconds=1),
            TranscriptSegment(text="둘", startSeconds=1.9, endSeconds=3),
        ],
        deck_keywords=[],
    )

    assert metrics.pause_count == 0
    assert metrics.pause_details == []


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
    assert coaching.ai_summary_headline == "핵심 메시지가 분명합니다."
    assert coaching.ai_summary_paragraphs == [
        "발표 흐름은 안정적입니다.",
        "다음 연습에서는 도입부를 더 짧게 연습하세요.",
    ]
    assert coaching.next_practice_focus == "도입부를 더 짧게 연습하세요."


def test_evaluate_message_coverage_fills_slide_fallbacks_from_message_coverage() -> None:
    result = evaluate_message_coverage(
        slide_contexts=[
            SlideContext(
                slide_id="slide-1",
                message_units=[
                    MessageUnit(
                        message_id="msg-1",
                        importance="required",
                        intent="임계구역을 보호하지 않으면 같은 데이터를 동시에 바꿔 예측 불가능성이 생긴다",
                    )
                ],
            )
        ],
        actual_messages=[
            ActualSlideMessage(
                slide_id="slide-1",
                actual_spoken_summary="동시 실행 문제와 충돌 가능성만 설명했다.",
            )
        ],
        client=FakeCoverageClient(
            {
                "messageCoverage": [
                    {
                        "slideId": "slide-1",
                        "messageId": "msg-1",
                        "status": "partial",
                        "confidence": 0.82,
                        "evidenceSummary": (
                            "동시 실행 문제와 충돌 가능성은 언급했지만, 왜 예측 불가능성이 생기는지와 "
                            "임계구역 보호 필요성은 직접 설명하지 않았다."
                        ),
                        "feedback": (
                            "임계구역을 보호하지 않으면 같은 데이터를 동시에 바꾸게 된다고 먼저 한 문장으로 말하세요."
                        ),
                    }
                ],
                "slideContextInsights": [
                    {
                        "slideId": "slide-1",
                        "deliveryStatus": "partial",
                        "actualSpokenSummary": "",
                        "deliveryIssues": [],
                        "recommendedFix": "",
                    }
                ],
                "contextSummary": {
                    "overallStatus": "mixed",
                    "headline": "핵심 설명이 일부 비어 있습니다.",
                    "strengths": ["문제 상황 자체는 소개했습니다."],
                    "risks": ["원인 설명이 빠져 메시지가 덜 선명합니다."],
                },
            }
        ),
        model="fake-model",
    )

    assert result is not None
    assert result.slide_context_insights[0].actual_spoken_summary == "동시 실행 문제와 충돌 가능성만 설명했다."
    assert result.slide_context_insights[0].delivery_issues == [
        "동시 실행 문제와 충돌 가능성은 언급했지만, 왜 예측 불가능성이 생기는지와 임계구역 보호 필요성은 직접 설명하지 않았다."
    ]
    assert result.slide_context_insights[0].recommended_fix == (
        "임계구역을 보호하지 않으면 같은 데이터를 동시에 바꾸게 된다고 먼저 한 문장으로 말하세요."
    )
    assert result.message_coverage[0].feedback == (
        "임계구역을 보호하지 않으면 같은 데이터를 동시에 바꾸게 된다고 먼저 한 문장으로 말하세요."
    )


def test_evaluate_message_coverage_fills_message_and_slide_defaults_when_feedback_is_missing() -> None:
    result = evaluate_message_coverage(
        slide_contexts=[
            SlideContext(
                slide_id="slide-2",
                message_units=[
                    MessageUnit(
                        message_id="msg-2",
                        importance="required",
                        intent="레이스 컨디션은 동시에 실행될 때 생기는 예측 불가능한 결과다",
                    )
                ],
            )
        ],
        actual_messages=[],
        client=FakeCoverageClient(
            {
                "messageCoverage": [
                    {
                        "slideId": "slide-2",
                        "messageId": "msg-2",
                        "status": "missed",
                        "confidence": 0.64,
                        "evidenceSummary": "",
                        "feedback": "",
                    }
                ],
                "slideContextInsights": [
                    {
                        "slideId": "slide-2",
                        "deliveryStatus": "weak",
                        "actualSpokenSummary": "",
                        "deliveryIssues": [],
                        "recommendedFix": "",
                    }
                ],
                "contextSummary": {
                    "overallStatus": "weak",
                    "headline": "핵심 메시지 전달이 약합니다.",
                    "strengths": [],
                    "risks": ["정의가 빠졌습니다."],
                },
            }
        ),
        model="fake-model",
    )

    assert result is not None
    assert result.message_coverage[0].evidence_summary == (
        "이 슬라이드에서는 실제 발화가 거의 없어 의도한 메시지인 '레이스 컨디션은 동시에 실행될 때 생기는 예측 불가능한 결과다'가 전달되지 않았다."
    )
    assert result.message_coverage[0].feedback == (
        "'레이스 컨디션은 동시에 실행될 때 생기는 예측 불가능한 결과다'를 먼저 한 문장으로 분명히 말한 뒤, 빠진 이유나 조건을 바로 이어서 설명하세요."
    )
    assert result.slide_context_insights[0].delivery_issues == [
        "이 슬라이드에서는 실제 발화가 거의 없어 의도한 메시지인 '레이스 컨디션은 동시에 실행될 때 생기는 예측 불가능한 결과다'가 전달되지 않았다."
    ]
    assert result.slide_context_insights[0].recommended_fix == (
        "'레이스 컨디션은 동시에 실행될 때 생기는 예측 불가능한 결과다'를 먼저 한 문장으로 분명히 말한 뒤, 빠진 이유나 조건을 바로 이어서 설명하세요."
    )


def test_build_script_revision_suggestions_uses_model_output() -> None:
    suggestions = build_script_revision_suggestions(
        slide_raw_inputs=[
            SlideRawInput(
                slide_id="slide-1",
                title="Race Condition이란?",
                speaker_notes="레이스 컨디션의 정의를 짧게 소개합니다.",
            )
        ],
        slide_contexts=[
            SlideContext(
                slide_id="slide-1",
                message_units=[
                    MessageUnit(
                        message_id="msg-1",
                        importance="required",
                        intent="레이스 컨디션은 동시 실행 순서에 따라 결과가 달라지는 예측 불가능한 상황이다",
                    )
                ],
            )
        ],
        actual_messages=[
            ActualSlideMessage(
                slide_id="slide-1",
                actual_spoken_summary="두 스레드가 같은 값을 동시에 바꿀 때 결과가 달라질 수 있다는 예시까지 분명히 설명했다.",
            )
        ],
        slide_context_insights=[
            SlideContextInsight(
                slide_id="slide-1",
                delivery_status="clear",
                actual_spoken_summary="두 스레드 예시까지 설명했다.",
            )
        ],
        client=FakeCoverageClient(
            {
                "suggestions": [
                    "슬라이드 'Race Condition이란?' speaker notes에도 두 스레드 예시와 예측 불가능성 설명을 반영해 대본을 업데이트하세요."
                ]
            }
        ),
        model="fake-model",
    )

    assert suggestions == [
        "슬라이드 'Race Condition이란?' speaker notes에도 두 스레드 예시와 예측 불가능성 설명을 반영해 대본을 업데이트하세요."
    ]


def test_detect_pronunciation_cautions_flags_nearby_term_confusion() -> None:
    cautions = detect_pronunciation_cautions(
        slide_contexts=[
            SlideContext(
                slide_id="slide-3",
                message_units=[
                    MessageUnit(
                        message_id="msg-3",
                        importance="required",
                        intent="경쟁에서 배운 동시성 도구를 소개한다",
                    )
                ],
            )
        ],
        slide_raw_inputs=[
            SlideRawInput(
                slide_id="slide-3",
                title="경쟁에서 배운 동시성 도구",
                speaker_notes="세마포어와 조건 변수를 소개합니다.",
            )
        ],
        slide_timeline=[SlideTimelineEntry(slide_id="slide-3", entered_second=0)],
        deck_keywords=[DeckKeyword(text="동시성", slide_id="slide-3")],
        segments=[
            TranscriptSegment(
                text="저희는 동치성 도구인 세마포어를 직접 구현했습니다",
                startSeconds=0,
                endSeconds=4,
            )
        ],
        duration_seconds=4,
    )

    assert cautions == {
        "slide-3": [
            "'동치성'으로 들려 '동시성'과 혼동될 수 있습니다. '동시성' 발음을 더 또렷하게 구분해 주세요."
        ]
    }


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
