from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import TypeAdapter

from app.ai.composition_library import CompiledComposition
from app.ai.design_agent import DesignAgentOperation
from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from app.ai.slide_redesign.diff import (
    analyze_candidate,
    build_operations,
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


def compiled_text_element(
    element_id: str,
    text: str,
    *,
    content_item_ids: list[str] | None = None,
    x: int = 120,
) -> dict[str, Any]:
    element = text_element(
        element_id,
        text,
        content_item_ids=content_item_ids,
    )
    element.update(
        {
            "role": "body",
            "x": x,
            "y": 200,
            "width": 600,
            "height": 120,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 3,
            "visible": True,
        }
    )
    element["props"].update(
        {
            "fontFamily": "Pretendard",
            "fontSize": 32,
            "fontWeight": "normal",
            "color": "#111827",
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.2,
        }
    )
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


def test_one_to_many_without_references_is_safe_when_text_is_preserved() -> None:
    summary = slide_summary("process", ["첫째", "둘째", "셋째"])
    candidate = CompositionCandidate("process-horizontal", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
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
        constraints(),
    )

    assert analysis.safe is True
    assert analysis.unsafe_reason is None


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


def test_many_to_one_without_references_is_safe_when_text_is_preserved() -> None:
    summary = slide_summary("data", ["성장 10%", "유지 20%"])
    candidate = CompositionCandidate("metric-poster", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )

    analysis = analyze_candidate(
        summary,
        {"item-1": "el_a", "item-2": "el_b"},
        {
            "elements": [
                text_element("el_a", "성장 10%"),
                text_element("el_b", "유지 20%"),
            ]
        },
        candidate,
        program,
        constraints(),
    )

    assert analysis.safe is True
    assert analysis.unsafe_reason is None


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


def test_build_operations_orders_deletes_last_and_never_updates_text() -> None:
    originals = [
        text_element("el_reused", "원문"),
        text_element("el_deleted", "삭제 가능"),
    ]
    compiled_element = compiled_text_element("new_reused", "원문")
    compiled = CompiledComposition(
        elements=[compiled_element],
        primary_focal_element_id="new_reused",
        layout="title-content",
        background_color="#FFFFFF",
    )
    matching = match_elements(originals, [compiled_element], {})

    operations = build_operations("slide-1", originals, compiled, matching)

    operation_types = [operation["type"] for operation in operations]
    assert operation_types == [
        "update_slide_style",
        "update_element_frame",
        "update_element_props",
        "delete_element",
    ]
    delete_index = operation_types.index("delete_element")
    assert all(
        operation["type"] == "delete_element"
        for operation in operations[delete_index:]
    )
    props_operation = next(
        operation
        for operation in operations
        if operation["type"] == "update_element_props"
    )
    assert "text" not in props_operation["props"]


def test_added_elements_remove_internal_provenance() -> None:
    compiled_element = compiled_text_element(
        "new_added",
        "새 요소",
        content_item_ids=["item-1"],
    )
    compiled = CompiledComposition(
        elements=[compiled_element],
        primary_focal_element_id="new_added",
        layout="title-content",
        background_color="#FFFFFF",
    )

    operations = build_operations(
        "slide-1",
        [],
        compiled,
        match_elements([], [compiled_element], {"item-1": "missing"}),
    )

    added = next(
        operation["element"]
        for operation in operations
        if operation["type"] == "add_element"
    )
    assert "_contentItemIds" not in added


def test_added_element_id_collision_uses_r2_suffix() -> None:
    originals = [text_element("el_collision", "기존 요소")]
    compiled_element = compiled_text_element("el_collision", "새 요소")
    compiled = CompiledComposition(
        elements=[compiled_element],
        primary_focal_element_id="el_collision",
        layout="title-content",
        background_color="#FFFFFF",
    )
    matching = match_elements(originals, [compiled_element], {})

    operations = build_operations("slide-1", originals, compiled, matching)

    added = next(
        operation["element"]
        for operation in operations
        if operation["type"] == "add_element"
    )
    assert added["elementId"] == "el_collision_r2"


def test_real_composition_patch_round_trips_to_compiled_layout() -> None:
    summary = slide_summary("process", ["첫째 10%", "둘째 20%", "셋째 30%"])
    candidate = CompositionCandidate("process-horizontal", "light")
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "light"),
        candidate,
    )
    compiled = compile_redesign(summary, candidate, program)
    originals: list[dict[str, Any]] = []
    provenance: dict[str, str] = {}
    expected_ids: dict[str, str] = {}
    for index, element in enumerate(compiled.elements, start=1):
        if element.get("type") != "text":
            continue
        original = deepcopy(element)
        compiled_id = str(element["elementId"])
        original_id = f"el_original_{index}"
        original["elementId"] = original_id
        original.pop("_contentItemIds", None)
        original["x"] = 0
        original["y"] = 0
        original["width"] = 100
        original["height"] = 50
        original["props"]["fontSize"] = 12
        original["props"]["color"] = "#000000"
        originals.append(original)
        expected_ids[compiled_id] = original_id
        content_item_ids = element.get("_contentItemIds", [])
        for content_item_id in content_item_ids:
            provenance[str(content_item_id)] = original_id

    matching = match_elements(originals, compiled.elements, provenance)
    operations = build_operations("slide-1", originals, compiled, matching)

    operation_adapter = TypeAdapter(DesignAgentOperation)
    for operation in operations:
        operation_adapter.validate_python(operation)
    applied = apply_operations(originals, operations)

    expected: dict[str, dict[str, Any]] = {}
    for element in compiled.elements:
        clean = deepcopy(element)
        clean.pop("_contentItemIds", None)
        clean["elementId"] = expected_ids.get(
            str(element["elementId"]),
            str(element["elementId"]),
        )
        expected[str(clean["elementId"])] = clean
    assert {str(element["elementId"]): element for element in applied} == expected


def apply_operations(
    original_elements: list[dict[str, Any]],
    operations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    elements = deepcopy(original_elements)
    for operation in operations:
        operation_type = operation["type"]
        if operation_type == "update_slide_style":
            continue
        if operation_type == "add_element":
            elements.append(deepcopy(operation["element"]))
            continue
        element_id = operation["elementId"]
        if operation_type == "delete_element":
            elements = [
                element for element in elements if element["elementId"] != element_id
            ]
            continue
        element = next(
            element for element in elements if element["elementId"] == element_id
        )
        if operation_type == "update_element_frame":
            element.update(deepcopy(operation["frame"]))
        elif operation_type == "update_element_props":
            element["props"].update(deepcopy(operation["props"]))
    return elements
