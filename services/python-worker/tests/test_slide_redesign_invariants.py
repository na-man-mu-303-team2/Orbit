from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest

from app.ai.design_agent import DesignAgentRequest, generate_design_proposal
from app.ai.slide_redesign.composer import CompositionCandidate
from app.ai.slide_redesign.diff import filter_safe_candidates, match_elements
from app.ai.slide_redesign.pipeline import redesign_slide
from app.ai.slide_redesign.safety import ElementConstraints, normalize_text
from app.ai.slide_redesign.slide_extractor import (
    collect_text_elements,
    extract_slide,
    infer_hierarchy,
    split_bullets,
)


FIXTURE_PATH = (
    Path(__file__).parent / "fixtures/slide_redesign/m1-golden.json"
)
M1_FIXTURES: list[dict[str, Any]] = json.loads(
    FIXTURE_PATH.read_text(encoding="utf-8")
)
THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#2563EB",
}


def deck_element(spec: dict[str, Any], index: int) -> dict[str, Any]:
    element_type = str(spec["type"])
    if element_type == "text":
        role = str(spec.get("role", "body"))
        return {
            "elementId": spec["elementId"],
            "type": "text",
            "role": role,
            "x": 120,
            "y": 100 + index * 150,
            "width": 1500,
            "height": 120,
            "rotation": 0,
            "opacity": 1,
            "zIndex": index + 1,
            "locked": bool(spec.get("locked", False)),
            "visible": True,
            "props": {
                "text": spec["text"],
                "fontFamily": "Pretendard",
                "fontSize": 48 if role == "title" else 28,
                "fontWeight": "bold" if role == "title" else "normal",
                "color": "#111827",
                "align": "left",
                "verticalAlign": "top",
                "lineHeight": 1.2,
            },
        }
    if element_type == "rect":
        return {
            "elementId": spec["elementId"],
            "type": "rect",
            "role": "decoration",
            "x": 1400,
            "y": 900,
            "width": 160,
            "height": 60,
            "rotation": 0,
            "opacity": 1,
            "zIndex": index + 1,
            "locked": bool(spec.get("locked", False)),
            "visible": True,
            "props": {
                "fill": "#E5E7EB",
                "stroke": "transparent",
                "strokeWidth": 0,
                "borderRadius": 0,
            },
        }
    if element_type == "image":
        return {
            "elementId": spec["elementId"],
            "type": "image",
            "role": "media",
            "x": 1040,
            "y": 220,
            "width": 720,
            "height": 540,
            "rotation": 0,
            "opacity": 1,
            "zIndex": index + 1,
            "locked": bool(spec.get("locked", False)),
            "visible": True,
            "props": {
                "src": "https://example.com/product.png",
                "alt": "제품 이미지",
                "fit": "contain",
                "focusX": 0.5,
                "focusY": 0.5,
            },
        }
    return {
        "elementId": spec["elementId"],
        "type": element_type,
        "locked": bool(spec.get("locked", False)),
        "visible": True,
    }


def fixture_request(fixture: dict[str, Any]) -> DesignAgentRequest:
    canvas = fixture.get("canvas", {"width": 1920, "height": 1080})
    elements = [
        deck_element(spec, index)
        for index, spec in enumerate(fixture["elements"])
    ]
    return DesignAgentRequest.model_validate(
        {
            "projectId": "project-m1",
            "sessionId": f"session-{fixture['id']}",
            "question": "이 슬라이드를 예쁘게 재디자인해줘",
            "intentPreset": "redesign-slide",
            "context": {
                "deckId": "deck-m1",
                "baseVersion": 1,
                "canvas": canvas,
                "slide": {
                    "slideId": f"slide-{fixture['id']}",
                    "elements": elements,
                    "animations": fixture.get("animations", []),
                },
                "selectedElementIds": [],
                "theme": THEME,
            },
            "history": [],
            "availableSmartArtLayouts": [],
            "capabilities": {
                "version": "1",
                "operations": [
                    "add_element",
                    "update_element_frame",
                    "update_element_props",
                    "delete_element",
                    "update_slide_style",
                ],
                "addableElementTypes": ["text", "rect", "chart", "table"],
                "canEditTextContent": True,
                "canGenerateImages": False,
                "canModifyLockedElements": True,
            },
        }
    )


@pytest.mark.parametrize("fixture", M1_FIXTURES, ids=lambda item: item["id"])
def test_m1_golden_fixture_outcomes_and_preservation(
    fixture: dict[str, Any],
) -> None:
    request = fixture_request(fixture)
    result = redesign_slide(request, model="test-model", api_key=None)
    expected = fixture["expectedOutcome"]
    expected_outcomes = set(expected if isinstance(expected, list) else [expected])

    assert result.outcome in expected_outcomes
    if result.outcome == "refused-unsafe":
        assert result.response is None
        return
    if result.outcome != "applicable":
        return
    assert result.response is not None
    operations = [
        operation.model_dump(by_alias=True, exclude_none=True)
        for operation in result.response.operations
    ]
    final_elements = apply_element_operations(
        request.context.slide["elements"],
        operations,
    )
    original_texts = [
        str(element.get("props", {}).get("text", ""))
        for element in request.context.slide["elements"]
        if element.get("type") == "text" and element.get("locked") is not True
    ]
    final_text = "".join(
        str(element.get("props", {}).get("text", ""))
        for element in final_elements
        if element.get("type") == "text"
    )
    assert all(
        normalize_text(segment) in normalize_text(final_text)
        for original_text in original_texts
        for segment in split_bullets(original_text)
    )
    assert_no_internal_keys(operations)
    assert all(
        "text" not in operation.get("props", {})
        for operation in operations
        if operation["type"] == "update_element_props"
    )
    delete_positions = [
        index
        for index, operation in enumerate(operations)
        if operation["type"] == "delete_element"
    ]
    if delete_positions:
        assert all(
            operation["type"] == "delete_element"
            for operation in operations[min(delete_positions) :]
        )
    if fixture["id"] == "locked-element":
        assert all(operation.get("elementId") != "el_locked" for operation in operations)
        assert any(element["elementId"] == "el_locked" for element in final_elements)
    if fixture["id"] == "image-unsafe-m1":
        assert all(
            operation.get("elementId") != "el_image"
            or operation["type"] != "delete_element"
            for operation in operations
        )
        assert any(element["elementId"] == "el_image" for element in final_elements)


