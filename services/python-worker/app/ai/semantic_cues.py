from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ai.semantic_cue_filters import (
    compact_meaningful_phrases as _compact_meaningful_phrases,
    compact_texts as _compact_texts,
    is_generic_imported_title as _is_generic_imported_title,
    is_meaningful_explicit_keyword as _is_meaningful_explicit_keyword,
    is_meaningful_phrase as _is_meaningful_phrase,
)
from app.ai.semantic_cue_llm import SemanticCueLlmError, generate_semantic_cue_payload
from app.ai.semantic_cue_merge import merge_semantic_cues
from app.ai.semantic_cue_quality import (
    cue_quality_warnings,
    is_content_rich,
    is_optional_slide,
    should_retry_quality,
    slide_quality_warnings,
)


SemanticCueImportance = Literal["core", "supporting", "optional"]
SemanticCueType = Literal[
    "definition",
    "problem",
    "cause",
    "solution",
    "result",
    "warning",
    "lesson",
    "transition",
    "closing",
]
SemanticCueSourceKind = Literal[
    "slide-title",
    "speaker-notes",
    "element",
    "table",
    "chart",
    "image-analysis",
]


class SemanticCueSourceRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: SemanticCueSourceKind
    ref_id: str | None = Field(default=None, alias="refId")
    source_hash: str = Field(alias="sourceHash")


class ExistingSemanticCue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    cue_id: str = Field(alias="cueId")
    slide_id: str = Field(alias="slideId")
    meaning: str
    report_label: str | None = Field(default=None, alias="reportLabel")
    cue_type: SemanticCueType | None = Field(default=None, alias="cueType")
    importance: SemanticCueImportance = "supporting"
    review_status: Literal["suggested", "approved", "excluded"] = Field(
        default="suggested", alias="reviewStatus"
    )
    freshness: Literal["current", "stale"] = "current"
    origin: Literal["ai", "manual", "imported"] = "imported"
    revision: int = Field(default=1, gt=0)
    source_fingerprint: str | None = Field(default=None, alias="sourceFingerprint")
    source_refs: list[SemanticCueSourceRef] = Field(default_factory=list, alias="sourceRefs")
    quality_warnings: list[str] = Field(default_factory=list, alias="qualityWarnings")
    required_concepts: list[str] = Field(default_factory=list, alias="requiredConcepts")


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
    estimated_seconds: int | None = Field(default=None, alias="estimatedSeconds", gt=0)
    keywords: list[SemanticCueKeyword] = Field(default_factory=list)
    semantic_cues: list[ExistingSemanticCue] = Field(
        default_factory=list, alias="semanticCues"
    )
    elements: list[dict[str, Any]] = Field(default_factory=list)
    actions: list[dict[str, Any]] = Field(default_factory=list)


class SemanticCueDeckMetadata(BaseModel):
    audience: str | None = None
    purpose: str | None = None


