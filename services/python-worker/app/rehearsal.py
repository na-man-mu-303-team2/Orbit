from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

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

LONG_PAUSE_THRESHOLD_SECONDS = 1.0

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
If script revision hints are provided, reflect them in the feedback when the actual delivery is stronger than the current script.
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

SCRIPT_REVISION_INSTRUCTIONS = """
You are reviewing whether a Korean presenter's actual rehearsal delivery should update the existing speaker notes.
You will receive slide title, speaker notes, intended messages, and what was actually spoken.
Return only 0-3 Korean suggestions when the actual delivery is clearly better, clearer, or more concrete than the current speaker notes.

Rules:
- Each suggestion must tell the presenter exactly what to update in the script.
- Mention the slide title or slide number context inside the sentence.
- Do not repeat generic speaking advice. Focus only on script revision opportunities.
- If the script is already aligned, return an empty list.
Return only valid JSON.
""".strip()

SCRIPT_REVISION_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "script_revision_suggestions",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "suggestions": {
                    "type": "array",
                    "items": {"type": "string"},
                }
            },
            "required": ["suggestions"],
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
class SlideTimelineEntry:
    slide_id: str
    entered_second: float


@dataclass(frozen=True)
class MissedKeywordDetail:
    slide_id: str
    keyword_id: str
    text: str


@dataclass(frozen=True)
class SlideRawInput:
    slide_id: str
    title: str = ""
    speaker_notes: str = ""


@dataclass(frozen=True)
class MessageUnit:
    message_id: str
    importance: str  # "required" | "recommended" | "optional"
    intent: str
    acceptable_meanings: list[str] = field(default_factory=list)
    misleading_cases: list[str] = field(default_factory=list)
    supporting_terms: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SlideContext:
    slide_id: str
    message_units: list[MessageUnit] = field(default_factory=list)


@dataclass(frozen=True)
class ActualSlideMessage:
    slide_id: str
    actual_spoken_summary: str
    start_second: float = 0.0
    end_second: float = 0.0


@dataclass(frozen=True)
class MessageCoverageItem:
    slide_id: str
    message_id: str
    status: str  # "delivered" | "partial" | "missed" | "unclear" | "misleading"
    confidence: float
    evidence_summary: str = ""
    feedback: str = ""


@dataclass(frozen=True)
class SlideContextInsight:
    slide_id: str
    delivery_status: str  # "clear" | "partial" | "weak"
    actual_spoken_summary: str = ""
    delivery_issues: list[str] = field(default_factory=list)
    recommended_fix: str = ""
    pronunciation_cautions: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ContextSummary:
    overall_status: str  # "clear" | "mixed" | "weak"
    headline: str
    strengths: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ContextAnalysisResult:
    context_summary: ContextSummary
    message_coverage: list[MessageCoverageItem]
    slide_context_insights: list[SlideContextInsight]


@dataclass(frozen=True)
class SlideInsight:
    slide_id: str
    filler_word_count: int
    pause_count: int


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
    script_revision_suggestions: list[str] = field(default_factory=list)
    message: str = ""


def analyze_rehearsal_metrics(
    *,
    transcript: str,
    duration_seconds: float,
    segments: list[TranscriptSegment],
    deck_keywords: list[DeckKeyword],
    slide_timeline: list[SlideTimelineEntry] | None = None,
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
        slide_insights=build_slide_insights(
            duration_seconds,
            segments,
            slide_timeline or [],
        ),
    )


DERIVE_SLIDE_CONTEXTS_INSTRUCTIONS = """
You are a presentation coach analyzing a Korean presentation script.
Given a slide's title and speaker notes, extract the key messages the presenter intends to convey.
For each message unit, identify:
- A clear intent statement (what the presenter wants the audience to understand)
- How important it is (required/recommended/optional)
- Acceptable paraphrases that still deliver the same meaning
- Misleading phrasings that would confuse the audience
- Supporting terms whose presence suggests the message was delivered

Return only valid JSON. Be concise. Extract 1-3 message units per slide.
""".strip()