def test_fixture_set_covers_exactly_fourteen_m1_scenarios() -> None:
    assert len(M1_FIXTURES) == 14
    assert len({fixture["id"] for fixture in M1_FIXTURES}) == 14


def test_i1_duplicate_text_items_keep_distinct_provenance() -> None:
    slide = {
        "elements": [
            deck_element(
                {"elementId": "el_a", "type": "text", "text": "동일 문구"},
                1,
            ),
            deck_element(
                {"elementId": "el_b", "type": "text", "text": "동일 문구"},
                2,
            ),
        ]
    }
    hierarchy = infer_hierarchy(collect_text_elements(slide))
    extracted = extract_slide(slide, slide_type="summary", hierarchy=hierarchy)

    assert len(extracted.provenance) == len(extracted.summary["contentItems"])
    assert set(extracted.provenance.values()) == {"el_a", "el_b"}
    assert len(set(extracted.provenance)) == 2


def test_i2_cardinality_uses_source_element_id() -> None:
    original = [deck_element({"elementId": "el_body", "type": "text", "text": "A B"}, 1)]
    compiled = [
        {"elementId": "new_a", "type": "text", "props": {"text": "A"}, "_contentItemIds": ["segment-a"]},
        {"elementId": "new_b", "type": "text", "props": {"text": "B"}, "_contentItemIds": ["segment-b"]},
    ]

    matching = match_elements(
        original,
        compiled,
        {"segment-a": "el_body", "segment-b": "el_body"},
    )

    assert matching.irreversible == ["el_body"]
    assert matching.reused == {}


def test_i3_i4_unsafe_candidate_is_removed_but_safe_alternative_remains() -> None:
    summary = {
        "title": "제목",
        "message": "핵심",
        "slideType": "solution",
        "contentItems": [
            {"contentItemId": "item-1", "text": "Alpha"},
            {"contentItemId": "item-2", "text": "Beta"},
        ],
    }
    slide = {
        "elements": [
            deck_element({"elementId": "el_a", "type": "text", "text": "Alpha"}, 1),
            deck_element({"elementId": "el_b", "type": "text", "text": "Beta"}, 2),
        ]
    }
    constraints = ElementConstraints(
        referenced_element_ids=frozenset({"el_a"}),
        locked_element_ids=frozenset(),
        grouped_element_ids=frozenset(),
        ooxml_element_ids=frozenset(),
    )

    safe = filter_safe_candidates(
        summary,
        {"item-1": "el_a", "item-2": "el_b"},
        slide,
        [
            CompositionCandidate("statement-poster", "light"),
            CompositionCandidate("editorial-split", "light"),
        ],
        THEME,
        constraints,
    )

    assert [analysis.candidate.composition_id for analysis in safe] == [
        "editorial-split"
    ]


def test_i5_refused_response_always_has_empty_operations() -> None:
    fixture = next(item for item in M1_FIXTURES if item["id"] == "chart-unsafe")

    response = generate_design_proposal(
        fixture_request(fixture),
        model="test-model",
        api_key=None,
    )

    assert response.operations == []


def applicable_fixture_operations(
    fixture_id: str = "process-three-items",
) -> list[dict[str, Any]]:
    fixture = next(
        item for item in M1_FIXTURES if item["id"] == fixture_id
    )
    result = redesign_slide(
        fixture_request(fixture),
        model="test-model",
        api_key=None,
    )
    assert result.response is not None
    return [
        operation.model_dump(by_alias=True, exclude_none=True)
        for operation in result.response.operations
    ]


def test_i6_operations_never_expose_internal_keys() -> None:
    assert_no_internal_keys(applicable_fixture_operations())


def test_i7_element_props_updates_never_change_text() -> None:
    operations = applicable_fixture_operations()

    assert all(
        "text" not in operation.get("props", {})
        for operation in operations
        if operation["type"] == "update_element_props"
    )


def test_i8_delete_operations_are_grouped_at_the_end() -> None:
    operations = applicable_fixture_operations("single-bullet-five-items")
    delete_positions = [
        index
        for index, operation in enumerate(operations)
        if operation["type"] == "delete_element"
    ]

    assert delete_positions
    assert all(
        operation["type"] == "delete_element"
        for operation in operations[min(delete_positions) :]
    )


def apply_element_operations(
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


def assert_no_internal_keys(value: object) -> None:
    if isinstance(value, dict):
        assert all(not str(key).startswith("_") for key in value)
        for nested in value.values():
            assert_no_internal_keys(nested)
    elif isinstance(value, list):
        for nested in value:
            assert_no_internal_keys(nested)
