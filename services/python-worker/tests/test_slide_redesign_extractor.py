from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.slide_redesign.slide_extractor import (
    SlideHierarchy,
    classify_slide_type,
    collect_text_elements,
    extract_slide,
    infer_hierarchy,
    heuristic_slide_type,
    split_bullets,
)
from app.ai.composition_library import _items


def text_element(
    element_id: str,
    text: str,
    *,
    role: str | None = None,
    font_size: float = 24,
    x: float = 100,
    y: float = 100,
    height: float = 80,
    visible: bool = True,
) -> dict[str, object]:
    element: dict[str, object] = {
        "elementId": element_id,
        "type": "text",
        "x": x,
        "y": y,
        "width": 500,
        "height": height,
        "zIndex": 1,
        "visible": visible,
        "props": {"text": text, "fontSize": font_size},
    }
    if role is not None:
        element["role"] = role
    return element


def test_infers_hierarchy_from_explicit_roles() -> None:
    slide = {
        "elements": [
            text_element("el-footer", "7", role="footer", y=1010, font_size=14),
            text_element("el-body", "근거", role="body", y=360),
            text_element("el-message", "핵심", role="highlight", y=220),
            text_element("el-title", "제목", role="title", y=80, font_size=48),
        ]
    }

    hierarchy = infer_hierarchy(collect_text_elements(slide))

    assert hierarchy.title is not None
    assert hierarchy.title.element_id == "el-title"
    assert hierarchy.message is not None
    assert hierarchy.message.element_id == "el-message"
    assert [item.element_id for item in hierarchy.items] == ["el-body"]
    assert [item.element_id for item in hierarchy.leftovers] == ["el-footer"]


def test_infers_unroled_hierarchy_from_font_size() -> None:
    slide = {
        "elements": [
            text_element("el-body", "본문", font_size=22, y=360),
            text_element("el-title", "제목", font_size=48, y=80),
            text_element("el-message", "메시지", font_size=28, y=220),
        ]
    }

    hierarchy = infer_hierarchy(collect_text_elements(slide))

    assert hierarchy.title is not None
    assert hierarchy.title.element_id == "el-title"
    assert hierarchy.message is not None
    assert hierarchy.message.element_id == "el-message"
    assert [item.element_id for item in hierarchy.items] == ["el-body"]


def test_orders_grid_items_by_y_band_then_x() -> None:
    slide = {
        "elements": [
            text_element("el-bottom-right", "4", role="body", x=1000, y=600),
            text_element("el-top-right", "2", role="body", x=1000, y=300),
            text_element("el-bottom-left", "3", role="body", x=120, y=600),
            text_element("el-top-left", "1", role="body", x=120, y=300),
        ]
    }

    hierarchy = infer_hierarchy(collect_text_elements(slide))

    assert [item.element_id for item in hierarchy.items] == [
        "el-top-left",
        "el-top-right",
        "el-bottom-left",
        "el-bottom-right",
    ]


def test_excludes_hidden_text_elements() -> None:
    texts = collect_text_elements(
        {
            "elements": [
                text_element("el-visible", "표시"),
                text_element("el-hidden", "숨김", visible=False),
            ]
        }
    )

    assert [text.element_id for text in texts] == ["el-visible"]


def test_treats_small_bottom_text_as_leftover() -> None:
    hierarchy = infer_hierarchy(
        collect_text_elements(
            {
                "elements": [
                    text_element("el-page", "12", font_size=16, y=980),
                ]
            }
        )
    )

    assert hierarchy.title is None
    assert hierarchy.items == []
    assert [text.element_id for text in hierarchy.leftovers] == ["el-page"]


def test_empty_slide_produces_empty_hierarchy() -> None:
    hierarchy = infer_hierarchy(collect_text_elements({"elements": []}))

    assert hierarchy.title is None
    assert hierarchy.message is None
    assert hierarchy.items == []
    assert hierarchy.leftovers == []


def test_splits_single_text_element_into_unique_bullet_segments() -> None:
    slide = {
        "elements": [
            text_element("el-body", "• A\n• B\n• C", role="body", y=300)
        ]
    }
    hierarchy = infer_hierarchy(collect_text_elements(slide))

    extracted = extract_slide(slide, slide_type="feature-grid", hierarchy=hierarchy)

    assert extracted.summary["contentItems"] == [
        {"contentItemId": "el-body::segment::1", "text": "A"},
        {"contentItemId": "el-body::segment::2", "text": "B"},
        {"contentItemId": "el-body::segment::3", "text": "C"},
    ]