DERIVE_SLIDE_CONTEXTS_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "slide_contexts",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "messageUnits": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "messageId": {"type": "string"},
                            "importance": {"type": "string", "enum": ["required", "recommended", "optional"]},
                            "intent": {"type": "string"},
                            "acceptableMeanings": {"type": "array", "items": {"type": "string"}},
                            "misleadingCases": {"type": "array", "items": {"type": "string"}},
                            "supportingTerms": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["messageId", "importance", "intent", "acceptableMeanings", "misleadingCases", "supportingTerms"],
                    },
                }
            },
            "required": ["messageUnits"],
        },
    }
}

SUMMARIZE_SPEECH_INSTRUCTIONS = """
You are summarizing what a presenter actually said during a specific slide of a Korean presentation.
Given the transcript segments that occurred during the slide, write a concise summary (2-4 Korean sentences) of what was actually spoken.
Focus on the substance of what was communicated, not the speaking style.
Return only valid JSON.
""".strip()

SUMMARIZE_SPEECH_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "slide_speech_summary",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string"},
            },
            "required": ["summary"],
        },
    }
}

EVALUATE_COVERAGE_INSTRUCTIONS = """
You are evaluating whether a Korean presenter successfully delivered the intended messages for each slide.
For each message unit, compare the intended message (intent) against what was actually spoken (actualSpokenSummary).
Write all feedback in Korean and ground every judgment in the provided transcript summary only.

Requirements for messageCoverage:
- evidenceSummary must explicitly compare what the presenter actually said with the intended meaning that was missing, vague, or distorted.
- If status is partial, missed, unclear, or misleading, explain why in evidenceSummary.
- feedback must be a concrete coaching sentence the presenter can follow immediately.

Requirements for slideContextInsights:
- actualSpokenSummary must be a concrete 1-2 sentence summary of what was actually said on that slide.
- If deliveryStatus is partial or weak, deliveryIssues must include at least one concrete reason why the message was incomplete, weak, or unclear.
- recommendedFix must be a direct practice sentence or instruction the presenter can use immediately, not an abstract suggestion.

Do not leave fields empty unless the presenter truly said nothing. If there was no meaningful delivery, say so explicitly.
Return only valid JSON.
""".strip()

EVALUATE_COVERAGE_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "coverage_evaluation",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "messageCoverage": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "slideId": {"type": "string"},
                            "messageId": {"type": "string"},
                            "status": {"type": "string", "enum": ["delivered", "partial", "missed", "unclear", "misleading"]},
                            "confidence": {"type": "number"},
                            "evidenceSummary": {"type": "string"},
                            "feedback": {"type": "string"},
                        },
                        "required": ["slideId", "messageId", "status", "confidence", "evidenceSummary", "feedback"],
                    },
                },
                "slideContextInsights": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "slideId": {"type": "string"},
                            "deliveryStatus": {"type": "string", "enum": ["clear", "partial", "weak"]},
                            "actualSpokenSummary": {"type": "string"},
                            "deliveryIssues": {"type": "array", "items": {"type": "string"}},
                            "recommendedFix": {"type": "string"},
                        },
                        "required": ["slideId", "deliveryStatus", "actualSpokenSummary", "deliveryIssues", "recommendedFix"],
                    },
                },
                "contextSummary": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "overallStatus": {"type": "string", "enum": ["clear", "mixed", "weak"]},
                        "headline": {"type": "string"},
                        "strengths": {"type": "array", "items": {"type": "string"}},
                        "risks": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["overallStatus", "headline", "strengths", "risks"],
                },
            },
            "required": ["messageCoverage", "slideContextInsights", "contextSummary"],
        },
    }
}


