from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from app.audio.analysis.models import RehearsalSilenceAnalysis
from app.audio.transcribe import TranscriptSegment

FILLER_WORDS = {
    "아",
    "음",
    "어",
    "이제",
    "일단",
    "사실",
    "막",
    "그니까",
    "그니까요",
    "그러니까",
    "그러니까요",
    "저기",
    "약간",
    "뭐",
    "뭐냐면",
    "뭐랄까",
    "um",
    "uh",
    "erm",
    "like",
}

FILLER_PHRASES = {
    ("뭐", "랄까"): "뭐랄까",
    ("you", "know"): "you know",
    ("i", "mean"): "i mean",
    ("kind", "of"): "kind of",
    ("sort", "of"): "sort of",
}

PROGRESS_COMMENT_INSTRUCTIONS = """
You are a Korean presentation rehearsal coach for ORBIT.
You are given a list of rehearsal sessions for the same presentation, ordered by date.
Analyze the trend in total presentation duration and identify whether the presenter is improving, declining, or staying consistent.
Return only a single concise Korean sentence (2-3 lines max) that summarizes the overall progress trend and gives one actionable suggestion.
Do not use bullet points. Write in a warm, encouraging tone.
""".strip()

COACHING_INSTRUCTIONS = """
You are a Korean presentation rehearsal coach for ORBIT.
Return only JSON with:
- summary: one concise Korean sentence
- aiSummary: object with headline and paragraphs
- aiSummary.headline: one Korean sentence that summarizes the main report finding
- aiSummary.paragraphs: array of 2-3 Korean sentences with evidence-backed overall feedback
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
                "aiSummary": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "headline": {"type": "string"},
                        "paragraphs": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 2,
                            "maxItems": 3,
                        },
                    },
                    "required": ["headline", "paragraphs"],
                },
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
                "aiSummary",
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
    required: bool = False


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
class SlideTimelineEntry:
    slide_id: str
    entered_second: float


@dataclass(frozen=True)
class MissedKeywordDetail:
    slide_id: str
    keyword_id: str
    text: str


@dataclass(frozen=True)
class SlideInsight:
    slide_id: str
    filler_word_count: int
    long_silence_count: int | None


@dataclass(frozen=True)
class KeywordAnalysis:
    coverage: float
    missed: list[MissedKeywordDetail] = field(default_factory=list)


@dataclass(frozen=True)
class RehearsalMetricsResult:
    words_per_minute: float
    filler_word_count: int
    long_silence_count: int | None
    keyword_coverage: float
    speed_samples: list[SpeedSample] = field(default_factory=list)
    filler_word_details: list[FillerWordDetail] = field(default_factory=list)
    missed_keywords: list[MissedKeywordDetail] = field(default_factory=list)
    slide_insights: list[SlideInsight] = field(default_factory=list)


@dataclass(frozen=True)
class RehearsalCoachingResult:
    status: str
    summary: str = ""
    ai_summary_headline: str = ""
    ai_summary_paragraphs: list[str] = field(default_factory=list)
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
    slide_timeline: list[SlideTimelineEntry] | None = None,
    silence_analysis: RehearsalSilenceAnalysis | None = None,
) -> RehearsalMetricsResult:
    # TODO: 현재 산식은 MVP 휴리스틱이므로, 문서화된 리허설 평가 기준에 맞춰 재검토한다.
    words = transcript_words(transcript)
    speaking_duration_seconds = resolve_speaking_duration_seconds(
        duration_seconds,
        segments,
    )
    keyword_result = analyze_keywords(transcript, deck_keywords)
    long_silence_count = (
        silence_analysis.long_silence_count
        if silence_analysis is not None
        and silence_analysis.measurement_state == "measured"
        else None
    )
    return RehearsalMetricsResult(
        words_per_minute=calculate_words_per_minute(
            len(words),
            speaking_duration_seconds,
        ),
        filler_word_count=count_filler_words(words),
        long_silence_count=long_silence_count,
        keyword_coverage=keyword_result.coverage,
        speed_samples=build_speed_samples(segments),
        filler_word_details=count_filler_word_details(words),
        missed_keywords=keyword_result.missed,
        slide_insights=build_slide_insights(
            duration_seconds,
            segments,
            slide_timeline or [],
            silence_analysis,
        ),
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
                f"- longSilenceCount: {metrics.long_silence_count}\n"
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

    ai_summary = payload.get("aiSummary")
    if not isinstance(ai_summary, dict):
        ai_summary = {}

    return RehearsalCoachingResult(
        status="succeeded",
        summary=str(payload.get("summary", "")).strip(),
        ai_summary_headline=str(ai_summary.get("headline", "")).strip(),
        ai_summary_paragraphs=string_list(ai_summary.get("paragraphs"))[:3],
        strengths=string_list(payload.get("strengths")),
        improvements=string_list(payload.get("improvements")),
        next_practice_focus=str(payload.get("nextPracticeFocus", "")).strip(),
    )


@dataclass(frozen=True)
class RunSeriesEntry:
    run_id: str
    created_at: str
    duration_seconds: float


def generate_progress_comment(
    *,
    run_series: list[RunSeriesEntry],
    client: Any | None = None,
    model: str,
    api_key: str | None,
) -> str | None:
    if len(run_series) < 2:
        return None

    api_client: Any = client
    if api_client is None:
        if not api_key:
            return None
        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    lines = "\n".join(
        f"- 회차 {i + 1} ({entry.created_at[:10]}): {entry.duration_seconds:.0f}초"
        for i, entry in enumerate(run_series)
    )
    input_text = f"리허설 회차별 총 발표 시간:\n{lines}"

    try:
        response = api_client.responses.create(
            model=model,
            instructions=PROGRESS_COMMENT_INSTRUCTIONS,
            input=input_text,
        )
    except Exception:
        return None

    output_text = str(getattr(response, "output_text", "")).strip()
    return output_text or None


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
    return len(find_filler_words(words))


def count_filler_word_details(words: list[str]) -> list[FillerWordDetail]:
    counts: dict[str, int] = {}
    for word in find_filler_words(words):
        counts[word] = counts.get(word, 0) + 1

    return [
        FillerWordDetail(word=word, count=count)
        for word, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def find_filler_words(words: list[str]) -> list[str]:
    fillers: list[str] = []
    index = 0
    while index < len(words):
        phrase = canonical_filler_phrase(words, index)
        if phrase is not None:
            canonical, length = phrase
            fillers.append(canonical)
            index += length
            continue

        canonical_word = canonical_filler_word(words[index])
        if canonical_word is not None:
            fillers.append(canonical_word)

        index += 1

    return fillers


def canonical_filler_phrase(words: list[str], index: int) -> tuple[str, int] | None:
    for phrase_words, canonical in FILLER_PHRASES.items():
        end_index = index + len(phrase_words)
        if tuple(words[index:end_index]) == phrase_words:
            return canonical, len(phrase_words)

    return None


def canonical_filler_word(word: str) -> str | None:
    if word in FILLER_WORDS:
        return word

    if re.fullmatch(r"(?:으+)?음+", word):
        return "음"

    if re.fullmatch(r"어+", word):
        return "어"

    if re.fullmatch(r"umm+", word):
        return "um"

    if re.fullmatch(r"uhh+", word):
        return "uh"

    return None


def valid_timed_segments(
    segments: list[TranscriptSegment],
) -> list[tuple[float, float]]:
    timed_segments: list[tuple[float, float]] = []
    for segment in segments:
        if segment.start_seconds is None or segment.end_seconds is None:
            continue
        if segment.end_seconds <= segment.start_seconds:
            continue
        timed_segments.append((segment.start_seconds, segment.end_seconds))

    return sorted(timed_segments, key=lambda segment: (segment[0], segment[1]))


def resolve_analysis_end_second(
    duration_seconds: float,
    segments: list[TranscriptSegment],
) -> float:
    if duration_seconds > 0:
        return duration_seconds

    timed_segments = valid_timed_segments(segments)
    if not timed_segments:
        return 0.0

    return max(end for _start, end in timed_segments)


def build_slide_insights(
    duration_seconds: float,
    segments: list[TranscriptSegment],
    slide_timeline: list[SlideTimelineEntry],
    silence_analysis: RehearsalSilenceAnalysis | None = None,
) -> list[SlideInsight]:
    timeline = normalize_slide_timeline(slide_timeline)
    if not timeline:
        return []

    analysis_end_second = resolve_analysis_end_second(duration_seconds, segments)
    if analysis_end_second <= 0:
        return []

    long_silence_segments = (
        [segment for segment in silence_analysis.segments if segment.category == "long"]
        if silence_analysis is not None
        and silence_analysis.measurement_state == "measured"
        else None
    )
    insights: list[SlideInsight] = []

    for index, entry in enumerate(timeline):
        next_entry = timeline[index + 1] if index + 1 < len(timeline) else None
        window_end = (
            next_entry.entered_second if next_entry is not None else analysis_end_second
        )
        if window_end <= entry.entered_second:
            continue

        slide_words: list[str] = []
        for segment in segments:
            if segment_belongs_to_window(segment, entry.entered_second, window_end):
                slide_words.extend(transcript_words(segment.text))

        long_silence_count = (
            sum(
                1
                for silence in long_silence_segments
                if interval_midpoint_in_window(
                    silence.start_seconds,
                    silence.end_seconds,
                    entry.entered_second,
                    window_end,
                )
            )
            if long_silence_segments is not None
            else None
        )

        insights.append(
            SlideInsight(
                slide_id=entry.slide_id,
                filler_word_count=count_filler_words(slide_words),
                long_silence_count=long_silence_count,
            )
        )

    return insights


def normalize_slide_timeline(
    slide_timeline: list[SlideTimelineEntry],
) -> list[SlideTimelineEntry]:
    normalized: list[SlideTimelineEntry] = []

    for entry in slide_timeline:
        if not entry.slide_id.strip() or entry.entered_second < 0:
            continue

        if normalized and entry.entered_second <= normalized[-1].entered_second:
            continue

        if normalized and normalized[-1].slide_id == entry.slide_id:
            continue

        normalized.append(entry)

    return normalized


def segment_belongs_to_window(
    segment: TranscriptSegment,
    window_start: float,
    window_end: float,
) -> bool:
    if segment.start_seconds is None or segment.end_seconds is None:
        return False

    if segment.end_seconds <= segment.start_seconds:
        return False

    midpoint = (segment.start_seconds + segment.end_seconds) / 2
    return window_start <= midpoint < window_end


def interval_midpoint_in_window(
    start_second: float,
    end_second: float,
    window_start: float,
    window_end: float,
) -> bool:
    if end_second <= start_second:
        return False

    midpoint = (start_second + end_second) / 2
    return window_start <= midpoint < window_end


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

    return KeywordAnalysis(
        coverage=round(matched / len(deck_keywords), 4), missed=missed
    )


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
