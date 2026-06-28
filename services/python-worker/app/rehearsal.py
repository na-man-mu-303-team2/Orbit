from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.audio.transcribe import TranscriptSegment

FILLER_WORDS = {
    "음",
    "어",
    "그",
    "저기",
    "약간",
    "뭐",
    "um",
    "uh",
    "like",
}

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
    synonyms: list[str] = field(default_factory=list)
    abbreviations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RehearsalMetricsResult:
    words_per_minute: float
    filler_word_count: int
    pause_count: int
    keyword_coverage: float


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
    minutes = max(duration_seconds / 60, 1 / 60)
    return RehearsalMetricsResult(
        words_per_minute=round(len(words) / minutes, 2),
        filler_word_count=count_filler_words(words),
        pause_count=count_pauses(segments),
        keyword_coverage=keyword_coverage(transcript, deck_keywords),
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


def count_filler_words(words: list[str]) -> int:
    return sum(1 for word in words if word in FILLER_WORDS)


def count_pauses(segments: list[TranscriptSegment]) -> int:
    # 현재는 STT 구간 사이의 공백이 1초 이상이면 pause로 간주한다.
    pauses = 0
    previous_end: float | None = None

    for segment in segments:
        if (
            previous_end is not None
            and segment.start_seconds is not None
            and segment.start_seconds - previous_end >= 1.0
        ):
            pauses += 1

        if segment.end_seconds is not None:
            previous_end = segment.end_seconds

    return pauses


def keyword_coverage(transcript: str, deck_keywords: list[DeckKeyword]) -> float:
    # 현재 키워드 커버리지는 유의어/약어 후보의 단순 부분 문자열 매칭으로 계산한다.
    if not deck_keywords:
        return 0.0

    normalized_transcript = transcript.lower()
    matched = 0
    for keyword in deck_keywords:
        candidates = [
            candidate.strip().lower()
            for candidate in [keyword.text, *keyword.synonyms, *keyword.abbreviations]
            if candidate.strip()
        ]
        if any(candidate in normalized_transcript for candidate in candidates):
            matched += 1

    return round(matched / len(deck_keywords), 4)


def string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]
