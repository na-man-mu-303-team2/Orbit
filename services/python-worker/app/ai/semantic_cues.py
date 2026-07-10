import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ai.semantic_cue_filters import (
    compact as _compact,
    compact_meaningful_phrases as _compact_meaningful_phrases,
    compact_texts as _compact_texts,
    important_terms as _important_terms,
    is_generic_imported_title as _is_generic_imported_title,
    is_meaningful_explicit_keyword as _is_meaningful_explicit_keyword,
    is_meaningful_phrase as _is_meaningful_phrase,
)
from app.ai.semantic_cue_llm import generate_semantic_cue_payload


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
    actions: list[dict[str, Any]] = Field(default_factory=list)


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


class LlmSemanticCueAliasEntry(BaseModel):
    term: str
    values: list[str] = Field(default_factory=list)


class LlmSemanticCue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meaning: str
    required: bool = True
    priority: Literal[1, 2, 3] = 2
    candidate_keywords: list[str] = Field(default_factory=list, alias="candidateKeywords")
    alias_entries: list[LlmSemanticCueAliasEntry] = Field(
        default_factory=list,
        alias="aliasEntries",
    )
    required_concepts: list[str] = Field(default_factory=list, alias="requiredConcepts")
    nli_hypotheses: list[str] = Field(alias="nliHypotheses", min_length=1, max_length=3)
    negative_hints: list[str] = Field(default_factory=list, alias="negativeHints")
    target_element_ids: list[str] = Field(default_factory=list, alias="targetElementIds")
    trigger_action_ids: list[str] = Field(default_factory=list, alias="triggerActionIds")


class LlmSemanticCueSlideResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slide_id: str = Field(alias="slideId")
    semantic_cues: list[LlmSemanticCue] = Field(
        default_factory=list,
        alias="semanticCues",
        max_length=7,
    )


class LlmSemanticCueExtractionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slides: list[LlmSemanticCueSlideResult] = Field(default_factory=list)


