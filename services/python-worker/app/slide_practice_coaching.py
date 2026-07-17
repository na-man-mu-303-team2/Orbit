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
당신은 한국어 발표 코치입니다. 제공된 발표 메모와 파생 지표만 사용해 짧고 실행 가능한 개선안을 작성하세요.

규칙:
- issueCodes에 없는 문제를 새로 만들지 마세요.
- 발표자가 바로 실행할 수 있는 구체적인 행동과 30초 연습 방법을 주세요.
- filler 문제가 있으면 발표 메모의 실제 문장 하나를 그대로 originalText로 선택하고, 습관어·불필요한 연결 표현을 줄인 suggestedText를 제안하세요.
- originalText는 발표 메모에 완전히 동일한 문자열이 있을 때만 사용하고, 없으면 scriptEdit을 null로 반환하세요.
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
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 2,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
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
                            "scriptEdit": {
                                "anyOf": [
                                    {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "properties": {
                                            "originalText": {
                                                "type": "string",
                                                "minLength": 1,
                                                "maxLength": 1000,
                                            },
                                            "suggestedText": {
                                                "type": "string",
                                                "minLength": 1,
                                                "maxLength": 1000,
                                            },
                                            "reason": {
                                                "type": "string",
                                                "minLength": 1,
                                                "maxLength": 500,
                                            },
                                        },
                                        "required": [
                                            "originalText",
                                            "suggestedText",
                                            "reason",
                                        ],
                                    },
                                    {"type": "null"},
                                ]
                            },
                        },
                        "required": [
                            "category",
                            "title",
                            "reason",
                            "action",
                            "practiceTip",
                            "scriptEdit",
                        ],
                    },
                },
                "practicePlan": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "title": {"type": "string", "minLength": 1, "maxLength": 100},
                        "steps": {
                            "type": "array",
                            "minItems": 1,
                            "maxItems": 3,
                            "items": {"type": "string", "minLength": 1, "maxLength": 300},
                        },
                    },
                    "required": ["title", "steps"],
                },
            },
            "required": ["summary", "items", "practicePlan"],
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


class SlidePracticeCoachingRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    speaker_notes: str = Field(alias="speakerNotes", max_length=6000)
    issue_codes: list[SlidePracticeIssueCode] = Field(
        alias="issueCodes",
        min_length=1,
        max_length=9,
    )
    metrics: SlidePracticeCoachingMetrics


class SlidePracticeScriptEdit(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    original_text: str = Field(alias="originalText", min_length=1, max_length=1000)
    suggested_text: str = Field(alias="suggestedText", min_length=1, max_length=1000)
    reason: str = Field(min_length=1, max_length=500)


class SlidePracticeCoachingItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    category: SlidePracticeCoachingCategory
    title: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)
    action: str = Field(min_length=1, max_length=500)
    practice_tip: str = Field(alias="practiceTip", min_length=1, max_length=500)
    script_edit: SlidePracticeScriptEdit | None = Field(alias="scriptEdit")


class SlidePracticePracticePlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    title: str = Field(min_length=1, max_length=100)
    steps: list[str] = Field(min_length=1, max_length=3)


class SlidePracticeCoachingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    summary: str = Field(min_length=1, max_length=500)
    items: list[SlidePracticeCoachingItem] = Field(min_length=1, max_length=2)
    practice_plan: SlidePracticePracticePlan = Field(alias="practicePlan")
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

    allowed_categories = {
        _issue_category(issue_code) for issue_code in payload.issue_codes
    }
    items: list[SlidePracticeCoachingItem] = []
    for item in parsed.items:
        if item.category not in allowed_categories:
            continue
        script_edit = item.script_edit
        if script_edit is not None and (
            not payload.speaker_notes
            or script_edit.original_text not in payload.speaker_notes
        ):
            script_edit = None
        items.append(item.model_copy(update={"script_edit": script_edit}))

    if not items:
        raise SlidePracticeCoachingError(
            "Slide practice coaching did not match measured issues."
        )
    return parsed.model_copy(update={"items": items[:2]})


def _issue_category(issue_code: SlidePracticeIssueCode) -> str:
    if issue_code == "filler-use":
        return "filler"
    return issue_code.split("-", maxsplit=1)[0]
