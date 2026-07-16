from typing import Any, cast

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter()


class ChallengeQnaGenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    source: dict[str, Any]
    source_snapshot: dict[str, Any] = Field(alias="sourceSnapshot")
    grounding_snapshot: dict[str, Any] | None = Field(alias="groundingSnapshot")


class ChallengeQnaGenerateResponse(BaseModel):
    questions: list[dict[str, Any]] = Field(min_length=1, max_length=3)


class ChallengeQnaAnalyzeAnswerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    answer_text: str = Field(alias="answerText", min_length=1, max_length=8_000)
    question_text: str = Field(alias="questionText", min_length=1, max_length=500)
    answer_guide: dict[str, Any] = Field(alias="answerGuide")
    source_snapshot: dict[str, Any] = Field(alias="sourceSnapshot")


class ChallengeQnaAnalyzeAnswerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    concept_outcomes: list[dict[str, str]] = Field(alias="conceptOutcomes", max_length=8)
    clarity: str
    audience_fit: str = Field(alias="audienceFit")


@router.post("/challenge-qna/generate", response_model=ChallengeQnaGenerateResponse)
def generate_challenge_qna(
    payload: ChallengeQnaGenerateRequest,
) -> ChallengeQnaGenerateResponse:
    question_count = int(payload.source.get("questionCount", 1))
    slides = cast(dict[str, Any], payload.source_snapshot.get("deck", {})).get(
        "slides", []
    )
    chunks = (payload.grounding_snapshot or {}).get("chunks", [])
    linked_goals = payload.source_snapshot.get("linkedGoalRefs", [])
    grounding_sources: list[tuple[dict[str, Any], str]] = []
    for chunk in chunks:
        grounding_sources.append(
            (
                {
                    "type": "reference",
                    "fileId": chunk["fileId"],
                    "fileContentHash": chunk["fileContentHash"],
                    "chunkId": chunk["chunkId"],
                    "contentHash": chunk["contentHash"],
                },
                str(chunk["content"])[:80],
            )
        )
    for slide in slides:
        grounding_sources.append(
            (
                {
                    "type": "slide",
                    "slideId": slide["slideId"],
                    "deckVersion": payload.source_snapshot["deck"]["deckVersion"],
                    "slideOrder": slide["order"],
                    "title": slide["title"],
                    "contentHash": slide["contentHash"],
                },
                str(slide["title"])[:80],
            )
        )
    question_types = ["evidence", "objection", "decision"]
    question_templates = {
        "evidence": "{label}을 뒷받침하는 가장 중요한 근거와 검증 기준은 무엇인가요?",
        "objection": "{label}에 대한 가장 강한 반론은 무엇이며, 어떤 기준으로 대응하시겠습니까?",
        "decision": "{label}을 바탕으로 청중이 지금 내려야 할 결정과 다음 행동은 무엇인가요?",
    }
    fallback_questions = {
        "evidence": "이 주장을 뒷받침할 승인된 근거를 어디에 추가하시겠습니까?",
        "objection": "이 주장에 대한 반론을 검토하려면 어떤 승인된 근거가 필요합니까?",
        "decision": "청중의 결정을 요청하려면 어떤 승인된 근거를 먼저 추가해야 합니까?",
    }
    suggested_structures = {
        "evidence": ["핵심 결론", "가장 강한 근거", "검증 기준"],
        "objection": ["예상 반론", "수용할 조건", "대응 근거와 한계"],
        "decision": ["요청할 결정", "판단 기준", "담당자와 다음 행동"],
    }
    questions: list[dict[str, Any]] = []
    for index in range(question_count):
        question_type = question_types[index % len(question_types)]
        source_ref, concept_label = (
            grounding_sources[index % len(grounding_sources)]
            if grounding_sources
            else (None, "핵심 주장")
        )
        grounded = source_ref is not None and bool(concept_label.strip())
        questions.append(
            {
                "questionType": question_type,
                "difficulty": "challenging" if index > 0 else "standard",
                "questionText": (
                    question_templates[question_type].format(label=concept_label)
                    if grounded
                    else fallback_questions[question_type]
                ),
                "linkedGoalIds": [item["goalId"] for item in linked_goals[:3]],
                "sourceRefs": [source_ref] if source_ref else [],
                "answerGuide": {
                    "supportState": "grounded" if grounded else "insufficient",
                    "mustIncludeConcepts": (
                        [
                            {
                                "conceptId": f"concept-{index + 1}",
                                "label": concept_label,
                                "sourceRefs": [source_ref],
                            }
                        ]
                        if grounded
                        else []
                    ),
                    "suggestedStructure": suggested_structures[question_type],
                    "caveats": [],
                    "remediation": (
                        None
                        if grounded
                        else {
                            "message": "승인된 참고자료나 장표 근거를 추가한 뒤 다시 질문을 생성하세요.",
                            "suggestedSlideIds": [
                                slide["slideId"] for slide in slides[:3]
                            ],
                            "action": "add-reference",
                        }
                    ),
                },
            }
        )
    return ChallengeQnaGenerateResponse(questions=questions)


@router.post(
    "/challenge-qna/analyze-answer",
    response_model=ChallengeQnaAnalyzeAnswerResponse,
)
def analyze_challenge_qna_answer(
    payload: ChallengeQnaAnalyzeAnswerRequest,
) -> ChallengeQnaAnalyzeAnswerResponse:
    normalized = payload.answer_text.casefold()
    concepts = cast(
        list[dict[str, Any]], payload.answer_guide.get("mustIncludeConcepts", [])
    )
    outcomes = []
    for concept in concepts[:8]:
        label = str(concept.get("label", "")).casefold().strip()
        tokens = [token for token in label.split() if len(token) > 1]
        matches = sum(1 for token in tokens if token in normalized)
        outcome = (
            "covered"
            if tokens and matches == len(tokens)
            else "partial"
            if matches
            else "missed"
        )
        outcomes.append(
            {
                "conceptId": str(concept.get("conceptId", "concept")),
                "outcome": outcome,
            }
        )
    if not concepts:
        outcomes = []
    answer_length = len(payload.answer_text.strip())
    clarity = "clear" if answer_length >= 30 else "needs-focus"
    audience_fit = (
        "too-vague"
        if answer_length < 15
        else "too-technical"
        if answer_length > 500
        else "appropriate"
    )
    return ChallengeQnaAnalyzeAnswerResponse(
        conceptOutcomes=outcomes,
        clarity=clarity,
        audienceFit=audience_fit,
    )
