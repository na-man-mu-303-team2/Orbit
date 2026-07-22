from __future__ import annotations

from copy import deepcopy
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.ai.composition_library import CompiledComposition, CompositionCompileError
from app.ai.design_program import DeckDesignProgram

from .composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from .palette import derive_palette
from .safety import ElementConstraints, can_replace, normalize_text, text_preserved


@dataclass(frozen=True)
class ElementMatching:
    reused: dict[str, str]
    added: list[str]
    deleted: list[str]
    irreversible: list[str]


@dataclass(frozen=True)
class CandidateAnalysis:
    candidate: CompositionCandidate
    compiled: CompiledComposition
    matching: ElementMatching
    safe: bool
    unsafe_reason: str | None


_FRAME_KEYS = (
    "role",
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "opacity",
    "zIndex",
    "locked",
    "visible",
)
_PATCHABLE_PROP_KEYS = frozenset(
    {
        "align",
        "verticalAlign",
        "fontSize",
        "fontWeight",
        "fontFamily",
        "fill",
        "color",
        "stroke",
        "strokeWidth",
        "borderRadius",
        "lineHeight",
        "cornerRadius",
        "fit",
    }
)


def analyze_candidate(
    summary: dict[str, Any],
    provenance: dict[str, str],
    slide: dict[str, Any],
    candidate: CompositionCandidate,
    program: DeckDesignProgram,
    constraints: ElementConstraints,
) -> CandidateAnalysis:
    """Compile one candidate and reject replacements that lose references or text."""
    compiled = compile_redesign(summary, candidate, program)
    original_elements = _elements(slide)
    matching = match_elements(original_elements, compiled.elements, provenance)
    unsafe_reason = _unsafe_reason(
        original_elements,
        compiled.elements,
        provenance,
        matching,
        constraints,
    )
    return CandidateAnalysis(
        candidate=candidate,
        compiled=compiled,
        matching=matching,
        safe=unsafe_reason is None,
        unsafe_reason=unsafe_reason,
    )


def filter_safe_candidates(
    summary: dict[str, Any],
    provenance: dict[str, str],
    slide: dict[str, Any],
    candidates: list[CompositionCandidate],
    theme: dict[str, Any],
    constraints: ElementConstraints,
) -> list[CandidateAnalysis]:
    """Compile candidates deterministically and retain only safe analyses."""
    safe_analyses: list[CandidateAnalysis] = []
    for candidate in candidates:
        roles = derive_palette(theme, candidate.background_mode)
        program = build_single_slide_program(theme, roles, candidate)
        try:
            analysis = analyze_candidate(
                summary,
                provenance,
                slide,
                candidate,
                program,
                constraints,
            )
        except CompositionCompileError:
            continue
        if analysis.safe:
            safe_analyses.append(analysis)
    return safe_analyses


def build_operations(
    slide_id: str,
    original_elements: list[dict[str, Any]],
    compiled: CompiledComposition,
    matching: ElementMatching,
) -> list[dict[str, Any]]:
    """Build ordered Deck patch operations without changing reused text."""
    compiled_by_id = {
        str(element["elementId"]): element
        for element in compiled.elements
        if isinstance(element.get("elementId"), str) and element["elementId"]
    }
    operations: list[dict[str, Any]] = [
        {
            "type": "update_slide_style",
            "slideId": slide_id,
            "style": {"backgroundColor": compiled.background_color},
        }
    ]
    for compiled_id, original_id in matching.reused.items():
        element = compiled_by_id[compiled_id]
        frame = {key: element[key] for key in _FRAME_KEYS if key in element}
        operations.append(
            {
                "type": "update_element_frame",
                "slideId": slide_id,
                "elementId": original_id,
                "frame": frame,
            }
        )
    for compiled_id, original_id in matching.reused.items():
        element = compiled_by_id[compiled_id]
        raw_props = element.get("props")
        props = raw_props if isinstance(raw_props, dict) else {}
        patch = {
            key: deepcopy(value)
            for key, value in props.items()
            if key in _PATCHABLE_PROP_KEYS
        }
        if patch:
            operations.append(
                {
                    "type": "update_element_props",
                    "slideId": slide_id,
                    "elementId": original_id,
                    "props": patch,
                }
            )

    reserved_ids = {
        str(element["elementId"])
        for element in original_elements
        if isinstance(element.get("elementId"), str) and element["elementId"]
    }
    for compiled_id in matching.added:
        element = deepcopy(compiled_by_id[compiled_id])
        element.pop("_contentItemIds", None)
        element["elementId"] = _unique_element_id(compiled_id, reserved_ids)
        reserved_ids.add(str(element["elementId"]))
        operations.append(
            {
                "type": "add_element",
                "slideId": slide_id,
                "element": element,
            }
        )
    operations.extend(
        {
            "type": "delete_element",
            "slideId": slide_id,
            "elementId": original_id,
        }
        for original_id in matching.deleted
    )
    return operations


