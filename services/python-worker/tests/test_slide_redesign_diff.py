from __future__ import annotations

from typing import Any

from app.ai.slide_redesign.diff import match_elements


def text_element(
    element_id: str,
    text: str,
    *,
    content_item_ids: list[str] | None = None,
    locked: bool = False,
) -> dict[str, Any]:
    element: dict[str, Any] = {
        "elementId": element_id,
        "type": "text",
        "locked": locked,
        "props": {"text": text},
    }
    if content_item_ids is not None:
        element["_contentItemIds"] = content_item_ids
    return element


def test_matches_three_source_elements_one_to_one() -> None:
    originals = [
        text_element("el_a", "Alpha"),
        text_element("el_b", "Beta"),
        text_element("el_c", "Gamma"),
    ]
    compiled = [
        text_element("new_a", "Alpha", content_item_ids=["item-a"]),
        text_element("new_b", "Beta", content_item_ids=["item-b"]),
        text_element("new_c", "Gamma", content_item_ids=["item-c"]),
    ]

    matching = match_elements(
        originals,
        compiled,
        {"item-a": "el_a", "item-b": "el_b", "item-c": "el_c"},
    )

    assert matching.reused == {
        "new_a": "el_a",
        "new_b": "el_b",
        "new_c": "el_c",
    }
    assert matching.added == []
    assert matching.deleted == []
    assert matching.irreversible == []


def test_split_segments_are_one_to_many_by_source_element_id() -> None:
    originals = [text_element("el_body", "첫째 둘째")]
    compiled = [
        text_element("new_1", "첫째", content_item_ids=["segment-1"]),
        text_element("new_2", "둘째", content_item_ids=["segment-2"]),
    ]

    matching = match_elements(
        originals,
        compiled,
        {"segment-1": "el_body", "segment-2": "el_body"},
    )

    assert matching.reused == {}
    assert matching.added == ["new_1", "new_2"]
    assert matching.deleted == ["el_body"]
    assert matching.irreversible == ["el_body"]


def test_multiple_sources_merged_into_one_are_irreversible() -> None:
    originals = [
        text_element("el_a", "Alpha"),
        text_element("el_b", "Beta"),
    ]
    compiled = [
        text_element(
            "new_merged",
            "Alpha Beta",
            content_item_ids=["item-a", "item-b"],
        )
    ]

    matching = match_elements(
        originals,
        compiled,
        {"item-a": "el_a", "item-b": "el_b"},
    )

    assert matching.reused == {}
    assert matching.added == ["new_merged"]
    assert matching.deleted == ["el_a", "el_b"]
    assert matching.irreversible == ["el_a", "el_b"]


def test_duplicate_exact_text_matches_each_original_once() -> None:
    originals = [
        text_element("el_first", "같은 문구"),
        text_element("el_second", "같은 문구"),
    ]
    compiled = [
        text_element("new_first", "같은 문구"),
        text_element("new_second", "같은 문구"),
    ]

    matching = match_elements(originals, compiled, {})

    assert matching.reused == {
        "new_first": "el_first",
        "new_second": "el_second",
    }
    assert len(set(matching.reused.values())) == 2


def test_locked_elements_are_not_matched_or_deleted() -> None:
    originals = [text_element("el_locked", "보존", locked=True)]
    compiled = [text_element("new_text", "보존")]

    matching = match_elements(originals, compiled, {})

    assert matching.reused == {}
    assert matching.added == ["new_text"]
    assert matching.deleted == []
    assert matching.irreversible == []