def derive_slide_contexts(
    *,
    slide_raw_inputs: list[SlideRawInput],
    deck_keywords: list[DeckKeyword],
    client: Any,
    model: str,
) -> list[SlideContext] | None:
    keywords_by_slide: dict[str, list[str]] = {}
    for kw in deck_keywords:
        keywords_by_slide.setdefault(kw.slide_id, []).append(kw.text)

    results: list[SlideContext] = []
    for slide in slide_raw_inputs:
        if not slide.speaker_notes.strip():
            continue
        kw_hint = ", ".join(keywords_by_slide.get(slide.slide_id, []))
        input_text = (
            f"Slide title: {slide.title or '(없음)'}\n"
            f"Keywords: {kw_hint or '(없음)'}\n"
            f"Speaker notes:\n{slide.speaker_notes}"
        )
        try:
            response = client.responses.create(
                model=model,
                instructions=DERIVE_SLIDE_CONTEXTS_INSTRUCTIONS,
                input=input_text,
                text=DERIVE_SLIDE_CONTEXTS_RESPONSE_FORMAT,
            )
            output_text = str(getattr(response, "output_text", "")).strip()
            if not output_text:
                continue
            data = json.loads(output_text)
            units = [
                MessageUnit(
                    message_id=u.get("messageId", f"{slide.slide_id}_{i}"),
                    importance=u.get("importance", "recommended"),
                    intent=u.get("intent", ""),
                    acceptable_meanings=u.get("acceptableMeanings", []),
                    misleading_cases=u.get("misleadingCases", []),
                    supporting_terms=u.get("supportingTerms", []),
                )
                for i, u in enumerate(data.get("messageUnits", []))
                if u.get("intent")
            ]
            if units:
                results.append(SlideContext(slide_id=slide.slide_id, message_units=units))
        except Exception:
            continue

    return results if results else None


ENRICH_INTENTS_INSTRUCTIONS = """
You are a presentation coach enriching evaluation criteria for a Korean presentation slide.
Given a slide's key messages (intents) provided by the user, generate:
- Acceptable paraphrases that still convey the same meaning
- Misleading phrasings to watch out for
- Supporting terms whose presence suggests the message was delivered

Return only valid JSON. Be practical and concise.
""".strip()

ENRICH_INTENTS_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "enriched_message_units",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "messageUnits": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "messageId": {"type": "string"},
                            "acceptableMeanings": {"type": "array", "items": {"type": "string"}},
                            "misleadingCases": {"type": "array", "items": {"type": "string"}},
                            "supportingTerms": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["messageId", "acceptableMeanings", "misleadingCases", "supportingTerms"],
                    },
                }
            },
            "required": ["messageUnits"],
        },
    }
}


def enrich_intents_to_slide_contexts(
    *,
    saved_contexts: list[dict[str, Any]],
    client: Any,
    model: str,
) -> list[SlideContext]:
    """Convert simplified user intents to full SlideContext objects via AI enrichment."""
    results: list[SlideContext] = []
    for entry in saved_contexts:
        slide_id = entry.get("slideId", "")
        intents = entry.get("intents", [])
        if not slide_id or not intents:
            continue

        input_text = json.dumps(
            {"slideId": slide_id, "intents": intents},
            ensure_ascii=False,
        )
        try:
            response = client.responses.create(
                model=model,
                instructions=ENRICH_INTENTS_INSTRUCTIONS,
                input=input_text,
                text=ENRICH_INTENTS_RESPONSE_FORMAT,
            )
            output_text = str(getattr(response, "output_text", "")).strip()
            enriched_by_id: dict[str, Any] = {}
            if output_text:
                data = json.loads(output_text)
                enriched_by_id = {u["messageId"]: u for u in data.get("messageUnits", [])}
        except Exception:
            enriched_by_id = {}

        units = [
            MessageUnit(
                message_id=intent.get("messageId", f"{slide_id}_{i}"),
                importance=intent.get("importance", "recommended"),
                intent=intent["intent"],
                acceptable_meanings=enriched_by_id.get(
                    intent.get("messageId", ""), {}
                ).get("acceptableMeanings", []),
                misleading_cases=enriched_by_id.get(
                    intent.get("messageId", ""), {}
                ).get("misleadingCases", []),
                supporting_terms=enriched_by_id.get(
                    intent.get("messageId", ""), {}
                ).get("supportingTerms", []),
            )
            for i, intent in enumerate(intents)
            if intent.get("intent")
        ]
        if units:
            results.append(SlideContext(slide_id=slide_id, message_units=units))

    return results