def extract_semantic_cues(
    payload: SemanticCueExtractionRequest,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> SemanticCueExtractionResponse:
    llm_response = _extract_semantic_cues_with_llm(
        payload,
        client=client,
        model=model,
        api_key=api_key,
    )
    if llm_response is not None:
        return llm_response

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


def _extract_semantic_cues_with_llm(
    payload: SemanticCueExtractionRequest,
    *,
    client: Any | None,
    model: str | None,
    api_key: str | None,
) -> SemanticCueExtractionResponse | None:
    generated_payload = generate_semantic_cue_payload(
        _llm_input_payload(payload),
        client=client,
        model=model,
        api_key=api_key,
    )
    if generated_payload is None:
        return None

    try:
        generated = LlmSemanticCueExtractionResponse.model_validate(generated_payload)
    except Exception:
        return None

    slides_by_id = {slide.slide_id: slide for slide in payload.deck.slides}
    generated_by_slide_id = {
        slide_result.slide_id: slide_result for slide_result in generated.slides
    }

    results: list[SemanticCueSlideResult] = []
    for slide in payload.deck.slides:
        generated_slide = generated_by_slide_id.get(slide.slide_id)
        if generated_slide is None:
            results.append(SemanticCueSlideResult(slideId=slide.slide_id))
            continue

        cues = _semantic_cues_from_llm(slide, generated_slide.semantic_cues)
        results.append(SemanticCueSlideResult(slideId=slide.slide_id, semanticCues=cues))

    unknown_slide_ids = set(generated_by_slide_id) - set(slides_by_id)
    if unknown_slide_ids:
        return None

    return SemanticCueExtractionResponse(deckId=payload.deck.deck_id, slides=results)


def _semantic_cues_from_llm(
    slide: SemanticCueSlide,
    generated_cues: list[LlmSemanticCue],
) -> list[SemanticCue]:
    element_ids = set(_slide_element_ids(slide))
    action_ids = set(_slide_action_ids(slide))
    cues: list[SemanticCue] = []

    for cue in generated_cues:
        candidate_keywords = _compact_meaningful_phrases(
            cue.candidate_keywords,
            max_items=6,
            max_length=80,
        )
        required_concepts = _compact_meaningful_phrases(
            cue.required_concepts,
            max_items=8,
            max_length=80,
        )
        meaning = cue.meaning.strip()[:240]
        nli_hypotheses = _compact_texts(cue.nli_hypotheses, max_items=3, max_length=300)
        if not nli_hypotheses and meaning:
            nli_hypotheses = [meaning]
        if not meaning or not nli_hypotheses:
            continue
        if not candidate_keywords and not required_concepts:
            continue

        aliases = {
            key: values
            for key, values in (
                (
                    alias_entry.term.strip(),
                    _compact_meaningful_phrases(
                        alias_entry.values,
                        max_items=6,
                        max_length=80,
                    ),
                )
                for alias_entry in cue.alias_entries
            )
            if key and values and _is_meaningful_phrase(key, max_length=80)
        }

        cues.append(
            SemanticCue(
                cueId=f"scue_{_safe_id(slide.slide_id)}_{len(cues) + 1}",
                slideId=slide.slide_id,
                meaning=meaning,
                required=cue.required,
                priority=cue.priority,
                candidateKeywords=candidate_keywords,
                aliases=aliases,
                requiredConcepts=required_concepts,
                nliHypotheses=nli_hypotheses,
                negativeHints=_compact_texts(
                    cue.negative_hints,
                    max_items=5,
                    max_length=160,
                ),
                targetElementIds=[
                    element_id
                    for element_id in _compact_texts(
                        cue.target_element_ids,
                        max_items=8,
                        max_length=80,
                    )
                    if element_id in element_ids
                ],
                triggerActionIds=[
                    action_id
                    for action_id in _compact_texts(
                        cue.trigger_action_ids,
                        max_items=8,
                        max_length=80,
                    )
                    if action_id in action_ids
                ],
            )
        )

    return cues


def _llm_input_payload(payload: SemanticCueExtractionRequest) -> dict[str, Any]:
    return {
        "projectId": payload.project_id,
        "deckId": payload.deck.deck_id,
        "slides": [
            {
                "slideId": slide.slide_id,
                "title": ""
                if _is_generic_imported_title(slide.title)
                else slide.title.strip(),
                "speakerNotes": slide.speaker_notes.strip(),
                "keywords": [
                    {
                        "text": keyword.text.strip(),
                        "synonyms": _compact_texts(
                            keyword.synonyms,
                            max_items=6,
                            max_length=80,
                        ),
                        "abbreviations": _compact_texts(
                            keyword.abbreviations,
                            max_items=6,
                            max_length=40,
                        ),
                    }
                    for keyword in slide.keywords
                    if _is_meaningful_explicit_keyword(keyword.text)
                ],
                "elements": [
                    {"elementId": element_id, "text": text}
                    for element in slide.elements
                    if (element_id := _element_id(element))
                    and (text := _element_text(element).strip())
                ][:24],
                "actionIds": _slide_action_ids(slide)[:24],
            }
            for slide in payload.deck.slides
        ],
    }


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
        keyword.text.strip()
        for keyword in slide.keywords
        if _is_meaningful_explicit_keyword(keyword.text)
    ]
    title_terms = (
        []
        if _is_generic_imported_title(slide.title)
        else _important_terms(slide.title)
    )
    note_terms = _important_terms(slide.speaker_notes)
    element_terms = _important_terms(
        " ".join(_element_text(element) for element in slide.elements)
    )
    return _compact([*keyword_terms, *title_terms, *note_terms, *element_terms])


def _aliases_for_term(slide: SemanticCueSlide, term: str) -> list[str]:
    aliases: list[str] = []
    for keyword in slide.keywords:
        if _same_term(keyword.text, term):
            aliases.extend(keyword.synonyms)
            aliases.extend(keyword.abbreviations)
    return _compact(aliases)


def _meaning_for_term(slide: SemanticCueSlide, term: str) -> str:
    title = slide.title.strip()
    if title and not _is_generic_imported_title(title):
        return f"{title}에서 {term}의 핵심 의미를 설명했다"
    return f"{term}의 핵심 의미를 설명했다"


def _element_text(element: dict[str, Any]) -> str:
    values: list[str] = []
    for key in ("text", "title", "label", "alt"):
        value = element.get(key)
        if isinstance(value, str):
            values.append(value)
    props = element.get("props")
    if isinstance(props, dict):
        for key in ("text", "title", "label", "alt"):
            value = props.get(key)
            if isinstance(value, str):
                values.append(value)
    return " ".join(values)


def _element_id(element: dict[str, Any]) -> str:
    for key in ("elementId", "id"):
        value = element.get(key)
        if isinstance(value, str):
            return value.strip()
    return ""


def _slide_element_ids(slide: SemanticCueSlide) -> list[str]:
    return _compact_texts(
        [_element_id(element) for element in slide.elements],
        max_items=200,
        max_length=80,
    )


def _action_id(action: dict[str, Any]) -> str:
    for key in ("actionId", "id"):
        value = action.get(key)
        if isinstance(value, str):
            return value.strip()
    return ""


def _slide_action_ids(slide: SemanticCueSlide) -> list[str]:
    return _compact_texts(
        [_action_id(action) for action in slide.actions],
        max_items=200,
        max_length=80,
    )


def _same_term(left: str, right: str) -> bool:
    return left.strip().casefold() == right.strip().casefold()


def _safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value.removeprefix("slide_")) or "slide"
