from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.audio.transcribe import TranscriptSegment

FILLER_WORDS = {
    "음",
    "어",
    "그니까",
    "그러니까",
    "저기",
    "약간",
    "뭐",
    "um",
    "uh",
    "like",
}

LONG_PAUSE_THRESHOLD_SECONDS = 1.0

COACHING_INSTRUCTIONS = """
You are a Korean presentation rehearsal coach for ORBIT.
Return only JSON with:
- summary: one concise Korean sentence
- strengths: array of 1-3 Korean strings
- improvements: array of 1-3 Korean strings
- nextPracticeFocus: one concise Korean string

Use only the transcript and metrics. Do not invent unsupported details.
""".strip()

COACHING_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "rehearsal_coaching",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string"},
                "strengths": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "improvements": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "nextPracticeFocus": {"type": "string"},
            },
            "required": [
                "summary",
                "strengths",
                "improvements",
                "nextPracticeFocus",
            ],
        },
    }
}


@dataclass(frozen=True)
class DeckKeyword:
    text: str
    keyword_id: str = ""
    slide_id: str = ""
    synonyms: list[str] = field(default_factory=list)
    abbreviations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SpeedSample:
    start_second: float
    end_second: float
    words_per_minute: float


@dataclass(frozen=True)
class FillerWordDetail:
    word: str
    count: int


@dataclass(frozen=True)
class PauseDetail:
    start_second: float
    end_second: float
    duration_seconds: float


@dataclass(frozen=True)
class MissedKeywordDetail:
    slide_id: str
    keyword_id: str
    text: str


@dataclass(frozen=True)
class KeywordAnalysis:
    coverage: float
    missed: list[MissedKeywordDetail] = field(default_factory=list)


@dataclass(frozen=True)
class RehearsalMetricsResult:
    words_per_minute: float
    filler_word_count: int
    pause_count: int
    keyword_coverage: float
    speed_samples: list[SpeedSample] = field(default_factory=list)
    filler_word_details: list[FillerWordDetail] = field(default_factory=list)
    pause_details: list[PauseDetail] = field(default_factory=list)
    missed_keywords: list[MissedKeywordDetail] = field(default_factory=list)


@dataclass(frozen=True)
class RehearsalCoachingResult:
    status: str
    summary: str = ""
    strengths: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    next_practice_focus: str = ""
    message: str = ""


def analyze_rehearsal_metrics(
    *,
    transcript: str,
    duration_seconds: float,
    segments: list[TranscriptSegment],
    deck_keywords: list[DeckKeyword],
) -> RehearsalMetricsResult:
    # TODO: 현재 산식은 MVP 휴리스틱이므로, 문서화된 리허설 평가 기준에 맞춰 재검토한다.
    words = transcript_words(transcript)
    speaking_duration_seconds = resolve_speaking_duration_seconds(
        duration_seconds,
        segments,
    )
    keyword_result = analyze_keywords(transcript, deck_keywords)
    pause_details = find_pause_details(segments)
    return RehearsalMetricsResult(
        words_per_minute=calculate_words_per_minute(
            len(words),
            speaking_duration_seconds,
        ),
        filler_word_count=count_filler_words(words),
        pause_count=len(pause_details),
        keyword_coverage=keyword_result.coverage,
        speed_samples=build_speed_samples(segments),
        filler_word_details=count_filler_word_details(words),
        pause_details=pause_details,
        missed_keywords=keyword_result.missed,
    )


def generate_rehearsal_coaching(
    *,
    transcript: str,
    metrics: RehearsalMetricsResult,
    client: Any | None = None,
    model: str,
    api_key: str | None,
) -> RehearsalCoachingResult:
    text = transcript.strip()
    if not text:
        return RehearsalCoachingResult(
            status="skipped",
            message="No transcript to coach.",
        )

    api_client: Any = client
    if api_client is None:
        if not api_key:
            return RehearsalCoachingResult(
                status="unavailable",
                message="OPENAI_API_KEY is not configured.",
            )

        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    try:
        response = api_client.responses.create(
            model=model,
            instructions=COACHING_INSTRUCTIONS,
            input=(
                "Transcript:\n"
                f"{text}\n\n"
                "Metrics:\n"
                f"- wordsPerMinute: {metrics.words_per_minute}\n"
                f"- fillerWordCount: {metrics.filler_word_count}\n"
                f"- pauseCount: {metrics.pause_count}\n"
                f"- keywordCoverage: {metrics.keyword_coverage}\n"
            ),
            text=COACHING_RESPONSE_FORMAT,
        )
    except Exception as error:
        return RehearsalCoachingResult(status="failed", message=str(error))

    output_text = str(getattr(response, "output_text", "")).strip()
    if not output_text:
        return RehearsalCoachingResult(
            status="failed",
            message="OpenAI returned empty coaching.",
        )

    try:
        payload = json.loads(output_text)
    except json.JSONDecodeError as error:
        return RehearsalCoachingResult(
            status="failed",
            message=f"OpenAI returned invalid coaching JSON: {error}",
        )

    if not isinstance(payload, dict):
        return RehearsalCoachingResult(
            status="failed",
            message="OpenAI coaching response was not an object.",
        )

    return RehearsalCoachingResult(
        status="succeeded",
        summary=str(payload.get("summary", "")).strip(),
        strengths=string_list(payload.get("strengths")),
        improvements=string_list(payload.get("improvements")),
        next_practice_focus=str(payload.get("nextPracticeFocus", "")).strip(),
    )


