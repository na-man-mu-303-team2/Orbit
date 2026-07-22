from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .safety import normalize_text


@dataclass(frozen=True)
class ElementMatching:
    reused: dict[str, str]
    added: list[str]
    deleted: list[str]
    irreversible: list[str]


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