def test_maps_all_bullet_segments_to_the_source_element() -> None:
    slide = {
        "elements": [
            text_element("el-body", "• A\n• B\n• C", role="body", y=300)
        ]
    }
    hierarchy = infer_hierarchy(collect_text_elements(slide))

    extracted = extract_slide(slide, slide_type="feature-grid", hierarchy=hierarchy)

    assert extracted.provenance == {
        "el-body::segment::1": "el-body",
        "el-body::segment::2": "el-body",
        "el-body::segment::3": "el-body",
    }


def test_content_item_ids_are_globally_unique_and_composition_compatible() -> None:
    slide = {
        "elements": [
            text_element("el-a", "• A1\n• A2", role="body", y=300),
            text_element("el-b", "B", role="body", y=500),
        ]
    }
    hierarchy = infer_hierarchy(collect_text_elements(slide))

    extracted = extract_slide(slide, slide_type="feature-grid", hierarchy=hierarchy)
    content_items = extracted.summary["contentItems"]
    content_item_ids = [item["contentItemId"] for item in content_items]

    assert len(content_item_ids) == len(set(content_item_ids))
    assert _items(extracted.summary) == [
        ("el-a::segment::1", "A1"),
        ("el-a::segment::2", "A2"),
        ("el-b::segment::1", "B"),
    ]


def test_split_bullets_keeps_plain_multiline_copy_together() -> None:
    assert split_bullets("첫 문장\n둘째 문장") == ["첫 문장 둘째 문장"]


class FakeResponses:
    def __init__(self, output: object = None, *, error: Exception | None = None) -> None:
        self.output = output
        self.error = error

    def create(self, **_: Any) -> SimpleNamespace:
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_text=json.dumps(self.output, ensure_ascii=False))


class FakeClient:
    def __init__(self, output: object = None, *, error: Exception | None = None) -> None:
        self.responses = FakeResponses(output, error=error)


def feature_hierarchy() -> SlideHierarchy:
    slide = {
        "elements": [
            text_element("el-title", "기능", role="title", font_size=48, y=80),
            text_element("el-a", "빠른 실행", role="body", y=300),
            text_element("el-b", "안전한 저장", role="body", y=500),
            text_element("el-c", "쉬운 공유", role="body", y=700),
        ]
    }
    return infer_hierarchy(collect_text_elements(slide))


def test_classify_slide_type_falls_back_when_provider_raises() -> None:
    hierarchy = feature_hierarchy()

    result = classify_slide_type(
        hierarchy,
        model="test-model",
        api_key=None,
        client=FakeClient(error=RuntimeError("provider unavailable")),
    )

    assert result == "feature-grid"


def test_classify_slide_type_falls_back_for_unknown_provider_value() -> None:
    hierarchy = feature_hierarchy()

    result = classify_slide_type(
        hierarchy,
        model="test-model",
        api_key=None,
        client=FakeClient({"slideType": "unknown-layout"}),
    )

    assert result == "feature-grid"


def test_heuristic_slide_type_covers_structural_signals() -> None:
    cover = infer_hierarchy(
        collect_text_elements(
            {"elements": [text_element("el-title", "제목", role="title")]}
        )
    )
    process = infer_hierarchy(
        collect_text_elements(
            {
                "elements": [
                    text_element("el-1", "1. 준비", role="body", y=200),
                    text_element("el-2", "2. 실행", role="body", y=400),
                    text_element("el-3", "3. 확인", role="body", y=600),
                ]
            }
        )
    )
    data = infer_hierarchy(
        collect_text_elements(
            {
                "elements": [
                    text_element("el-a", "매출 20%", role="body", y=200),
                    text_element("el-b", "비용 10%", role="body", y=400),
                ]
            }
        )
    )

    assert heuristic_slide_type(cover) == "cover"
    assert heuristic_slide_type(process) == "process"
    assert heuristic_slide_type(data) == "data"


GOLDEN_FIXTURES = json.loads(
    (
        Path(__file__).parent
        / "fixtures/slide_redesign/extractor-golden.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize(
    "fixture",
    GOLDEN_FIXTURES,
    ids=[fixture["name"] for fixture in GOLDEN_FIXTURES],
)
def test_extractor_golden_fixtures(fixture: dict[str, Any]) -> None:
    slide = fixture["slide"]
    hierarchy = infer_hierarchy(collect_text_elements(slide))

    extracted = extract_slide(
        slide,
        slide_type=fixture["slideType"],
        hierarchy=hierarchy,
    )

    assert extracted.summary == fixture["expected"]["summary"]
    assert extracted.provenance == fixture["expected"]["provenance"]


def test_extractor_golden_fixture_set_has_five_scenarios() -> None:
    assert len(GOLDEN_FIXTURES) == 5
