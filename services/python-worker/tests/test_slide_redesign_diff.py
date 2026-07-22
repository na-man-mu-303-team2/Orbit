from __future__ import annotations

from typing import Any

from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
)
from app.ai.slide_redesign.diff import (
    analyze_candidate,
    filter_safe_candidates,
    match_elements,
)
from app.ai.slide_redesign.palette import derive_palette
from app.ai.slide_redesign.safety import ElementConstraints


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


def slide_summary(slide_type: str, items: list[str]) -> dict[str, Any]:
    return {
        "title": "제목",
        "message": "핵심 메시지",
        "slideType": slide_type,
        "contentItems": [
            {"contentItemId": f"item-{index}", "text": text}
            for index, text in enumerate(items, start=1)
        ],
    }


def constraints(*, referenced: set[str] | None = None) -> ElementConstraints:
    return ElementConstraints(
        referenced_element_ids=frozenset(referenced or set()),
        locked_element_ids=frozenset(),
        grouped_element_ids=frozenset(),
        ooxml_element_ids=frozenset(),
    )


THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#2563EB",
}


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


def test_one_to_many_with_animation_reference_is_unsafe() -> None:
    summary = slide_summary("process", ["첫째", "둘째", "셋째"])
    candidate = CompositionCandidate("process-horizontal", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )
    slide = {
        "elements": [
            text_element("el_body", "첫째 둘째"),
            text_element("el_other", "셋째"),
        ]
    }

    analysis = analyze_candidate(
        summary,
        {
            "item-1": "el_body",
            "item-2": "el_body",
            "item-3": "el_other",
        },
        slide,
        candidate,
        program,
        constraints(referenced={"el_body"}),
    )

    assert analysis.safe is False
    assert analysis.unsafe_reason == "constrained-element:el_body"


def test_many_to_one_with_semantic_reference_is_unsafe() -> None:
    summary = slide_summary("data", ["성장 10%", "유지 20%"])
    candidate = CompositionCandidate("metric-poster", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )
    slide = {
        "elements": [
            text_element("el_a", "성장 10%"),
            text_element("el_b", "유지 20%"),
        ]
    }

    analysis = analyze_candidate(
        summary,
        {"item-1": "el_a", "item-2": "el_b"},
        slide,
        candidate,
        program,
        constraints(referenced={"el_a"}),
    )

    assert analysis.safe is False
    assert analysis.unsafe_reason == "constrained-element:el_a"


def test_one_to_many_that_shortens_source_text_is_unsafe() -> None:
    summary = slide_summary("process", ["첫째", "둘째", "넷째"])
    candidate = CompositionCandidate("process-horizontal", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )
    slide = {
        "elements": [
            text_element("el_body", "첫째 둘째 셋째"),
            text_element("el_other", "넷째"),
        ]
    }

    analysis = analyze_candidate(
        summary,
        {
            "item-1": "el_body",
            "item-2": "el_body",
            "item-3": "el_other",
        },
        slide,
        candidate,
        program,
        constraints(),
    )

    assert analysis.safe is False
    assert analysis.unsafe_reason == "text-not-preserved:el_body"


def test_group_member_that_requires_replacement_is_unsafe() -> None:
    summary = slide_summary("process", ["첫째", "둘째", "셋째"])
    candidate = CompositionCandidate("timeline", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )
    grouped_constraints = ElementConstraints(
        referenced_element_ids=frozenset(),
        locked_element_ids=frozenset(),
        grouped_element_ids=frozenset({"el_body"}),
        ooxml_element_ids=frozenset(),
    )

    analysis = analyze_candidate(
        summary,
        {
            "item-1": "el_body",
            "item-2": "el_body",
            "item-3": "el_other",
        },
        {
            "elements": [
                text_element("el_body", "첫째 둘째"),
                text_element("el_other", "셋째"),
            ]
        },
        candidate,
        program,
        grouped_constraints,
    )

    assert analysis.safe is False
    assert analysis.unsafe_reason == "constrained-element:el_body"


def test_filter_safe_candidates_keeps_safe_alternative() -> None:
    summary = slide_summary("solution", ["Alpha", "Beta"])
    slide = {
        "elements": [
            text_element("el_a", "Alpha"),
            text_element("el_b", "Beta"),
        ]
    }
    candidates = [
        CompositionCandidate("statement-poster", "light"),
        CompositionCandidate("editorial-split", "light"),
    ]

    safe = filter_safe_candidates(
        summary,
        {"item-1": "el_a", "item-2": "el_b"},
        slide,
        candidates,
        THEME,
        constraints(referenced={"el_a"}),
    )

    assert [analysis.candidate.composition_id for analysis in safe] == [
        "editorial-split"
    ]


def test_filter_safe_candidates_returns_empty_when_all_are_unsafe() -> None:
    summary = slide_summary("solution", ["Alpha", "Beta"])
    slide = {
        "elements": [
            text_element("el_a", "Alpha"),
            text_element("el_b", "Beta"),
        ]
    }

    safe = filter_safe_candidates(
        summary,
        {"item-1": "el_a", "item-2": "el_b"},
        slide,
        [CompositionCandidate("statement-poster", "light")],
        THEME,
        constraints(referenced={"el_a"}),
    )

    assert safe == []