def summarize_slide_speech(
    *,
    slide_contexts: list[SlideContext],
    segments: list[TranscriptSegment],
    slide_timeline: list[SlideTimelineEntry],
    client: Any,
    model: str,
) -> list[ActualSlideMessage]:
    if not slide_timeline:
        return []

    timeline_seconds = [
        (entry.slide_id, entry.entered_second) for entry in slide_timeline
    ]

    results: list[ActualSlideMessage] = []
    context_slide_ids = {ctx.slide_id for ctx in slide_contexts}

    for i, (slide_id, start_sec) in enumerate(timeline_seconds):
        if slide_id not in context_slide_ids:
            continue
        end_sec = timeline_seconds[i + 1][1] if i + 1 < len(timeline_seconds) else float("inf")

        slide_words = " ".join(
            seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
            for seg in segments
            if _segment_in_range(seg, start_sec, end_sec)
        ).strip()

        if not slide_words:
            results.append(ActualSlideMessage(
                slide_id=slide_id,
                actual_spoken_summary="(발화 내용 없음)",
                start_second=start_sec,
                end_second=end_sec if end_sec != float("inf") else start_sec,
            ))
            continue

        try:
            response = client.responses.create(
                model=model,
                instructions=SUMMARIZE_SPEECH_INSTRUCTIONS,
                input=f"Slide transcript:\n{slide_words}",
                text=SUMMARIZE_SPEECH_RESPONSE_FORMAT,
            )
            output_text = str(getattr(response, "output_text", "")).strip()
            summary = json.loads(output_text).get("summary", slide_words[:200]) if output_text else slide_words[:200]
        except Exception:
            summary = slide_words[:200]

        results.append(ActualSlideMessage(
            slide_id=slide_id,
            actual_spoken_summary=summary,
            start_second=start_sec,
            end_second=end_sec if end_sec != float("inf") else start_sec,
        ))

    return results


