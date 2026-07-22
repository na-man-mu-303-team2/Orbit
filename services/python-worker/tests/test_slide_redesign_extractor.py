from __future__ import annotations

from app.ai.slide_redesign.slide_extractor import (
    collect_text_elements,
    infer_hierarchy,
)


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