def match_elements(
    original_elements: list[dict[str, Any]],
    compiled_elements: list[dict[str, Any]],
    provenance: dict[str, str],
) -> ElementMatching:
    """Match compiled elements by original source cardinality, then exact text."""
    original_by_id = {
        str(element["elementId"]): element
        for element in original_elements
        if isinstance(element.get("elementId"), str)
        and element["elementId"]
        and element.get("locked") is not True
    }
    compiled_by_id = {
        str(element["elementId"]): element
        for element in compiled_elements
        if isinstance(element.get("elementId"), str) and element["elementId"]
    }
    source_ids_by_compiled: dict[str, set[str]] = {}
    targets_by_source: dict[str, list[str]] = defaultdict(list)
    for compiled_id, element in compiled_by_id.items():
        content_item_ids = element.get("_contentItemIds")
        item_ids = content_item_ids if isinstance(content_item_ids, list) else []
        source_ids = {
            source_id
            for content_item_id in item_ids
            if isinstance(content_item_id, str)
            and (source_id := provenance.get(content_item_id)) in original_by_id
        }
        source_ids_by_compiled[compiled_id] = source_ids
        for source_id in source_ids:
            targets_by_source[source_id].append(compiled_id)

    irreversible_ids: set[str] = set()
    irreversible_compiled_ids: set[str] = set()
    for compiled_id, source_ids in source_ids_by_compiled.items():
        if len(source_ids) >= 2:
            irreversible_ids.update(source_ids)
            irreversible_compiled_ids.add(compiled_id)
    for source_id, target_ids in targets_by_source.items():
        if len(target_ids) >= 2:
            irreversible_ids.add(source_id)
            irreversible_compiled_ids.update(target_ids)

    reused: dict[str, str] = {}
    used_original_ids: set[str] = set()
    for compiled_id, source_ids in source_ids_by_compiled.items():
        if compiled_id in irreversible_compiled_ids or len(source_ids) != 1:
            continue
        source_id = next(iter(source_ids))
        if len(targets_by_source[source_id]) != 1:
            continue
        reused[compiled_id] = source_id
        used_original_ids.add(source_id)

    original_text_ids: dict[str, list[str]] = defaultdict(list)
    for original_id, element in original_by_id.items():
        if original_id in used_original_ids or element.get("type") != "text":
            continue
        text = _element_text(element)
        normalized = normalize_text(text)
        if normalized:
            original_text_ids[normalized].append(original_id)

    for compiled_id, element in compiled_by_id.items():
        if compiled_id in reused or source_ids_by_compiled[compiled_id]:
            continue
        if element.get("type") != "text":
            continue
        normalized = normalize_text(_element_text(element))
        matching_ids = original_text_ids.get(normalized, [])
        if not matching_ids:
            continue
        original_id = matching_ids.pop(0)
        reused[compiled_id] = original_id
        used_original_ids.add(original_id)

    return ElementMatching(
        reused=reused,
        added=[
            compiled_id
            for compiled_id in compiled_by_id
            if compiled_id not in reused
        ],
        deleted=[
            original_id
            for original_id in original_by_id
            if original_id not in used_original_ids
        ],
        irreversible=[
            original_id
            for original_id in original_by_id
            if original_id in irreversible_ids
        ],
    )


def _element_text(element: dict[str, Any]) -> str:
    props = element.get("props")
    if not isinstance(props, dict):
        return ""
    text = props.get("text")
    return text if isinstance(text, str) else ""


def _elements(slide: dict[str, Any]) -> list[dict[str, Any]]:
    elements = slide.get("elements")
    if not isinstance(elements, list):
        return []
    return [element for element in elements if isinstance(element, dict)]


def _unsafe_reason(
    original_elements: list[dict[str, Any]],
    compiled_elements: list[dict[str, Any]],
    provenance: dict[str, str],
    matching: ElementMatching,
    constraints: ElementConstraints,
) -> str | None:
    for original_id in matching.deleted:
        if not can_replace(original_id, constraints):
            return f"constrained-element:{original_id}"

    originals_by_id = {
        str(element["elementId"]): element
        for element in original_elements
        if isinstance(element.get("elementId"), str) and element["elementId"]
    }
    for original_id in matching.irreversible:
        original = originals_by_id.get(original_id)
        if original is None or original.get("type") != "text":
            continue
        target_texts = [
            _element_text(element)
            for element in compiled_elements
            if original_id in _source_ids(element, provenance)
        ]
        if not text_preserved(_element_text(original), target_texts):
            return f"text-not-preserved:{original_id}"
    return None


def _source_ids(element: dict[str, Any], provenance: dict[str, str]) -> set[str]:
    content_item_ids = element.get("_contentItemIds")
    if not isinstance(content_item_ids, list):
        return set()
    return {
        source_id
        for content_item_id in content_item_ids
        if isinstance(content_item_id, str)
        and isinstance((source_id := provenance.get(content_item_id)), str)
    }


def _unique_element_id(element_id: str, reserved_ids: set[str]) -> str:
    if element_id not in reserved_ids:
        return element_id
    suffix = 2
    while f"{element_id}_r{suffix}" in reserved_ids:
        suffix += 1
    return f"{element_id}_r{suffix}"
