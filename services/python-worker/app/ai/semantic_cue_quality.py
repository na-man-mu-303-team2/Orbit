from __future__ import annotations

import re
from typing import Literal


SemanticCueQualityWarning = Literal[
    "broad-cue",
    "missing-technical-alias",
    "slide-centric-hypothesis",
    "hypothesis-missing-required-concept",
    "weak-negative-hint",
    "ungrounded-source",
    "image-source-unverified",
    "all-cues-priority-one",
    "content-rich-slide-too-few-cues",
    "ambiguous-cue-identity",
]


def cue_quality_warnings(
    *,
    meaning: str,
    candidate_keywords: list[str],
    aliases: dict[str, list[str]],
    required_concepts: list[str],
    hypotheses: list[str],
    negative_hints: list[str],
    has_source_refs: bool,
    image_source_unverified: bool,
) -> list[SemanticCueQualityWarning]:
    warnings: list[SemanticCueQualityWarning] = []
    if _looks_broad(meaning, hypotheses):
        warnings.append("broad-cue")
    if _missing_technical_alias(
        [*candidate_keywords, *required_concepts], aliases
    ):
        warnings.append("missing-technical-alias")
    if any(not _is_speaker_centric(hypothesis) for hypothesis in hypotheses):
        warnings.append("slide-centric-hypothesis")
    if any(
        not _hypothesis_covers_required_concepts(
            hypothesis, required_concepts, aliases
        )
        for hypothesis in hypotheses
    ):
        warnings.append("hypothesis-missing-required-concept")
    if any(not _is_speaker_centric(hint) for hint in negative_hints):
        warnings.append("weak-negative-hint")
    if not has_source_refs:
        warnings.append("ungrounded-source")
    if image_source_unverified:
        warnings.append("image-source-unverified")
    return warnings


def slide_quality_warnings(
    *,
    cue_count: int,
    all_core: bool,
    content_rich: bool,
) -> list[SemanticCueQualityWarning]:
    warnings: list[SemanticCueQualityWarning] = []
    if cue_count > 1 and all_core:
        warnings.append("all-cues-priority-one")
    if content_rich and cue_count < 2:
        warnings.append("content-rich-slide-too-few-cues")
    return warnings


def should_retry_quality(warnings: list[str]) -> bool:
    return any(
        warning
        in {
            "broad-cue",
            "missing-technical-alias",
            "slide-centric-hypothesis",
            "hypothesis-missing-required-concept",
            "weak-negative-hint",
            "all-cues-priority-one",
            "content-rich-slide-too-few-cues",
        }
        for warning in warnings
    )


def is_content_rich(*texts: str) -> bool:
    normalized = " ".join(text.strip() for text in texts if text.strip())
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9_-]+|[가-힣]{2,}", normalized)
    return len(normalized) >= 80 or len(tokens) >= 12


def is_optional_slide(title: str, cue_type: str | None) -> bool:
    if cue_type in {"transition", "closing"}:
        return True
    return bool(
        re.search(
            r"(?:^|\s)(?:agenda|q\s*&\s*a|questions?|thank\s+you|목차|순서|질문|질의응답|감사)(?:\s|$)",
            title,
            flags=re.IGNORECASE,
        )
    )


def _looks_broad(meaning: str, hypotheses: list[str]) -> bool:
    combined = " ".join([meaning, *hypotheses])
    connectors = re.findall(
        r"그리고|또한|동시에|뿐만 아니라|원인.{0,20}(?:해결|결과)|문제.{0,20}(?:해결|성과)",
        combined,
    )
    semantic_verbs = re.findall(
        r"설명|정의|비교|제시|강조|증명|분석|예측|해결|초래|개선",
        combined,
    )
    return bool(connectors) and len(set(semantic_verbs)) >= 2


def _missing_technical_alias(
    candidate_keywords: list[str], aliases: dict[str, list[str]]
) -> bool:
    alias_terms = {
        term.casefold()
        for canonical, values in aliases.items()
        if values
        for term in (canonical, *values)
    }
    return any(
        _is_technical_term(keyword) and keyword.casefold() not in alias_terms
        for keyword in candidate_keywords
    )


def _is_technical_term(value: str) -> bool:
    return bool(
        re.search(r"\b[A-Z][A-Z0-9]{1,}\b", value)
        or re.search(r"[a-z]+_[a-z0-9_]+|[a-z]+[A-Z][A-Za-z0-9]*|\w+\(\)", value)
        or re.fullmatch(
            r"[A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*)+",
            value.strip(),
        )
        or (re.search(r"[A-Za-z]{3,}", value) and re.search(r"[가-힣]", value))
    )


def _is_speaker_centric(hypothesis: str) -> bool:
    normalized = hypothesis.strip()
    return not normalized.startswith("이 슬라이드는") and bool(
        re.match(r"발표자(?:는|가|께서는)\s+.+", normalized)
    )


def _hypothesis_covers_required_concepts(
    hypothesis: str,
    required_concepts: list[str],
    aliases: dict[str, list[str]],
) -> bool:
    if not required_concepts:
        return True
    normalized_hypothesis = _normalize_for_coverage(hypothesis)
    covered = 0
    for concept in required_concepts:
        terms = [concept, *aliases.get(concept, [])]
        if any(
            _term_has_distinctive_overlap(normalized_hypothesis, term)
            for term in terms
        ):
            covered += 1
    return covered / len(required_concepts) >= 0.8


def _term_has_distinctive_overlap(hypothesis: str, term: str) -> bool:
    normalized_term = _normalize_for_coverage(term)
    if normalized_term and normalized_term in hypothesis:
        return True
    tokens = [
        token
        for token in re.findall(r"[a-z0-9_-]{2,}|[가-힣]{2,}", normalized_term)
        if token not in _GENERIC_CONCEPT_TOKENS
    ]
    return bool(tokens) and any(token in hypothesis for token in tokens)


def _normalize_for_coverage(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


_GENERIC_CONCEPT_TOKENS = {
    "결과",
    "관계",
    "도입",
    "문제",
    "방식",
    "설명",
    "원인",
    "의미",
    "이유",
    "필요",
    "효과",
    "개선",
}
