from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.ai.slide_redesign.safety import (
    find_unsafe_elements,
    unsafe_element_types,
)


def element(element_id: str, element_type: str) -> dict[str, object]:
    return {"elementId": element_id, "type": element_type, "props": {}}


@pytest.mark.parametrize("element_type", ["chart", "table"])
def test_finds_data_elements_as_unsafe(element_type: str) -> None:
    slide = {"elements": [element(f"el-{element_type}", element_type)]}

    assert find_unsafe_elements(slide) == [f"el-{element_type}"]


@pytest.mark.parametrize("element_type", ["group", "customShape", "ellipse"])
def test_finds_existing_structural_and_shape_elements_as_unsafe(
    element_type: str,
) -> None:
    slide = {"elements": [element(f"el-{element_type}", element_type)]}

    assert find_unsafe_elements(slide) == [f"el-{element_type}"]


def test_allows_text_and_rect_elements() -> None:
    slide = {"elements": [element("el-text", "text"), element("el-rect", "rect")]}

    assert find_unsafe_elements(slide) == []


def test_treats_media_as_unsafe_without_media_slots() -> None:
    slide = {"elements": [element("el-image", "image")]}

    assert find_unsafe_elements(slide, media_slots_available=False) == ["el-image"]


def test_allows_media_when_media_slots_are_available() -> None:
    slide = {
        "elements": [element("el-image", "image"), element("el-svg", "svg")]
    }

    assert find_unsafe_elements(slide, media_slots_available=True) == []


def test_m1_fail_closed_types_cover_the_shared_element_schema() -> None:
    schema_path = (
        Path(__file__).parents[3]
        / "packages/shared/src/deck/slide-object.schema.ts"
    )
    schema_source = schema_path.read_text(encoding="utf-8")
    enum_match = re.search(
        r"deckElementTypeSchema = z\.enum\(\[(.*?)\]\)",
        schema_source,
        flags=re.DOTALL,
    )
    assert enum_match is not None
    schema_types = set(re.findall(r'"([^"]+)"', enum_match.group(1)))

    assert schema_types - {"text", "rect"} == unsafe_element_types(
        media_slots_available=False
    )