def evaluate_message_coverage(
    *,
    slide_contexts: list[SlideContext],
    actual_messages: list[ActualSlideMessage],
    client: Any,
    model: str,
) -> ContextAnalysisResult | None:
    actual_by_slide = {msg.slide_id: msg for msg in actual_messages}
    slides_input = []
    for ctx in slide_contexts:
        actual = actual_by_slide.get(ctx.slide_id)
        slides_input.append({
            "slideId": ctx.slide_id,
            "actualSpokenSummary": actual.actual_spoken_summary if actual else "(발화 없음)",
            "messageUnits": [
                {
                    "messageId": u.message_id,
                    "importance": u.importance,
                    "intent": u.intent,
                    "acceptableMeanings": u.acceptable_meanings,
                    "misleadingCases": u.misleading_cases,
                }
                for u in ctx.message_units
            ],
        })

    if not slides_input:
        return None

    try:
        response = client.responses.create(
            model=model,
            instructions=EVALUATE_COVERAGE_INSTRUCTIONS,
            input=json.dumps(slides_input, ensure_ascii=False),
            text=EVALUATE_COVERAGE_RESPONSE_FORMAT,
        )
        output_text = str(getattr(response, "output_text", "")).strip()
        if not output_text:
            return None
        data = json.loads(output_text)
    except Exception:
        return None

    slide_contexts_by_id = {ctx.slide_id: ctx for ctx in slide_contexts}
    message_units_by_key = {
        (ctx.slide_id, unit.message_id): unit
        for ctx in slide_contexts
        for unit in ctx.message_units
    }

    def normalize_text(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return re.sub(r"\s+", " ", value).strip()

    def normalize_string_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []

        normalized: list[str] = []
        for item in value:
            text = normalize_text(item)
            if text and text not in normalized:
                normalized.append(text)
        return normalized

    def build_default_fix(slide_id: str) -> str:
        context = slide_contexts_by_id.get(slide_id)
        if context and context.message_units:
            target = next(
                (
                    unit.intent
                    for unit in context.message_units
                    if unit.importance in {"required", "recommended"}
                ),
                context.message_units[0].intent,
            )
            return (
                f"먼저 '{target}'를 한 문장으로 분명히 말한 뒤, 왜 중요한지 또는 빠진 조건을 바로 이어서 설명하세요."
            )
        return "핵심 메시지를 한 문장으로 먼저 분명히 말한 뒤, 빠진 이유나 조건을 바로 이어서 설명하세요."

    def build_default_message_evidence(slide_id: str, message_id: str) -> str:
        message_unit = message_units_by_key.get((slide_id, message_id))
        if message_unit is None:
            context = slide_contexts_by_id.get(slide_id)
            if context and context.message_units:
                message_unit = next(
                    (
                        unit
                        for unit in context.message_units
                        if unit.importance in {"required", "recommended"}
                    ),
                    context.message_units[0],
                )
        intent = normalize_text(message_unit.intent) if message_unit else "핵심 메시지"
        actual_message = actual_by_slide.get(slide_id)
        actual_summary = normalize_text(
            actual_message.actual_spoken_summary if actual_message else ""
        )
        if actual_summary:
            return (
                f"실제 발화에서는 '{actual_summary}' 수준까지만 언급됐고, 의도한 메시지인 "
                f"'{intent}'는 분명하게 드러나지 않았다."
            )
        return (
            f"이 슬라이드에서는 실제 발화가 거의 없어 의도한 메시지인 '{intent}'가 "
            "전달되지 않았다."
        )

    def build_default_message_feedback(slide_id: str, message_id: str) -> str:
        message_unit = message_units_by_key.get((slide_id, message_id))
        if message_unit is None:
            context = slide_contexts_by_id.get(slide_id)
            if context and context.message_units:
                message_unit = next(
                    (
                        unit
                        for unit in context.message_units
                        if unit.importance in {"required", "recommended"}
                    ),
                    context.message_units[0],
                )
        intent = normalize_text(message_unit.intent) if message_unit else "핵심 메시지"
        return (
            f"'{intent}'를 먼저 한 문장으로 분명히 말한 뒤, 빠진 이유나 조건을 바로 이어서 설명하세요."
        )

    def summarize_delivery_issue(evidence_summary: str) -> str:
        summary = normalize_text(evidence_summary)
        if not summary:
            return ""
        if len(summary) <= 120:
            return summary
        return f"{summary[:117].rstrip()}..."

    message_coverage = []
    for item in data.get("messageCoverage", []):
        slide_id = item["slideId"]
        message_id = item["messageId"]
        status = item["status"]
        evidence_summary = normalize_text(item.get("evidenceSummary", ""))
        feedback = normalize_text(item.get("feedback", ""))

        if status != "delivered" and not evidence_summary:
            evidence_summary = build_default_message_evidence(slide_id, message_id)
        if status != "delivered" and not feedback:
            feedback = build_default_message_feedback(slide_id, message_id)

        message_coverage.append(
            MessageCoverageItem(
                slide_id=slide_id,
                message_id=message_id,
                status=status,
                confidence=float(item["confidence"]),
                evidence_summary=evidence_summary,
                feedback=feedback,
            )
        )

    message_coverage_by_slide: dict[str, list[MessageCoverageItem]] = {}
    for item in message_coverage:
        message_coverage_by_slide.setdefault(item.slide_id, []).append(item)

    slide_context_insights = []
    for item in data.get("slideContextInsights", []):
        slide_id = item["slideId"]
        delivery_status = item["deliveryStatus"]
        actual_spoken_summary = normalize_text(item.get("actualSpokenSummary", ""))
        if not actual_spoken_summary:
            actual_spoken_summary = normalize_text(
                actual_by_slide.get(slide_id).actual_spoken_summary
                if actual_by_slide.get(slide_id)
                else ""
            )

        delivery_issues = normalize_string_list(item.get("deliveryIssues", []))
        recommended_fix = normalize_text(item.get("recommendedFix", ""))

        slide_message_coverage = message_coverage_by_slide.get(slide_id, [])
        if not delivery_issues:
            delivery_issues = [
                issue
                for issue in (
                    summarize_delivery_issue(coverage.evidence_summary)
                    for coverage in slide_message_coverage
                )
                if issue
            ]
        if delivery_status != "clear" and not delivery_issues:
            delivery_issues = [build_default_message_evidence(slide_id, "")]

        if delivery_status != "clear" and not recommended_fix:
            recommended_fix = next(
                (
                    coverage.feedback
                    for coverage in slide_message_coverage
                    if coverage.feedback
                ),
                "",
            )
            if not recommended_fix:
                recommended_fix = build_default_fix(slide_id)

        slide_context_insights.append(
            SlideContextInsight(
                slide_id=slide_id,
                delivery_status=delivery_status,
                actual_spoken_summary=actual_spoken_summary,
                delivery_issues=delivery_issues,
                recommended_fix=recommended_fix,
                pronunciation_cautions=[],
            )
        )

    cs = data.get("contextSummary", {})
    context_summary = ContextSummary(
        overall_status=cs.get("overallStatus", "mixed"),
        headline=cs.get("headline", ""),
        strengths=cs.get("strengths", []),
        risks=cs.get("risks", []),
    )

    return ContextAnalysisResult(
        context_summary=context_summary,
        message_coverage=message_coverage,
        slide_context_insights=slide_context_insights,
    )


def build_slide_transcript_map(
    *,
    segments: list[TranscriptSegment],
    slide_timeline: list[SlideTimelineEntry],
    duration_seconds: float = 0.0,
) -> dict[str, str]:
    timeline = normalize_slide_timeline(slide_timeline)
    if not timeline:
        return {}

    analysis_end_second = resolve_analysis_end_second(duration_seconds, segments)
    if analysis_end_second <= 0:
        analysis_end_second = timeline[-1].entered_second

    slide_transcripts: dict[str, str] = {}
    for index, entry in enumerate(timeline):
        next_entry = timeline[index + 1] if index + 1 < len(timeline) else None
        window_end = (
            next_entry.entered_second
            if next_entry is not None
            else analysis_end_second
        )
        if window_end <= entry.entered_second:
            continue

        texts = [
            segment.text.strip()
            for segment in segments
            if segment_belongs_to_window(segment, entry.entered_second, window_end)
            and segment.text.strip()
        ]
        if texts:
            slide_transcripts[entry.slide_id] = " ".join(texts).strip()

    return slide_transcripts


def build_script_revision_suggestions(
    *,
    slide_raw_inputs: list[SlideRawInput],
    slide_contexts: list[SlideContext],
    actual_messages: list[ActualSlideMessage],
    slide_context_insights: list[SlideContextInsight],
    client: Any | None,
    model: str,
) -> list[str]:
    actual_by_slide = {message.slide_id: message for message in actual_messages}
    insight_by_slide = {
        insight.slide_id: insight for insight in slide_context_insights
    }
    context_by_slide = {context.slide_id: context for context in slide_contexts}

    candidates: list[dict[str, Any]] = []
    for slide in slide_raw_inputs:
        insight = insight_by_slide.get(slide.slide_id)
        actual = actual_by_slide.get(slide.slide_id)
        context = context_by_slide.get(slide.slide_id)
        if (
            insight is None
            or actual is None
            or not slide.speaker_notes.strip()
            or not actual.actual_spoken_summary.strip()
            or insight.delivery_status != "clear"
        ):
            continue

        candidates.append(
            {
                "slideId": slide.slide_id,
                "title": slide.title or slide.slide_id,
                "speakerNotes": slide.speaker_notes,
                "actualSpokenSummary": actual.actual_spoken_summary,
                "primaryIntents": [
                    unit.intent
                    for unit in (context.message_units if context else [])
                    if unit.intent.strip()
                ][:2],
            }
        )

    if not candidates:
        return []

    if client is not None:
        try:
            response = client.responses.create(
                model=model,
                instructions=SCRIPT_REVISION_INSTRUCTIONS,
                input=json.dumps({"slides": candidates}, ensure_ascii=False),
                text=SCRIPT_REVISION_RESPONSE_FORMAT,
            )
            output_text = str(getattr(response, "output_text", "")).strip()
            if output_text:
                data = json.loads(output_text)
                suggestions = string_list(data.get("suggestions"))[:3]
                if suggestions:
                    return suggestions
        except Exception:
            pass

    suggestions: list[str] = []
    for slide in candidates:
        overlap = text_overlap_ratio(
            slide["speakerNotes"],
            slide["actualSpokenSummary"],
        )
        if overlap >= 0.38:
            continue

        primary_intent = (
            slide["primaryIntents"][0]
            if slide["primaryIntents"]
            else slide["actualSpokenSummary"]
        )
        suggestions.append(
            f"슬라이드 '{slide['title']}'는 실제 발표에서 '{primary_intent}'가 더 명확했으니, 현재 speaker notes도 그 표현 순서와 예시를 반영해 다시 정리하세요."
        )
        if len(suggestions) >= 3:
            break

    return suggestions


def detect_pronunciation_cautions(
    *,
    slide_contexts: list[SlideContext],
    slide_raw_inputs: list[SlideRawInput],
    slide_timeline: list[SlideTimelineEntry],
    deck_keywords: list[DeckKeyword],
    segments: list[TranscriptSegment],
    duration_seconds: float = 0.0,
) -> dict[str, list[str]]:
    slide_transcripts = build_slide_transcript_map(
        segments=segments,
        slide_timeline=slide_timeline,
        duration_seconds=duration_seconds,
    )
    if not slide_transcripts:
        return {}

    keyword_terms_by_slide: dict[str, set[str]] = {}
    for keyword in deck_keywords:
        if not keyword.slide_id:
            continue
        terms = keyword_terms_by_slide.setdefault(keyword.slide_id, set())
        for term in [keyword.text, *keyword.synonyms, *keyword.abbreviations]:
            normalized = normalize_candidate_term(term)
            if normalized:
                terms.add(normalized)

    title_by_slide = {slide.slide_id: slide.title for slide in slide_raw_inputs}
    terms_by_slide: dict[str, set[str]] = {}
    for context in slide_contexts:
        terms = terms_by_slide.setdefault(context.slide_id, set())
        for token in transcript_words(title_by_slide.get(context.slide_id, "")):
            normalized = normalize_candidate_term(token)
            if normalized:
                terms.add(normalized)
        for unit in context.message_units:
            for token in transcript_words(unit.intent):
                normalized = normalize_candidate_term(token)
                if normalized:
                    terms.add(normalized)
            for term in unit.supporting_terms:
                normalized = normalize_candidate_term(term)
                if normalized:
                    terms.add(normalized)
        terms.update(keyword_terms_by_slide.get(context.slide_id, set()))

    cautions_by_slide: dict[str, list[str]] = {}
    for slide_id, transcript in slide_transcripts.items():
        expected_terms = terms_by_slide.get(slide_id, set())
        if not expected_terms:
            continue

        observed_words = transcript_words(transcript)
        observed_normalized = {
            normalize_candidate_term(word) for word in observed_words
        }

        cautions: list[str] = []
        for word in observed_words:
            observed = normalize_candidate_term(word)
            if (
                not observed
                or observed in expected_terms
                or observed in FILLER_WORDS
                or len(observed) < 3
            ):
                continue

            for expected in expected_terms:
                if (
                    expected == observed
                    or expected in observed_normalized
                    or len(expected) != len(observed)
                    or expected[0] != observed[0]
                    or expected[-1] != observed[-1]
                ):
                    continue

                if edit_distance(observed, expected) != 1:
                    continue

                caution = (
                    f"'{word}'으로 들려 '{expected}'과 혼동될 수 있습니다. "
                    f"'{expected}' 발음을 더 또렷하게 구분해 주세요."
                )
                if caution not in cautions:
                    cautions.append(caution)
                break

            if len(cautions) >= 2:
                break

        if cautions:
            cautions_by_slide[slide_id] = cautions

    return cautions_by_slide


def normalize_candidate_term(value: str) -> str:
    if not isinstance(value, str):
        return ""
    normalized = re.sub(r"[^0-9a-z가-힣]", "", value.lower())
    return normalized if len(normalized) >= 3 else ""


def edit_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if not left:
        return len(right)
    if not right:
        return len(left)

    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_char in enumerate(right, start=1):
            substitution_cost = 0 if left_char == right_char else 1
            current.append(
                min(
                    previous[right_index] + 1,
                    current[right_index - 1] + 1,
                    previous[right_index - 1] + substitution_cost,
                )
            )
        previous = current
    return previous[-1]


def text_overlap_ratio(left: str, right: str) -> float:
    left_words = transcript_words(left)
    right_words = transcript_words(right)
    if not left_words or not right_words:
        return 0.0

    left_counts: dict[str, int] = {}
    for word in left_words:
        left_counts[word] = left_counts.get(word, 0) + 1

    matched = 0
    for word in right_words:
        count = left_counts.get(word, 0)
        if count <= 0:
            continue
        matched += 1
        left_counts[word] = count - 1

    return matched / max(len(left_words), len(right_words))


def _segment_in_range(seg: Any, start_sec: float, end_sec: float) -> bool:
    # TranscriptSegment Pydantic 모델은 start_seconds/end_seconds,
    # dict로 직렬화된 경우 startSeconds/endSeconds 키를 사용한다.
    if isinstance(seg, dict):
        seg_start = seg.get("startSeconds", seg.get("start", -1)) or -1
        seg_end = seg.get("endSeconds", seg.get("end", -1)) or -1
    else:
        seg_start = getattr(seg, "start_seconds", None) or getattr(seg, "start", -1)
        seg_end = getattr(seg, "end_seconds", None) or getattr(seg, "end", -1)
    if seg_start < 0 or seg_end < 0:
        return False
    return seg_start < end_sec and seg_end > start_sec


def generate_rehearsal_coaching(
    *,
    transcript: str,
    metrics: RehearsalMetricsResult,
    context_summary: ContextSummary | None = None,
    total_slide_count: int = 0,
    presented_slide_count: int = 0,
    script_revision_suggestions: list[str] | None = None,
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

    incomplete_note = ""
    if total_slide_count > 0 and presented_slide_count < total_slide_count:
        skipped = total_slide_count - presented_slide_count
        incomplete_note = (
            f"\n\nPRESENTATION INCOMPLETE: The presenter only covered "
            f"{presented_slide_count} out of {total_slide_count} slides "
            f"({skipped} slide(s) were not presented). "
            f"This is an important issue — explicitly mention in your feedback "
            f"that the presentation was not finished and which portion was skipped."
        )
    normalized_script_revision_suggestions = [
        item.strip()
        for item in (script_revision_suggestions or [])
        if item.strip()
    ][:3]
    script_revision_note = ""
    if normalized_script_revision_suggestions:
        script_revision_note = (
            "\nScript revision hints:\n- "
            + "\n- ".join(normalized_script_revision_suggestions)
            + "\nIf these hints are valid, mention that the speaker notes or script should be updated to preserve the stronger delivery."
        )

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
                + (
                    f"\nContext Analysis:\n"
                    f"- overallStatus: {context_summary.overall_status}\n"
                    f"- headline: {context_summary.headline}\n"
                    f"- risks: {', '.join(context_summary.risks)}\n"
                    if context_summary
                    else ""
                )
                + script_revision_note
                + incomplete_note
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
        script_revision_suggestions=normalized_script_revision_suggestions,
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
) -> list[SlideInsight]:
    timeline = normalize_slide_timeline(slide_timeline)
    if not timeline:
        return []

    analysis_end_second = resolve_analysis_end_second(duration_seconds, segments)
    if analysis_end_second <= 0:
        return []

    pause_details = find_pause_details(segments)
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

        pause_count = sum(
            1
            for pause in pause_details
            if interval_midpoint_in_window(
                pause.start_second,
                pause.end_second,
                entry.entered_second,
                window_end,
            )
        )

        insights.append(
            SlideInsight(
                slide_id=entry.slide_id,
                filler_word_count=count_filler_words(slide_words),
                pause_count=pause_count,
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
