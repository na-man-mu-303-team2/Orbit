from __future__ import annotations

import re
from typing import Literal


SemanticCueQualityWarning = Literal[
    "broad-cue",
    "missing-technical-alias",
    "slide-centric-hypothesis",
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
    hypotheses: list[str],
    has_source_refs: bool,
    image_source_unverified: bool,
) -> list[SemanticCueQualityWarning]:
    warnings: list[SemanticCueQualityWarning] = []
    if _looks_broad(meaning, hypotheses):
        warnings.append("broad-cue")
    if _missing_technical_alias(candidate_keywords, aliases):
        warnings.append("missing-technical-alias")
    if any(not _is_speaker_centric(hypothesis) for hypothesis in hypotheses):
        warnings.append("slide-centric-hypothesis")
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
    alias_terms = {term.casefold() for term, values in aliases.items() if values}
    return any(
        _is_technical_term(keyword) and keyword.casefold() not in alias_terms
        for keyword in candidate_keywords
    )


def _is_technical_term(value: str) -> bool:
    return bool(
        re.search(r"\b[A-Z][A-Z0-9]{1,}\b", value)
        or re.search(r"[a-z]+_[a-z0-9_]+|[a-z]+[A-Z][A-Za-z0-9]*|\w+\(\)", value)
        or (re.search(r"[A-Za-z]{3,}", value) and re.search(r"[가-힣]", value))
    )


def _is_speaker_centric(hypothesis: str) -> bool:
    normalized = hypothesis.strip()
    return not normalized.startswith("이 슬라이드는") and bool(
        re.match(r"발표자(?:는|가|께서는)\s+.+", normalized)
    )
