import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SemanticCueKeyword(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = ""
    synonyms: list[str] = Field(default_factory=list)
    abbreviations: list[str] = Field(default_factory=list)


class SemanticCueSlide(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slide_id: str = Field(alias="slideId")
    title: str = ""
    speaker_notes: str = Field(default="", alias="speakerNotes")
    keywords: list[SemanticCueKeyword] = Field(default_factory=list)
    elements: list[dict[str, Any]] = Field(default_factory=list)


class SemanticCueDeck(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck_id: str = Field(alias="deckId")
    slides: list[SemanticCueSlide] = Field(default_factory=list)


class SemanticCueExtractionRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    deck: SemanticCueDeck


class SemanticCue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cue_id: str = Field(alias="cueId")
    slide_id: str = Field(alias="slideId")
    meaning: str
    required: bool = True
    priority: Literal[1, 2, 3] = 2
    candidate_keywords: list[str] = Field(default_factory=list, alias="candidateKeywords")
    aliases: dict[str, list[str]] = Field(default_factory=dict)
    required_concepts: list[str] = Field(default_factory=list, alias="requiredConcepts")
    nli_hypotheses: list[str] = Field(alias="nliHypotheses")
    negative_hints: list[str] = Field(default_factory=list, alias="negativeHints")
    target_element_ids: list[str] = Field(default_factory=list, alias="targetElementIds")
    trigger_action_ids: list[str] = Field(default_factory=list, alias="triggerActionIds")


class SemanticCueSlideResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slide_id: str = Field(alias="slideId")
    semantic_cues: list[SemanticCue] = Field(default_factory=list, alias="semanticCues")


class SemanticCueExtractionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck_id: str = Field(alias="deckId")
    slides: list[SemanticCueSlideResult] = Field(default_factory=list)


def extract_semantic_cues(
    payload: SemanticCueExtractionRequest,
) -> SemanticCueExtractionResponse:
    return SemanticCueExtractionResponse(
        deckId=payload.deck.deck_id,
        slides=[
            SemanticCueSlideResult(
                slideId=slide.slide_id,
                semanticCues=_extract_slide_cues(slide),
            )
            for slide in payload.deck.slides
        ],
    )


def _extract_slide_cues(slide: SemanticCueSlide) -> list[SemanticCue]:
    terms = _collect_terms(slide)
    if not terms:
        return []

    cues: list[SemanticCue] = []
    for index, term in enumerate(terms[:3], start=1):
        aliases = _aliases_for_term(slide, term)
        meaning = _meaning_for_term(slide, term)
        cues.append(
            SemanticCue(
                cueId=f"scue_{_safe_id(slide.slide_id)}_{index}",
                slideId=slide.slide_id,
                meaning=meaning,
                required=True,
                priority=1 if index == 1 else 2,
                candidateKeywords=[term],
                aliases={term: aliases} if aliases else {},
                requiredConcepts=_compact([term, *aliases]),
                nliHypotheses=[meaning],
            )
        )
    return cues


def _collect_terms(slide: SemanticCueSlide) -> list[str]:
    keyword_terms = [
        keyword.text
        for keyword in slide.keywords
        if keyword.text and len(keyword.text.strip()) > 1
    ]
    note_terms = _important_terms(f"{slide.title} {slide.speaker_notes}")
    element_terms = _important_terms(" ".join(_element_text(element) for element in slide.elements))
    return _compact([*keyword_terms, *note_terms, *element_terms])


def _aliases_for_term(slide: SemanticCueSlide, term: str) -> list[str]:
    aliases: list[str] = []
    for keyword in slide.keywords:
        if _same_term(keyword.text, term):
            aliases.extend(keyword.synonyms)
            aliases.extend(keyword.abbreviations)
    return _compact(aliases)


def _meaning_for_term(slide: SemanticCueSlide, term: str) -> str:
    title = slide.title.strip()
    if title:
        return f"{title}에서 {term}의 핵심 의미를 설명했다"
    return f"{term}의 핵심 의미를 설명했다"


def _element_text(element: dict[str, Any]) -> str:
    values: list[str] = []
    for key in ("text", "title", "label", "alt"):
        value = element.get(key)
        if isinstance(value, str):
            values.append(value)
    return " ".join(values)


def _important_terms(text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}|[가-힣][가-힣A-Za-z0-9_-]{1,}", text)
    return [
        candidate
        for candidate in candidates
        if candidate not in _KOREAN_STOP_WORDS and len(candidate) <= 40
    ]


def _compact(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _same_term(left: str, right: str) -> bool:
    return left.strip().casefold() == right.strip().casefold()


def _safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value.removeprefix("slide_")) or "slide"


_KOREAN_STOP_WORDS = {
    "그리고",
    "그래서",
    "하지만",
    "이번",
    "오늘은",
    "합니다",
    "입니다",
    "에서",
    "으로",
    "대한",
    "핵심",
    "설명",
}