def transcript_words(transcript: str) -> list[str]:
    return re.findall(r"[\w가-힣']+", transcript.lower())


def resolve_speaking_duration_seconds(
    duration_seconds: float,
    segments: list[TranscriptSegment],
) -> float:
    if duration_seconds > 0:
        return duration_seconds

    timed_segments = valid_timed_segments(segments)

    if not timed_segments:
        return 0

    start_seconds = min(start for start, _end in timed_segments)
    end_seconds = max(end for _start, end in timed_segments)
    return max(0, end_seconds - start_seconds)


def calculate_words_per_minute(word_count: int, duration_seconds: float) -> float:
    if word_count <= 0 or duration_seconds <= 0:
        return 0.0

    return round(word_count / (duration_seconds / 60), 2)


def count_filler_words(words: list[str]) -> int:
    return sum(1 for word in words if word in FILLER_WORDS)


def count_filler_word_details(words: list[str]) -> list[FillerWordDetail]:
    counts: dict[str, int] = {}
    for word in words:
        if word in FILLER_WORDS:
            counts[word] = counts.get(word, 0) + 1

    return [
        FillerWordDetail(word=word, count=count)
        for word, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def count_pauses(segments: list[TranscriptSegment]) -> int:
    return len(find_pause_details(segments))


def find_pause_details(segments: list[TranscriptSegment]) -> list[PauseDetail]:
    pauses: list[PauseDetail] = []
    previous_end: float | None = None

    for start_seconds, end_seconds in valid_timed_segments(segments):
        if (
            previous_end is not None
            and start_seconds - previous_end >= LONG_PAUSE_THRESHOLD_SECONDS
        ):
            pauses.append(
                PauseDetail(
                    start_second=round(previous_end, 2),
                    end_second=round(start_seconds, 2),
                    duration_seconds=round(start_seconds - previous_end, 2),
                )
            )

        previous_end = end_seconds if previous_end is None else max(previous_end, end_seconds)

    return pauses


def valid_timed_segments(segments: list[TranscriptSegment]) -> list[tuple[float, float]]:
    timed_segments: list[tuple[float, float]] = []
    for segment in segments:
        if segment.start_seconds is None or segment.end_seconds is None:
            continue
        if segment.end_seconds <= segment.start_seconds:
            continue
        timed_segments.append((segment.start_seconds, segment.end_seconds))

    return sorted(timed_segments, key=lambda segment: (segment[0], segment[1]))


def keyword_coverage(transcript: str, deck_keywords: list[DeckKeyword]) -> float:
    return analyze_keywords(transcript, deck_keywords).coverage


def analyze_keywords(
    transcript: str,
    deck_keywords: list[DeckKeyword],
) -> KeywordAnalysis:
    # 현재 키워드 커버리지는 유의어/약어 후보의 단순 부분 문자열 매칭으로 계산한다.
    if not deck_keywords:
        return KeywordAnalysis(coverage=0.0)

    normalized_transcript = transcript.lower()
    matched = 0
    missed: list[MissedKeywordDetail] = []
    for keyword in deck_keywords:
        candidates = [
            candidate.strip().lower()
            for candidate in [keyword.text, *keyword.synonyms, *keyword.abbreviations]
            if candidate.strip()
        ]
        if any(candidate in normalized_transcript for candidate in candidates):
            matched += 1
        elif keyword.slide_id and keyword.keyword_id and keyword.text.strip():
            missed.append(
                MissedKeywordDetail(
                    slide_id=keyword.slide_id,
                    keyword_id=keyword.keyword_id,
                    text=keyword.text.strip(),
                )
            )

    return KeywordAnalysis(coverage=round(matched / len(deck_keywords), 4), missed=missed)


def build_speed_samples(segments: list[TranscriptSegment]) -> list[SpeedSample]:
    samples: list[SpeedSample] = []
    for segment in segments:
        if segment.start_seconds is None or segment.end_seconds is None:
            continue

        duration_seconds = segment.end_seconds - segment.start_seconds
        if duration_seconds <= 0:
            continue

        word_count = len(transcript_words(segment.text))
        if word_count == 0:
            continue

        samples.append(
            SpeedSample(
                start_second=round(segment.start_seconds, 2),
                end_second=round(segment.end_seconds, 2),
                words_per_minute=round(word_count / (duration_seconds / 60), 2),
            )
        )

    return samples


def string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]
