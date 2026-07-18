from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

SlidePracticeIssueCode = Literal[
    "filler-use",
    "pace-slow",
    "pace-fast",
    "pause-low",
    "pause-high",
    "pitch-flat",
    "pitch-wide",
    "loudness-low",
    "loudness-high",
]
SlidePracticeCoachingCategory = Literal[
    "filler",
    "pace",
    "pause",
    "pitch",
    "loudness",
]

COACHING_INSTRUCTIONS = """
당신은 한국어 발표 코치입니다. 제공된 실제 대본 근거와 파생 지표만 사용해 가장 효과적인 개선안 하나를 작성하세요.

규칙:
- issueCodes에 없는 문제를 새로 만들지 마세요.
- evidenceCandidates 중 청중 이해에 가장 큰 영향을 주고 바로 고칠 수 있는 하나만 선택하세요.
- action에는 선택한 실제 대본 구간을 어떻게 말하면 좋은지 구체적으로 작성하세요.
- practiceTip에는 같은 문제를 고치는 다른 연습 방법 하나를 작성하세요.
- matched 근거는 실제 문제 구간으로 설명할 수 있지만 practice-target은 연습 추천 구간으로만 표현하세요.
- 속도, 음량, 쉼, 피치폭, 습관어, 음량 변화폭, 리듬 규칙성을 함께 고려하세요.
- 음량 단위는 dBFS이며 0에 가까울수록 큰 소리입니다.
- 사용자의 성격, 건강, 감정 상태를 추측하지 마세요.
- 점수나 순위를 만들지 마세요.
- 한국어로 답하세요.
""".strip()

COACHING_RESPONSE_FORMAT: dict[str, Any] = {
    "format": {
        "type": "json_schema",
        "name": "slide_practice_coaching",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "summary": {"type": "string", "minLength": 1, "maxLength": 500},
                "item": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "evidenceId": {"type": "string", "minLength": 1, "maxLength": 128},
                        "category": {
                            "type": "string",
                            "enum": [
                                "filler",
                                "pace",
                                "pause",
                                "pitch",
                                "loudness",
                            ],
                        },
                        "title": {"type": "string", "minLength": 1, "maxLength": 100},
                        "reason": {"type": "string", "minLength": 1, "maxLength": 500},
                        "action": {"type": "string", "minLength": 1, "maxLength": 500},
                        "practiceTip": {"type": "string", "minLength": 1, "maxLength": 500},
                    },
                    "required": [
                        "evidenceId",
                        "category",
                        "title",
                        "reason",
                        "action",
                        "practiceTip",
                    ],
                },
            },
            "required": ["summary", "item"],
        },
    }
}


class SlidePracticeFillerDetail(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    word: str = Field(min_length=1, max_length=50)
    count: int = Field(ge=1, le=1000)


class SlidePracticeCoachingMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    filler_details: list[SlidePracticeFillerDetail] = Field(
        alias="fillerDetails",
        max_length=100,
    )
    filler_total_count: int = Field(alias="fillerTotalCount", ge=0, le=10_000)
    syllables_per_second: float | None = Field(alias="syllablesPerSecond")
    pause_ratio: float = Field(alias="pauseRatio", ge=0, le=1)
    pitch_span_hz: float | None = Field(alias="pitchSpanHz")
    loudness_db: float | None = Field(alias="loudnessDb")
    loudness_variation_db: float | None = Field(alias="loudnessVariationDb")
    rhythm_regularity: float | None = Field(alias="rhythmRegularity")


class SlidePracticeEvidenceMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    syllables_per_second: float | None = Field(alias="syllablesPerSecond")
    loudness_db: float | None = Field(alias="loudnessDb")
    pause_before_ms: int | None = Field(alias="pauseBeforeMs", ge=0, le=300_000)
    pause_after_ms: int | None = Field(alias="pauseAfterMs", ge=0, le=300_000)
    pitch_span_hz: float | None = Field(alias="pitchSpanHz")
    filler_total_count: int = Field(alias="fillerTotalCount", ge=0, le=10_000)
    filler_words: list[str] = Field(alias="fillerWords", max_length=5)
    loudness_variation_db: float | None = Field(alias="loudnessVariationDb")
    rhythm_regularity: float | None = Field(alias="rhythmRegularity")


class SlidePracticeEvidenceCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    evidence_id: str = Field(alias="evidenceId", min_length=1, max_length=128)
    original_text: str = Field(alias="originalText", min_length=1, max_length=1_000)
    alignment: Literal["matched", "practice-target"]
    start_ms: int | None = Field(alias="startMs", ge=0, le=300_000)
    end_ms: int | None = Field(alias="endMs", gt=0, le=300_000)
    issue_codes: list[SlidePracticeIssueCode] = Field(
        alias="issueCodes",
        min_length=1,
        max_length=9,
    )
    metrics: SlidePracticeEvidenceMetrics


class SlidePracticeCoachingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    speaker_notes: str = Field(alias="speakerNotes", max_length=6000)
    issue_codes: list[SlidePracticeIssueCode] = Field(
        alias="issueCodes",
        min_length=1,
        max_length=9,
    )
    metrics: SlidePracticeCoachingMetrics
    evidence_candidates: list[SlidePracticeEvidenceCandidate] = Field(
        alias="evidenceCandidates",
        min_length=1,
        max_length=8,
    )


class SlidePracticeCoachingItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    evidence_id: str = Field(alias="evidenceId", min_length=1, max_length=128)
    category: SlidePracticeCoachingCategory
    title: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)
    action: str = Field(min_length=1, max_length=500)
    practice_tip: str = Field(alias="practiceTip", min_length=1, max_length=500)


class SlidePracticeCoachingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    summary: str = Field(min_length=1, max_length=500)
    item: SlidePracticeCoachingItem
    model: str = Field(min_length=1, max_length=100)


class SlidePracticeCoachingError(RuntimeError):
    pass


def generate_slide_practice_coaching(
    payload: SlidePracticeCoachingRequest,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> SlidePracticeCoachingResponse:
    api_client: Any = client
    if api_client is None:
        if not api_key:
            raise SlidePracticeCoachingError(
                "Slide practice coaching is not configured."
            )
        from openai import OpenAI

        api_client = OpenAI(api_key=api_key)

    prompt_payload = payload.model_dump(by_alias=True)
    try:
        response = api_client.responses.create(
            model=model,
            instructions=COACHING_INSTRUCTIONS,
            input=json.dumps(prompt_payload, ensure_ascii=False),
            text=COACHING_RESPONSE_FORMAT,
        )
        output_text = str(getattr(response, "output_text", "")).strip()
        parsed = SlidePracticeCoachingResponse.model_validate(
            {**json.loads(output_text), "model": model}
        )
    except Exception as error:
        raise SlidePracticeCoachingError(
            "Slide practice coaching generation failed."
        ) from error

    evidence_by_id = {
        evidence.evidence_id: evidence for evidence in payload.evidence_candidates
    }
    selected_evidence = evidence_by_id.get(parsed.item.evidence_id)
    if selected_evidence is None:
        raise SlidePracticeCoachingError(
            "Slide practice coaching selected unknown evidence."
        )
    allowed_categories = {
        _issue_category(issue_code)
        for issue_code in selected_evidence.issue_codes
    }
    if parsed.item.category not in allowed_categories:
        raise SlidePracticeCoachingError(
            "Slide practice coaching did not match measured evidence."
        )
    return parsed


def _issue_category(issue_code: SlidePracticeIssueCode) -> str:
    if issue_code == "filler-use":
        return "filler"
    return issue_code.split("-", maxsplit=1)[0]