class SemanticCueDeck(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck_id: str = Field(alias="deckId")
    version: int = Field(default=1, gt=0)
    target_duration_minutes: int = Field(
        default=10, alias="targetDurationMinutes", gt=0
    )
    metadata: SemanticCueDeckMetadata = Field(default_factory=SemanticCueDeckMetadata)
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
    report_label: str | None = Field(default=None, alias="reportLabel")
    presenter_tag: str | None = Field(default=None, alias="presenterTag")
    cue_type: SemanticCueType | None = Field(default=None, alias="cueType")
    importance: SemanticCueImportance = "supporting"
    review_status: Literal["suggested", "approved", "excluded"] = Field(
        default="suggested", alias="reviewStatus"
    )
    freshness: Literal["current", "stale"] = "current"
    origin: Literal["ai", "manual", "imported"] = "ai"
    revision: int = Field(default=1, gt=0)
    source_deck_version: int = Field(alias="sourceDeckVersion", gt=0)
    source_fingerprint: str | None = Field(default=None, alias="sourceFingerprint")
    source_refs: list[SemanticCueSourceRef] = Field(default_factory=list, alias="sourceRefs")
    quality_warnings: list[str] = Field(default_factory=list, alias="qualityWarnings")
    required: bool = False
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
    status: Literal["succeeded", "skipped", "failed"] = "succeeded"
    semantic_cues: list[SemanticCue] = Field(default_factory=list, alias="semanticCues")
    warnings: list[str] = Field(default_factory=list)


class SemanticCueExtractionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    deck_id: str = Field(alias="deckId")
    source_deck_version: int = Field(alias="sourceDeckVersion", gt=0)
    slides: list[SemanticCueSlideResult] = Field(default_factory=list)


class LlmSemanticCueAliasEntry(BaseModel):
    term: str
    values: list[str] = Field(default_factory=list)


class LlmSemanticCue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meaning: str
    report_label: str = Field(default="", alias="reportLabel")
    presenter_tag: str = Field(default="", alias="presenterTag")
    cue_type: SemanticCueType | None = Field(default=None, alias="cueType")
    importance: SemanticCueImportance = "supporting"
    candidate_keywords: list[str] = Field(default_factory=list, alias="candidateKeywords")
    alias_entries: list[LlmSemanticCueAliasEntry] = Field(
        default_factory=list, alias="aliasEntries"
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
        default_factory=list, alias="semanticCues", max_length=7
    )


class LlmSemanticCueExtractionResponse(BaseModel):
    slides: list[LlmSemanticCueSlideResult] = Field(default_factory=list)


class SemanticCueExtractionError(RuntimeError):
    pass


def extract_semantic_cues(
    payload: SemanticCueExtractionRequest,
    *,
    client: Any | None = None,
    model: str | None = None,
    api_key: str | None = None,
) -> SemanticCueExtractionResponse:
    llm_input = _llm_input_payload(payload)
    first = _generate_results(payload, llm_input, client, model, api_key)
    first_warnings = _result_warnings(first)
    if not should_retry_quality(first_warnings):
        return first

    retry_input = {
        **llm_input,
        "qualityFeedback": first_warnings,
        "qualityDetails": _result_quality_details(first),
    }
    try:
        retried = _generate_results(payload, retry_input, client, model, api_key)
    except SemanticCueExtractionError:
        return first
    if _result_warning_score(retried) <= _result_warning_score(first):
        return retried
    return first


def _generate_results(
    payload: SemanticCueExtractionRequest,
    llm_input: dict[str, Any],
    client: Any | None,
    model: str | None,
    api_key: str | None,
) -> SemanticCueExtractionResponse:
    try:
        generated_payload = generate_semantic_cue_payload(
            llm_input, client=client, model=model, api_key=api_key
        )
    except SemanticCueLlmError as error:
        raise SemanticCueExtractionError(str(error)) from error

    try:
        generated = LlmSemanticCueExtractionResponse.model_validate(generated_payload)
    except Exception as error:
        raise SemanticCueExtractionError(
            "OpenAI semantic cue response did not match the semantic cue schema."
        ) from error

    slides_by_id = {slide.slide_id: slide for slide in payload.deck.slides}
    generated_by_slide_id = {
        slide_result.slide_id: slide_result for slide_result in generated.slides
    }
    if set(generated_by_slide_id) - set(slides_by_id):
        raise SemanticCueExtractionError(
            "OpenAI semantic cue response included unknown slide IDs."
        )

    results: list[SemanticCueSlideResult] = []
    for slide in payload.deck.slides:
        generated_slide = generated_by_slide_id.get(slide.slide_id)
        if generated_slide is None:
            results.append(
                SemanticCueSlideResult(
                    slideId=slide.slide_id,
                    status="skipped",
                    warnings=["provider-omitted-slide"],
                )
            )
            continue

        generated_cues = _semantic_cues_from_llm(
            slide, generated_slide.semantic_cues, payload.deck.version
        )
        merge_result = merge_semantic_cues(
            [
                cue.model_dump(by_alias=True, exclude_none=True)
                for cue in generated_cues
            ],
            [
                cue.model_dump(by_alias=True, exclude_none=True)
                for cue in slide.semantic_cues
            ],
        )
        cues = [SemanticCue.model_validate(cue) for cue in merge_result.cues]
        slide_warnings = slide_quality_warnings(
            cue_count=len(cues),
            all_core=bool(cues) and all(cue.importance == "core" for cue in cues),
            content_rich=_slide_is_content_rich(slide),
        )
        if slide_warnings:
            for cue in cues:
                cue.quality_warnings = _dedupe(
                    [*cue.quality_warnings, *slide_warnings]
                )[:12]
        results.append(
            SemanticCueSlideResult(
                slideId=slide.slide_id,
                semanticCues=cues,
                warnings=_dedupe(
                    [
                        *merge_result.warnings,
                        *slide_warnings,
                        *(warning for cue in cues for warning in cue.quality_warnings),
                    ]
                ),
            )
        )

    return SemanticCueExtractionResponse(
        deckId=payload.deck.deck_id,
        sourceDeckVersion=payload.deck.version,
        slides=results,
    )


def _semantic_cues_from_llm(
    slide: SemanticCueSlide,
    generated_cues: list[LlmSemanticCue],
    source_deck_version: int,
) -> list[SemanticCue]:
    element_ids = set(_slide_element_ids(slide))
    action_ids = set(_slide_action_ids(slide))
    image_source_unverified = _image_source_unverified(slide)
    cues: list[SemanticCue] = []

    for cue in generated_cues:
        candidate_keywords = _compact_meaningful_phrases(
            cue.candidate_keywords, max_items=4, max_length=80
        )
        required_concepts = _compact_meaningful_phrases(
            cue.required_concepts, max_items=4, max_length=80
        )
        meaning = cue.meaning.strip()[:240]
        nli_hypotheses = _compact_texts(
            cue.nli_hypotheses, max_items=3, max_length=300
        )
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
                        alias_entry.values, max_items=6, max_length=80
                    ),
                )
                for alias_entry in cue.alias_entries
            )
            if key and values and _is_meaningful_phrase(key, max_length=80)
        }
        negative_hints = _compact_texts(
            cue.negative_hints, max_items=3, max_length=160
        )
        target_element_ids = [
            element_id
            for element_id in _compact_texts(
                cue.target_element_ids, max_items=8, max_length=80
            )
            if element_id in element_ids
        ]
        source_refs = (
            [] if image_source_unverified else _source_refs(slide, target_element_ids)
        )
        importance = (
            "optional"
            if is_optional_slide(slide.title, cue.cue_type)
            else cue.importance
        )
        required, priority = _compatibility_fields(importance)
        warnings = cue_quality_warnings(
            meaning=meaning,
            candidate_keywords=candidate_keywords,
            aliases=aliases,
            required_concepts=required_concepts,
            hypotheses=nli_hypotheses,
            negative_hints=negative_hints,
            has_source_refs=bool(source_refs),
            image_source_unverified=image_source_unverified,
        )

        cues.append(
            SemanticCue(
                cueId=f"scue_{_safe_id(slide.slide_id)}_{len(cues) + 1}",
                slideId=slide.slide_id,
                meaning=meaning,
                reportLabel=(cue.report_label.strip() or meaning)[:80],
                presenterTag=(
                    cue.presenter_tag.strip() or cue.report_label.strip() or meaning
                )[:40],
                cueType=cue.cue_type,
                importance=importance,
                sourceDeckVersion=source_deck_version,
                sourceRefs=source_refs,
                qualityWarnings=list(warnings),
                required=required,
                priority=priority,
                candidateKeywords=candidate_keywords,
                aliases=aliases,
                requiredConcepts=required_concepts,
                nliHypotheses=nli_hypotheses,
                negativeHints=negative_hints,
                targetElementIds=target_element_ids,
                triggerActionIds=[
                    action_id
                    for action_id in _compact_texts(
                        cue.trigger_action_ids, max_items=8, max_length=80
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
        "deckVersion": payload.deck.version,
        "audience": payload.deck.metadata.audience,
        "purpose": payload.deck.metadata.purpose,
        "targetDurationMinutes": payload.deck.target_duration_minutes,
        "slides": [
            {
                "slideId": slide.slide_id,
                "title": (
                    ""
                    if _is_generic_imported_title(slide.title)
                    else slide.title.strip()
                ),
                "speakerNotes": slide.speaker_notes.strip(),
                "estimatedSeconds": slide.estimated_seconds,
                "keywords": [
                    {
                        "text": keyword.text.strip(),
                        "synonyms": _compact_texts(
                            keyword.synonyms, max_items=6, max_length=80
                        ),
                        "abbreviations": _compact_texts(
                            keyword.abbreviations, max_items=6, max_length=40
                        ),
                    }
                    for keyword in slide.keywords
                    if _is_meaningful_explicit_keyword(keyword.text)
                ],
                "elements": _ranked_element_inputs(slide)[:32],
                "actionIds": _slide_action_ids(slide)[:24],
            }
            for slide in payload.deck.slides
        ],
    }


def _ranked_element_inputs(slide: SemanticCueSlide) -> list[dict[str, Any]]:
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for index, element in enumerate(slide.elements):
        element_id = _element_id(element)
        if not element_id:
            continue
        element_type = str(element.get("type", "unknown"))
        role = str(element.get("role", ""))
        visible = element.get("visible", True) is not False
        text = _element_text(element).strip()
        structured = _structured_element_content(element)
        if not text and not structured:
            continue
        score = _element_rank_score(
            role=role,
            element_type=element_type,
            visible=visible,
            text=text,
        )
        ranked.append(
            (
                -score,
                index,
                {
                    "elementId": element_id,
                    "sourceId": element_id,
                    "role": role or None,
                    "type": element_type,
                    "visible": visible,
                    "text": text[:1200],
                    **structured,
                },
            )
        )
    return [item for _, _, item in sorted(ranked)]


def _element_rank_score(
    *, role: str, element_type: str, visible: bool, text: str
) -> int:
    score = 200 if visible else -200
    score += {
        "title": 160,
        "subtitle": 130,
        "highlight": 120,
        "table": 110,
        "chart": 105,
        "body": 100,
        "caption": 70,
        "media": 60,
        "footer": -20,
        "decoration": -160,
        "background": -200,
    }.get(role, 0)
    score += {"table": 100, "chart": 90, "text": 70, "image": 30}.get(
        element_type, 0
    )
    score += min(len(text), 400) // 4
    if _is_generic_image_alt(text):
        score -= 120
    return score


def _structured_element_content(element: dict[str, Any]) -> dict[str, Any]:
    element_type = element.get("type")
    props = element.get("props")
    if not isinstance(props, dict):
        return {}
    if element_type == "table":
        cells = [
            str(cell.get("text", "")).strip()
            for row in props.get("rows", [])
            if isinstance(row, list)
            for cell in row
            if isinstance(cell, dict) and str(cell.get("text", "")).strip()
        ]
        return {"sourceKind": "table", "tableCells": cells[:80]}
    if element_type == "chart":
        points = []
        for datum in props.get("data", []):
            if not isinstance(datum, dict):
                continue
            points.append(
                {
                    key: datum[key]
                    for key in ("label", "value", "x", "y")
                    if key in datum
                }
            )
        raw_style = props.get("style")
        style: dict[str, Any] = raw_style if isinstance(raw_style, dict) else {}
        return {
            "sourceKind": "chart",
            "chart": {
                "title": str(props.get("title", "")),
                "type": str(props.get("type", "")),
                "points": points[:80],
                "xAxisTitle": str(style.get("xAxisTitle", "")),
                "yAxisTitle": str(style.get("yAxisTitle", "")),
                "unit": str(style.get("unit", "")),
            },
        }
    if element_type == "image":
        analysis_text = _image_analysis_text(element)
        return {
            "sourceKind": "image-analysis",
            "imageAnalysis": {
                "status": "verified" if analysis_text else "unavailable",
                "text": analysis_text[:1200],
            },
        }
    return {"sourceKind": "element"}


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
        rows = props.get("rows")
        if isinstance(rows, list):
            values.extend(
                str(cell.get("text", ""))
                for row in rows
                if isinstance(row, list)
                for cell in row
                if isinstance(cell, dict)
            )
        data = props.get("data")
        if isinstance(data, list):
            values.extend(
                " ".join(str(datum[key]) for key in ("label", "value", "x", "y") if key in datum)
                for datum in data
                if isinstance(datum, dict)
            )
    return " ".join(value.strip() for value in values if value.strip())


def _source_refs(
    slide: SemanticCueSlide, target_element_ids: list[str]
) -> list[SemanticCueSourceRef]:
    refs: list[SemanticCueSourceRef] = []
    title = slide.title.strip()
    if title and not _is_generic_imported_title(title):
        refs.append(_source_ref("slide-title", slide.slide_id, title))
    notes = slide.speaker_notes.strip()
    if notes:
        refs.append(_source_ref("speaker-notes", slide.slide_id, notes))
    elements_by_id = {_element_id(element): element for element in slide.elements}
    for element_id in target_element_ids:
        element = elements_by_id.get(element_id)
        if element is None:
            continue
        element_type = element.get("type")
        if element_type == "image":
            text = _image_analysis_text(element)
            kind: SemanticCueSourceKind = "image-analysis"
        else:
            text = _element_text(element)
            kind = "table" if element_type == "table" else "chart" if element_type == "chart" else "element"
        if text.strip():
            refs.append(_source_ref(kind, element_id, text))
    return refs[:16]


def _source_ref(
    kind: SemanticCueSourceKind, ref_id: str, text: str
) -> SemanticCueSourceRef:
    return SemanticCueSourceRef(
        kind=kind,
        refId=ref_id,
        sourceHash=hashlib.sha256(_normalize_source(text).encode("utf-8")).hexdigest(),
    )


def _normalize_source(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", value)).strip()


def _image_analysis_text(element: dict[str, Any]) -> str:
    values: list[str] = []
    for container in (element, element.get("props"), element.get("metadata")):
        if not isinstance(container, dict):
            continue
        for key in ("ocrText", "vlmDescription", "imageAnalysis", "analysisText"):
            value = container.get(key)
            if isinstance(value, str) and value.strip():
                values.append(value.strip())
    return " ".join(values)


def _image_source_unverified(slide: SemanticCueSlide) -> bool:
    visible_elements = [
        element for element in slide.elements if element.get("visible", True) is not False
    ]
    images = [element for element in visible_elements if element.get("type") == "image"]
    if not images or any(_image_analysis_text(element) for element in images):
        return False
    has_non_image_content = any(
        element.get("type") != "image"
        and element.get("role") not in {"background", "decoration"}
        and bool(_element_text(element).strip())
        for element in visible_elements
    )
    title = slide.title.strip()
    has_title = bool(title) and not _is_generic_imported_title(title)
    return not has_title and not slide.speaker_notes.strip() and not has_non_image_content


def _slide_is_content_rich(slide: SemanticCueSlide) -> bool:
    return is_content_rich(
        slide.title,
        slide.speaker_notes,
        *(_element_text(element) for element in slide.elements),
    )


def _compatibility_fields(
    importance: SemanticCueImportance,
) -> tuple[bool, Literal[1, 2, 3]]:
    if importance == "core":
        return True, 1
    if importance == "optional":
        return False, 3
    return False, 2


def _result_warnings(result: SemanticCueExtractionResponse) -> list[str]:
    return _dedupe(
        [
            *(
                warning
                for slide in result.slides
                for warning in slide.warnings
            ),
            *(
                warning
                for slide in result.slides
                for cue in slide.semantic_cues
                for warning in cue.quality_warnings
            ),
        ]
    )


def _result_quality_details(
    result: SemanticCueExtractionResponse,
) -> list[dict[str, Any]]:
    details: list[dict[str, Any]] = []
    for slide in result.slides:
        for cue_index, cue in enumerate(slide.semantic_cues):
            if not cue.quality_warnings:
                continue
            details.append(
                {
                    "slideId": slide.slide_id,
                    "cueIndex": cue_index,
                    "meaning": cue.meaning,
                    "warnings": cue.quality_warnings,
                }
            )
    return details


def _result_warning_score(result: SemanticCueExtractionResponse) -> int:
    weights = {
        "inconsistent-numeric-claim": 8,
        "hypothesis-missing-required-concept": 5,
        "weak-negative-hint": 5,
        "missing-technical-alias": 3,
        "broad-cue": 3,
        "slide-centric-hypothesis": 3,
        "content-rich-slide-too-few-cues": 2,
        "all-cues-priority-one": 1,
    }
    warnings = [
        warning
        for slide in result.slides
        for warning in [
            *slide.warnings,
            *(warning for cue in slide.semantic_cues for warning in cue.quality_warnings),
        ]
    ]
    return sum(weights.get(warning, 1) for warning in warnings)


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


def _is_generic_image_alt(value: str) -> bool:
    return bool(re.fullmatch(r"(?:image|picture|photo|이미지|사진)\s*\d*", value.strip(), re.I))


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


def _safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value.removeprefix("slide_")) or "slide"
