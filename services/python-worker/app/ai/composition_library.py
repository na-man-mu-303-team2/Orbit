from __future__ import annotations

import re
import textwrap
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Literal

from app.ai.design_program import (
    BackgroundMode,
    CompositionId,
    DeckDesignProgram,
    SlideCompositionDirection,
)


MediaRequirement = Literal["none", "optional", "required"]
Element = dict[str, Any]
Factory = Callable[[SlideCompositionDirection, dict[str, Any], "Style"], tuple[list[Element], str]]

CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080
SAFE_X = 120
SAFE_Y = 88
SAFE_WIDTH = 1680
SAFE_HEIGHT = 904
GRID_COLUMN_WIDTH = 118
GRID_GUTTER = 24
GRID_STEP = GRID_COLUMN_WIDTH + GRID_GUTTER


@dataclass(frozen=True)
class CompositionSpec:
    composition_id: CompositionId
    purposes: tuple[str, ...]
    min_items: int
    max_items: int
    media_requirement: MediaRequirement
    variants: tuple[BackgroundMode, ...]
    silhouette: str
    focal_rule: str
    factory: Factory


@dataclass(frozen=True)
class Style:
    background: str
    surface: str
    text: str
    muted_text: str
    focal: str
    secondary: str
    heading_font: str
    body_font: str
    cover_size: int
    title_size: int
    body_size: int
    caption_size: int


@dataclass(frozen=True)
class CompiledComposition:
    elements: list[Element]
    primary_focal_element_id: str
    layout: str
    background_color: str


class CompositionCompileError(RuntimeError):
    pass


def _id(order: int, name: str) -> str:
    return f"el_{order}_program_v2_{name}"


def _grid_x(column: int) -> int:
    return SAFE_X + column * GRID_STEP


def _grid_width(span: int) -> int:
    return span * GRID_COLUMN_WIDTH + (span - 1) * GRID_GUTTER


def _rect(
    order: int,
    name: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    fill: str,
    *,
    stroke: str = "transparent",
    stroke_width: int = 0,
    radius: int = 0,
    opacity: float = 1,
    locked: bool = False,
) -> Element:
    return {
        "elementId": _id(order, name),
        "type": "rect",
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": opacity,
        "zIndex": z_index,
        "locked": locked,
        "visible": True,
        "props": {
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": stroke_width,
            "borderRadius": radius,
        },
    }


def _text(
    order: int,
    name: str,
    role: str,
    value: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    color: str,
    size: int,
    weight: str,
    font: str,
    *,
    align: str = "left",
    vertical: str = "top",
    line_height: float = 1.2,
    content_item_ids: list[str] | None = None,
) -> Element:
    element: Element = {
        "elementId": _id(order, name),
        "type": "text",
        "role": role,
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": z_index,
        "locked": False,
        "visible": True,
        "props": {
            "text": value,
            "fontFamily": font,
            "fontSize": size,
            "fontWeight": weight,
            "color": color,
            "align": align,
            "verticalAlign": vertical,
            "lineHeight": line_height,
        },
    }
    if content_item_ids:
        element["_contentItemIds"] = content_item_ids
    return element


def _media(
    order: int,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    style: Style,
    caption: str,
) -> list[Element]:
    placeholder = _rect(
        order,
        "media_placeholder",
        "media",
        x,
        y,
        width,
        height,
        z_index,
        style.surface,
        stroke=style.focal,
        stroke_width=2,
        radius=8,
    )
    caption_element = _text(
        order,
        "media_caption",
        "caption",
        textwrap.shorten(caption or "Visual", width=80, placeholder="..."),
        x + 24,
        y + 24,
        max(120, width - 48),
        64,
        z_index + 1,
        style.muted_text,
        style.caption_size,
        "medium",
        style.body_font,
    )
    return [placeholder, caption_element]


def _background(order: int, style: Style) -> Element:
    return _rect(
        order,
        "background",
        "background",
        0,
        0,
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        0,
        style.background,
        locked=True,
    )


def _items(slide: dict[str, Any]) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    for index, item in enumerate(slide.get("contentItems", []), start=1):
        if isinstance(item, dict):
            identifier = str(item.get("contentItemId") or f"item-{index}")
            value = str(item.get("text", ""))
        else:
            identifier = f"item-{index}"
            value = str(item)
        value = " ".join(value.split())
        if value:
            result.append((identifier, value))
    return result


def _normalized_text(value: str) -> str:
    return re.sub(r"\W+", "", value.casefold(), flags=re.UNICODE)


def _message_duplicates_items(
    slide: dict[str, Any],
    items: list[tuple[str, str]],
) -> bool:
    message = _normalized_text(str(slide.get("message", "")))
    item_values = [_normalized_text(value) for _, value in items]
    item_values = [value for value in item_values if value]
    if not message or not item_values:
        return False
    if message in item_values or message == "".join(item_values):
        return True
    return (
        all(value in message for value in item_values)
        and sum(len(value) for value in item_values) >= len(message) * 0.8
    )


def _supporting_items_without_message_duplicate(
    slide: dict[str, Any],
    items: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    message = _normalized_text(str(slide.get("message", "")))
    if not message:
        return items
    filtered = [item for item in items if _normalized_text(item[1]) != message]
    if len(filtered) != len(items):
        return filtered
    return [] if _message_duplicates_items(slide, items) else items


def _deduplicate_exact_visible_text(
    elements: list[Element],
) -> list[Element]:
    groups: dict[str, list[Element]] = {}
    for element in elements:
        if element.get("type") != "text" or element.get("role") not in {
            "subtitle",
            "body",
            "highlight",
        }:
            continue
        normalized = _normalized_text(str(element.get("props", {}).get("text", "")))
        if len(normalized) >= 6:
            groups.setdefault(normalized, []).append(element)

    removed_ids: set[str] = set()
    for group in groups.values():
        if len(group) < 2:
            continue
        keep = max(
            group,
            key=lambda element: (
                element.get("role") == "highlight",
                bool(element.get("_contentItemIds")),
                float(element.get("width", 0)) * float(element.get("height", 0)),
            ),
        )
        content_item_ids = list(
            dict.fromkeys(
                str(content_item_id)
                for element in group
                for content_item_id in element.get("_contentItemIds", [])
            )
        )
        if content_item_ids:
            keep["_contentItemIds"] = content_item_ids
        removed_ids.update(
            str(element.get("elementId")) for element in group if element is not keep
        )
    return [
        element
        for element in elements
        if str(element.get("elementId")) not in removed_ids
    ]


def _title(order: int, slide: dict[str, Any], style: Style) -> Element:
    return _text(
        order,
        "title",
        "title",
        str(slide.get("title", "")),
        SAFE_X,
        96,
        SAFE_WIDTH,
        120,
        10,
        style.text,
        style.title_size,
        "bold",
        style.heading_font,
        line_height=1.08,
    )


def _hero_split(
    direction: SlideCompositionDirection,
    slide: dict[str, Any],
    style: Style,
) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    content_columns = 6 if direction.asset_role != "none" else 7
    media_columns = 12 - content_columns
    elements = [_background(order, style)]
    elements.append(
        _rect(order, "hero_accent", "decoration", 120, 164, 92, 14, 2, style.focal)
    )
    title = _text(
        order,
        "title",
        "title",
        str(slide.get("title", "")),
        _grid_x(0),
        232,
        _grid_width(content_columns),
        248,
        10,
        style.text,
        style.cover_size,
        "bold",
        style.heading_font,
        line_height=1.05,
    )
    elements.append(title)
    elements.append(
        _text(
            order,
            "message",
            "highlight",
            str(slide.get("message", "")),
            _grid_x(0),
            520,
            _grid_width(content_columns),
            152,
            10,
            style.text,
            max(style.body_size + 4, 24),
            "semibold",
            style.body_font,
        )
    )
    if items:
        elements.append(
            _text(
                order,
                "support",
                "body",
                "\n".join(f"• {value}" for _, value in items),
                _grid_x(0),
                704,
                _grid_width(content_columns),
                184,
                10,
                style.muted_text,
                style.body_size,
                "normal",
                style.body_font,
                content_item_ids=[identifier for identifier, _ in items],
            )
        )
    if direction.asset_role != "none":
        elements.extend(
            _media(
                order,
                _grid_x(content_columns),
                120,
                _grid_width(media_columns),
                840,
                5,
                style,
                _media_caption(slide),
            )
        )
        return elements, _id(order, "media_placeholder")
    elements.extend(
        [
            _rect(
                order,
                "hero_field_top",
                "decoration",
                _grid_x(7),
                160,
                _grid_width(5),
                176,
                3,
                style.focal,
                radius=8,
            ),
            _rect(
                order,
                "hero_field_middle",
                "decoration",
                _grid_x(7),
                376,
                _grid_width(3),
                216,
                3,
                style.secondary,
                radius=8,
            ),
            _rect(
                order,
                "hero_field_bottom",
                "decoration",
                _grid_x(10),
                632,
                _grid_width(2),
                256,
                3,
                style.focal,
                radius=8,
            ),
        ]
    )
    return elements, title["elementId"]


def _hero_full_bleed(
    direction: SlideCompositionDirection,
    slide: dict[str, Any],
    style: Style,
) -> tuple[list[Element], str]:
    if direction.asset_role == "none":
        raise CompositionCompileError("hero-full-bleed requires an asset")
    order = direction.order
    media = _media(order, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 1, style, _media_caption(slide))
    elements = [
        _background(order, style),
        *media,
        _rect(order, "image_overlay", "decoration", 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT, 3, "#000000", opacity=0.58),
        _text(order, "eyebrow", "caption", "PRODUCT REVEAL", 120, 150, 600, 50, 4, "#FFFFFF", 16, "bold", style.body_font),
        _text(
            order,
            "title",
            "title",
            str(slide.get("title", "")),
            _grid_x(0),
            304,
            _grid_width(9),
            256,
            4,
            "#FFFFFF",
            style.cover_size,
            "bold",
            style.heading_font,
            line_height=1.05,
        ),
        _text(
            order,
            "message",
            "highlight",
            str(slide.get("message", "")),
            _grid_x(0),
            608,
            _grid_width(8),
            152,
            4,
            "#FFFFFF",
            max(style.body_size + 4, 24),
            "semibold",
            style.body_font,
        ),
    ]
    items = _items(slide)
    if items:
        elements.append(
            _text(
                order,
                "support",
                "body",
                "  ·  ".join(value for _, value in items),
                _grid_x(0),
                808,
                _grid_width(11),
                80,
                4,
                "#FFFFFF",
                style.body_size,
                "normal",
                style.body_font,
                content_item_ids=[identifier for identifier, _ in items],
            )
        )
    return elements, _id(order, "media_placeholder")


def _minimal_cover(
    direction: SlideCompositionDirection,
    slide: dict[str, Any],
    style: Style,
) -> tuple[list[Element], str]:
    order = direction.order
    title = _text(
        order,
        "title",
        "title",
        str(slide.get("title", "")),
        _grid_x(0),
        304,
        _grid_width(12),
        248,
        4,
        style.text,
        style.cover_size,
        "bold",
        style.heading_font,
        align="center",
        line_height=1.05,
    )
    elements = [
        _background(order, style),
        _rect(order, "cover_mark", "decoration", 870, 190, 180, 18, 2, style.focal),
        title,
        _text(order, "message", "highlight", str(slide.get("message", "")), _grid_x(1), 600, _grid_width(10), 128, 4, style.muted_text, style.body_size + 2, "medium", style.body_font, align="center"),
    ]
    items = _items(slide)
    if items:
        elements.append(
            _text(order, "support", "body", "  ·  ".join(value for _, value in items), _grid_x(0), 792, _grid_width(12), 80, 4, style.text, style.body_size, "normal", style.body_font, align="center", content_item_ids=[identifier for identifier, _ in items])
        )
    return elements, title["elementId"]


def _statement_poster(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    statement = _text(order, "statement", "highlight", str(slide.get("message", "")), 180, 290, 1450, 390, 5, style.text, max(44, style.title_size + 8), "bold", style.heading_font, line_height=1.2)
    elements = [_background(order, style), _title(order, slide, style), _rect(order, "poster_block", "decoration", _grid_x(11), 288, _grid_width(1), 480, 2, style.focal), statement]
    items = _items(slide)
    if items:
        elements.append(_text(order, "support", "body", "  ·  ".join(value for _, value in items), _grid_x(0), 760, _grid_width(9), 112, 5, style.muted_text, style.body_size, "normal", style.body_font, content_item_ids=[identifier for identifier, _ in items]))
    return elements, statement["elementId"]


def _editorial_split(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    duplicates_items = _message_duplicates_items(slide, items)
    content_columns = 6 if direction.asset_role != "none" else 7
    elements = [_background(order, style), _title(order, slide, style)]
    message_height = 240 if direction.asset_role != "none" else 376
    message = _text(order, "message", "highlight", str(slide.get("message", "")), _grid_x(0), 304, _grid_width(content_columns), message_height, 5, style.text, max(30, style.body_size + 8), "bold", style.heading_font, line_height=1.2)
    if not duplicates_items:
        elements.append(message)
    if direction.asset_role != "none":
        elements.extend(_media(order, _grid_x(6), 248, _grid_width(6), 624, 4, style, _media_caption(slide)))
        if items:
            if duplicates_items:
                gap = 24
                row_height = (568 - gap * (len(items) - 1)) // len(items)
                for index, (identifier, value) in enumerate(items):
                    y = 304 + index * (row_height + gap)
                    elements.extend(
                        [
                            _text(order, f"support_index_{index + 1}", "highlight", f"{index + 1:02d}", _grid_x(0), y, _grid_width(1), row_height, 5, style.focal, 24, "bold", style.heading_font, vertical="middle"),
                            _text(order, f"support_{index + 1}", "body", value, _grid_x(1), y, _grid_width(5), row_height, 5, style.text, max(24, style.body_size + 2), "semibold", style.body_font, vertical="middle", content_item_ids=[identifier]),
                        ]
                    )
            else:
                elements.append(_text(order, "support", "body", "\n".join(f"• {value}" for _, value in items), _grid_x(0), 584, _grid_width(6), 288, 5, style.muted_text, max(22, style.body_size), "normal", style.body_font, content_item_ids=[identifier for identifier, _ in items]))
        return elements, _id(order, "media_placeholder")
    panel_widths = (
        (_grid_width(6), _grid_width(6))
        if duplicates_items
        else (_grid_width(3), _grid_width(4))
    )
    expanded_pair = duplicates_items and len(items) == 2
    if duplicates_items and len(items) == 3:
        frames = [
            (_grid_x(0), 304, _grid_width(6), 520),
            (_grid_x(6), 304, _grid_width(6), 248),
            (_grid_x(6), 576, _grid_width(6), 248),
        ]
    else:
        panel_height = 440 if expanded_pair else 224
        row_step = panel_height + 40
        frames = []
        for index in range(len(items)):
            column = index % 2
            column_start = (
                (0 if column == 0 else 6)
                if duplicates_items
                else (5 if column == 0 else 8)
            )
            frames.append(
                (
                    _grid_x(column_start),
                    304 + (index // 2) * row_step,
                    panel_widths[column],
                    panel_height,
                )
            )
    for index, ((identifier, value), (x, y, panel_width, panel_height)) in enumerate(
        zip(items, frames, strict=True)
    ):
        text_height = panel_height - 48
        vertically_centered = expanded_pair or (duplicates_items and len(items) == 3)
        elements.extend(
            [
                _rect(order, f"item_{index + 1}_field", "decoration", x, y, panel_width, panel_height, 3, style.surface, stroke=style.secondary, stroke_width=2, radius=8),
                _text(order, f"item_{index + 1}", "body", value, x + 24, y + 24, panel_width - 48, text_height, 5, style.text, max(style.body_size + 2, 30) if vertically_centered else style.body_size + 2, "semibold", style.body_font, vertical="middle" if vertically_centered else "top", content_item_ids=[identifier]),
            ]
        )
    return elements, _id(order, "item_1") if duplicates_items and items else message["elementId"]


def _metric_poster(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    metric = _metric_value(slide, items)
    metric_font_size = 72 if len(metric) > 12 else 92
    metric_element = _text(order, "metric", "highlight", metric, _grid_x(0), 288, _grid_width(10), 248, 5, style.focal, metric_font_size, "bold", style.heading_font, line_height=1.2)
    duplicates_items = _message_duplicates_items(slide, items)
    elements = [
        _background(order, style),
        _title(order, slide, style),
        metric_element,
        _rect(order, "metric_rule", "decoration", _grid_x(0), 568, _grid_width(2), 12, 3, style.secondary, radius=6),
    ]
    if not duplicates_items:
        elements.append(_text(order, "message", "body", str(slide.get("message", "")), _grid_x(0), 632, _grid_width(10), 136, 5, style.text, max(26, style.body_size + 4), "semibold", style.body_font))
    if items:
        elements.append(_text(order, "support", "body", "  ·  ".join(value for _, value in items), _grid_x(0), 632 if duplicates_items else 800, _grid_width(11), 184 if duplicates_items else 104, 5, style.muted_text, max(22, style.body_size), "semibold" if duplicates_items else "normal", style.body_font, vertical="middle", content_item_ids=[identifier for identifier, _ in items]))
    return elements, metric_element["elementId"]


def _kpi_strip(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    duplicates_items = _message_duplicates_items(slide, items)
    elements = [_background(order, style), _title(order, slide, style)]
    if not duplicates_items:
        elements.append(_text(order, "message", "highlight", str(slide.get("message", "")), 120, 250, 1500, 120, 5, style.text, 30, "semibold", style.heading_font))
    count = max(1, len(items))
    gap = 24
    width = (SAFE_WIDTH - gap * (count - 1)) // count
    field_y = 330 if duplicates_items else 430
    for index, (identifier, value) in enumerate(items):
        x = SAFE_X + index * (width + gap)
        elements.extend([
            _rect(order, f"kpi_{index + 1}_field", "decoration", x, field_y, width, 460 if duplicates_items else 360, 3, style.surface, stroke=style.focal if index == 0 else style.secondary, stroke_width=2, radius=8),
            _text(order, f"kpi_{index + 1}", "highlight", value, x + 28, field_y + 55, width - 56, 376 if duplicates_items else 220, 5, style.text, max(26, style.body_size + 4), "bold", style.heading_font, vertical="middle" if duplicates_items else "top", content_item_ids=[identifier]),
        ])
    return elements, _id(order, "kpi_1")


def _image_evidence(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    if direction.asset_role == "none":
        raise CompositionCompileError("image-evidence requires an asset")
    order = direction.order
    items = _items(slide)
    elements = [_background(order, style), _title(order, slide, style), *_media(order, _grid_x(0), 272, _grid_width(6), 616, 4, style, _media_caption(slide)), _text(order, "message", "highlight", str(slide.get("message", "")), _grid_x(6), 304, _grid_width(6), 216, 5, style.text, 32, "bold", style.heading_font, line_height=1.2)]
    if items:
        elements.append(_text(order, "evidence", "body", "\n".join(f"• {value}" for _, value in items), _grid_x(6), 568, _grid_width(6), 304, 5, style.muted_text, style.body_size, "normal", style.body_font, content_item_ids=[identifier for identifier, _ in items]))
    return elements, _id(order, "media_placeholder")


def _feature_comparison(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    elements = [_background(order, style), _title(order, slide, style)]
    count = len(items)
    frames: list[tuple[int, int, int, int]]
    if count == 3 and order % 2 == 1:
        frames = [
            (_grid_x(0), 304, _grid_width(6), 520),
            (_grid_x(6), 304, _grid_width(6), 248),
            (_grid_x(6), 576, _grid_width(6), 248),
        ]
    elif count == 3:
        frames = [
            (_grid_x(index * 4), 344, _grid_width(4), 448)
            for index in range(3)
        ]
    elif count == 2 and order % 2 == 0:
        frames = [
            (_grid_x(0), 320, _grid_width(7), 480),
            (_grid_x(7), 400, _grid_width(5), 320),
        ]
    elif count == 2:
        frames = [
            (_grid_x(index * 6), 352, _grid_width(6), 416)
            for index in range(2)
        ]
    else:
        columns = 2
        rows = (count + columns - 1) // columns
        gap = 24
        width = _grid_width(6)
        height = (544 - gap * (rows - 1)) // max(1, rows)
        frames = [
            (
                _grid_x((index % columns) * 6),
                304 + (index // columns) * (height + gap),
                width,
                height,
            )
            for index in range(count)
        ]
    for index, ((identifier, value), (x, y, width, height)) in enumerate(
        zip(items, frames, strict=True)
    ):
        text_y = y + 92
        field_fill = style.secondary if index == 0 else style.surface
        field_text = _contrasting_text_color(field_fill, style.text)
        index_color = field_text if index == 0 else style.focal
        elements.extend(
            [
                _rect(order, f"comparison_{index + 1}_field", "decoration", x, y, width, height, 3, field_fill, stroke=style.secondary, stroke_width=2, radius=8),
                _text(order, f"comparison_{index + 1}_index", "highlight", f"{index + 1:02d}", x + 28, y + 24, width - 56, 52, 5, index_color, 28, "bold", style.heading_font),
                _text(order, f"comparison_{index + 1}", "body", value, x + 28, text_y, width - 56, height - 120, 5, field_text, 30 if count == 2 else max(24, style.body_size + 4), "semibold", style.body_font, vertical="middle", content_item_ids=[identifier]),
            ]
        )
    focal = _id(order, "comparison_1") if items else _id(order, "title")
    return elements, focal


def _process_horizontal(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    elements = [_background(order, style), _title(order, slide, style)]
    count = max(1, len(items))
    gap = 18
    width = (SAFE_WIDTH - gap * (count - 1)) // count
    for index, (identifier, value) in enumerate(items):
        x = SAFE_X + index * (width + gap)
        elements.extend([
            _text(order, f"step_number_{index + 1}", "highlight", f"{index + 1:02d}", x, 300, width, 90, 5, style.focal, 44, "bold", style.heading_font),
            _rect(order, f"step_{index + 1}_field", "decoration", x, 408, width, 384, 3, style.surface, stroke=style.secondary, stroke_width=2, radius=8),
            _text(order, f"step_{index + 1}", "body", value, x + 24, 448, width - 48, 304, 5, style.text, max(20, style.body_size + (4 if count <= 4 else 0)), "semibold", style.body_font, vertical="middle", content_item_ids=[identifier]),
        ])
    return elements, _id(order, "step_1")


def _timeline(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    count = max(1, len(items))
    if count == 3:
        frames = [
            (_grid_x(index * 4), 280 if index % 2 == 0 else 620, _grid_width(4), 200)
            for index in range(count)
        ]
    else:
        step = 1560 // max(1, count - 1) if count > 1 else 0
        frames = [
            (
                max(120, min(180 + index * step - 150, 1500)),
                300 if index % 2 == 0 else 610,
                300,
                152,
            )
            for index in range(count)
        ]
    centers = [x + width // 2 for x, _, width, _ in frames]
    elements = [
        _background(order, style),
        _title(order, slide, style),
        _rect(
            order,
            "timeline_line",
            "decoration",
            centers[0],
            520,
            max(8, centers[-1] - centers[0]),
            8,
            2,
            style.secondary,
            radius=4,
        ),
    ]
    for index, ((identifier, value), (x, y, width, height)) in enumerate(
        zip(items, frames, strict=True)
    ):
        center = centers[index]
        elements.extend([
            _rect(order, f"timeline_dot_{index + 1}", "decoration", center - 14, 506, 28, 28, 4, style.focal, radius=14),
            _rect(order, f"timeline_{index + 1}_field", "decoration", x, y, width, height, 3, style.surface, stroke=style.secondary, stroke_width=2, radius=8),
            _text(order, f"timeline_{index + 1}", "body", value, x + 24, y + 20, width - 48, height - 40, 5, style.text, max(26, style.body_size + 4) if count == 3 else style.body_size, "semibold", style.body_font, align="center", vertical="middle", content_item_ids=[identifier]),
        ])
    return elements, _id(order, "timeline_dot_1")


def _diagram_hub(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    hub_x = _grid_x(4)
    hub_width = _grid_width(4)
    hub = _rect(order, "hub_field", "highlight", hub_x, 390, hub_width, 260, 4, style.secondary, radius=8)
    hub_copy = (
        str(slide.get("title", ""))
        if _message_duplicates_items(slide, items)
        else str(slide.get("message", ""))
    )
    hub_font_size = 26 if len(hub_copy) <= 16 else 22 if len(hub_copy) <= 20 else 18
    elements = [_background(order, style), _title(order, slide, style), hub, _text(order, "hub", "highlight", textwrap.shorten(hub_copy, width=80, placeholder="..."), hub_x + 24, 440, hub_width - 48, 160, 5, _contrasting_text_color(style.secondary, style.text), hub_font_size, "bold", style.heading_font, align="center", vertical="middle")]
    if len(items) == 3:
        frames = [
            (_grid_x(0), 300, _grid_width(4), 200),
            (_grid_x(8), 300, _grid_width(4), 200),
            (_grid_x(4), 700, _grid_width(4), 180),
        ]
    elif len(items) == 4:
        frames = [
            (_grid_x(0), 304, _grid_width(3), 176),
            (_grid_x(9), 304, _grid_width(3), 176),
            (_grid_x(0), 704, _grid_width(3), 176),
            (_grid_x(9), 704, _grid_width(3), 176),
        ]
    else:
        frames = [
            (_grid_x(0), 280, _grid_width(3), 144),
            (_grid_x(9), 280, _grid_width(3), 144),
            (_grid_x(0), 472, _grid_width(3), 144),
            (_grid_x(9), 472, _grid_width(3), 144),
            (_grid_x(0), 664, _grid_width(3), 144),
            (_grid_x(9), 664, _grid_width(3), 144),
        ][: len(items)]
    for index, ((identifier, value), (x, y, width, height)) in enumerate(
        zip(items, frames, strict=True)
    ):
        elements.extend(
            [
                _rect(order, f"node_{index + 1}_field", "decoration", x, y, width, height, 3, style.surface, stroke=style.focal, stroke_width=2, radius=8),
                _text(order, f"node_{index + 1}", "body", value, x + 20, y + 20, width - 40, height - 40, 5, style.text, max(22, style.body_size + 2), "semibold", style.body_font, align="center", vertical="middle", content_item_ids=[identifier]),
            ]
        )
    return elements, _id(order, "hub")


def _cta_closing(direction: SlideCompositionDirection, slide: dict[str, Any], style: Style) -> tuple[list[Element], str]:
    order = direction.order
    items = _items(slide)
    action_items = _supporting_items_without_message_duplicate(slide, items)
    duplicates_items = bool(items) and not action_items
    content_width = _grid_width(6) if direction.asset_role != "none" else _grid_width(12)
    title = _text(order, "title", "title", str(slide.get("title", "")), _grid_x(0), 224, content_width, 216, 5, style.text, max(style.cover_size - 4, 48), "bold", style.heading_font, line_height=1.05)
    message = _text(order, "message", "highlight", str(slide.get("message", "")), _grid_x(0), 496, content_width, 376 if duplicates_items else 160, 5, style.text, 36 if duplicates_items else 30, "bold" if duplicates_items else "semibold", style.body_font, vertical="middle" if duplicates_items else "top", content_item_ids=[identifier for identifier, _ in items] if duplicates_items else None)
    elements = [_background(order, style), _rect(order, "closing_mark", "decoration", 120, 152, 180, 16, 2, style.focal), title, message]
    action = None
    if action_items:
        action = _text(order, "actions", "body", "  →  ".join(value for _, value in action_items), _grid_x(0), 736, content_width, 120, 5, style.text, style.body_size + 2, "bold", style.body_font, content_item_ids=[identifier for identifier, _ in action_items])
        elements.append(action)
    if direction.asset_role != "none":
        elements.extend(_media(order, _grid_x(6), 208, _grid_width(6), 624, 3, style, _media_caption(slide)))
    return elements, (action or message)["elementId"]


COMPOSITION_SPECS: dict[CompositionId, CompositionSpec] = {
    "hero-split": CompositionSpec("hero-split", ("cover", "title", "solution", "feature-grid"), 1, 3, "optional", ("light", "dark"), "split-hero", "hero-image-or-title", _hero_split),
    "hero-full-bleed": CompositionSpec("hero-full-bleed", ("cover", "title"), 1, 2, "required", ("image",), "full-bleed", "hero-image", _hero_full_bleed),
    "minimal-cover": CompositionSpec("minimal-cover", ("cover", "title"), 1, 3, "none", ("light", "dark"), "minimal", "title", _minimal_cover),
    "statement-poster": CompositionSpec("statement-poster", ("problem", "solution", "quote", "summary"), 1, 2, "none", ("light", "dark"), "poster", "statement", _statement_poster),
    "editorial-split": CompositionSpec("editorial-split", ("problem", "solution", "feature-grid", "data", "comparison"), 2, 4, "optional", ("light", "dark"), "split-editorial", "message-or-image", _editorial_split),
    "metric-poster": CompositionSpec("metric-poster", ("data", "chart", "summary"), 1, 3, "none", ("light", "dark"), "poster-metric", "metric", _metric_poster),
    "kpi-strip-evidence": CompositionSpec("kpi-strip-evidence", ("data", "chart", "feature-grid", "solution"), 2, 4, "none", ("light", "dark"), "evidence-strip", "first-kpi", _kpi_strip),
    "image-evidence": CompositionSpec("image-evidence", ("data", "feature-grid", "solution", "quote"), 1, 3, "required", ("light", "dark"), "image-evidence", "evidence-image", _image_evidence),
    "feature-comparison": CompositionSpec("feature-comparison", ("comparison", "feature-grid"), 2, 4, "none", ("light", "dark"), "comparison", "first-comparison", _feature_comparison),
    "process-horizontal": CompositionSpec("process-horizontal", ("process", "architecture"), 3, 6, "none", ("light", "dark"), "process", "first-step", _process_horizontal),
    "timeline": CompositionSpec("timeline", ("process", "data", "summary"), 3, 6, "none", ("light", "dark"), "timeline", "first-milestone", _timeline),
    "diagram-hub": CompositionSpec("diagram-hub", ("architecture", "feature-grid", "solution"), 3, 6, "none", ("light", "dark"), "diagram", "hub", _diagram_hub),
    "cta-closing": CompositionSpec("cta-closing", ("summary",), 1, 3, "optional", ("light", "dark"), "closing", "cta", _cta_closing),
}


FALLBACK_COMPOSITIONS: dict[str, tuple[CompositionId, ...]] = {
    "cover": ("hero-split", "hero-full-bleed", "minimal-cover"),
    "title": ("hero-split", "minimal-cover"),
    "problem": ("statement-poster", "editorial-split"),
    "solution": ("editorial-split", "statement-poster", "diagram-hub"),
    "feature-grid": ("editorial-split", "feature-comparison", "kpi-strip-evidence", "diagram-hub"),
    "process": ("process-horizontal", "timeline"),
    "architecture": ("diagram-hub", "process-horizontal"),
    "data": ("metric-poster", "kpi-strip-evidence", "image-evidence", "editorial-split"),
    "chart": ("metric-poster", "kpi-strip-evidence"),
    "comparison": ("feature-comparison", "editorial-split"),
    "quote": ("statement-poster", "image-evidence"),
    "summary": ("cta-closing", "statement-poster"),
}


def normalize_design_program(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
    *,
    force_light: bool = False,
    force_dark: bool = False,
    media_policy: str = "hybrid",
    media_budget: int = 4,
) -> DeckDesignProgram:
    if len(program.slides) != len(slides):
        raise CompositionCompileError("Design Program slide count mismatch")
    normalized = program.model_copy(deep=True)
    selected_ids = _select_composition_sequence(
        normalized,
        slides,
        force_light=force_light,
        force_dark=force_dark,
        media_policy=media_policy,
        media_budget=media_budget,
    )
    for index, (direction, selected) in enumerate(
        zip(normalized.slides, selected_ids, strict=True)
    ):
        selected_spec = COMPOSITION_SPECS[selected]
        direction.composition_id = selected
        official_source_available = slides[index].get("officialSourceAvailable")
        if selected_spec.media_requirement == "none" or media_policy in {"minimal", "avoid"}:
            direction.asset_role = "none"
            direction.required_asset = False
        elif selected_spec.media_requirement == "required":
            if direction.asset_role == "none":
                if media_policy == "hybrid":
                    direction.asset_role = (
                        "evidence"
                        if official_source_available is True
                        else "atmosphere"
                    )
                else:
                    direction.asset_role = "atmosphere" if index == 0 else "evidence"
            direction.required_asset = True
        if (
            media_policy == "hybrid"
            and direction.asset_role == "evidence"
            and official_source_available is False
        ):
            direction.asset_role = "none"
            direction.required_asset = False

    _enforce_media_budget(normalized, slides, media_policy, media_budget)
    if media_policy == "hybrid":
        _enforce_hybrid_media_mix(normalized, slides, media_budget)
    _enforce_background_rhythm(normalized, force_light, force_dark)
    return DeckDesignProgram.model_validate(normalized.model_dump(by_alias=True))


def _select_composition_sequence(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
    *,
    force_light: bool,
    force_dark: bool,
    media_policy: str,
    media_budget: int,
) -> list[CompositionId]:
    candidates_by_slide: list[tuple[CompositionId, ...]] = []
    for index, (direction, slide) in enumerate(zip(program.slides, slides, strict=True)):
        slide_type = _composition_slide_type(slide)
        if index == 0:
            slide_type = "cover"
        elif index == len(slides) - 1:
            slide_type = "summary"
        item_count = len(_items(slide))
        preferred = "cta-closing" if index == len(slides) - 1 else direction.composition_id
        candidates = tuple(
            candidate
            for candidate in dict.fromkeys(
                (preferred, *FALLBACK_COMPOSITIONS.get(slide_type, ("statement-poster",)))
            )
            if _supports(candidate, slide_type, item_count)
            and content_supports_composition(candidate, slide)
            and not unavailable_hybrid_evidence_candidate(
                candidate,
                direction,
                slide,
                index,
                media_policy,
            )
            and not ((force_light or force_dark) and candidate == "hero-full-bleed")
            and not (
                media_policy in {"minimal", "avoid"}
                and COMPOSITION_SPECS[candidate].media_requirement == "required"
            )
        )
        if (
            media_policy == "hybrid"
            and slide.get("officialSourceAvailable") is False
            and direction.asset_role == "evidence"
        ):
            candidates = tuple(
                sorted(
                    candidates,
                    key=lambda candidate: (
                        COMPOSITION_SPECS[candidate].media_requirement != "optional"
                    ),
                )
            )
        if not candidates:
            raise CompositionCompileError(
                f"No composition supports {slide_type} with {item_count} content items"
            )
        candidates_by_slide.append(candidates)

    selected: list[CompositionId] = []
    usage: Counter[str] = Counter()
    body_slide_count = max(0, len(slides) - 2)
    validator_unique_target = (
        (body_slide_count * 3 + 3) // 4 if body_slide_count >= 5 else 0
    )
    supported_body_compositions = {
        composition_id
        for candidates in candidates_by_slide[1:-1]
        for composition_id in candidates
    }
    required_unique_body = min(
        validator_unique_target,
        len(supported_body_compositions),
    )

    def choose(index: int, previous_silhouette: str, required_assets: int) -> bool:
        if index == len(candidates_by_slide):
            return len(set(selected[1:-1])) >= required_unique_body
        selected_body = set(selected[1:])
        remaining_body = max(0, len(candidates_by_slide) - 1 - max(index, 1))
        if len(selected_body) + remaining_body < required_unique_body:
            return False
        candidates = candidates_by_slide[index]
        if 0 < index < len(candidates_by_slide) - 1:
            candidates = tuple(
                [candidate for candidate in candidates if candidate not in selected_body]
                + [candidate for candidate in candidates if candidate in selected_body]
            )
        for candidate in candidates:
            spec = COMPOSITION_SPECS[candidate]
            next_required_assets = required_assets + (spec.media_requirement == "required")
            if (
                usage[candidate] >= 2
                or spec.silhouette == previous_silhouette
                or next_required_assets > media_budget
            ):
                continue
            usage[candidate] += 1
            selected.append(candidate)
            if choose(index + 1, spec.silhouette, next_required_assets):
                return True
            selected.pop()
            usage[candidate] -= 1
        return False

    if not choose(0, "", 0):
        raise CompositionCompileError("No composition sequence satisfies the deck constraints")
    return selected


def content_supports_composition(
    composition_id: CompositionId,
    slide: dict[str, Any],
) -> bool:
    items = _items(slide)
    if composition_id == "kpi-strip-evidence":
        return sum(bool(re.search(r"\d", value)) for _, value in items) >= 2
    if composition_id == "metric-poster":
        metric_text = " ".join(
            [str(slide.get("message", "")), *[value for _, value in items]]
        )
        return bool(re.search(r"\d", metric_text))
    return True


def unavailable_hybrid_evidence_candidate(
    composition_id: CompositionId,
    direction: SlideCompositionDirection,
    slide: dict[str, Any],
    index: int,
    media_policy: str,
) -> bool:
    if (
        media_policy != "hybrid"
        or slide.get("officialSourceAvailable") is not False
    ):
        return False
    spec = COMPOSITION_SPECS[composition_id]
    effective_role = direction.asset_role
    if spec.media_requirement == "required" and effective_role == "none":
        effective_role = "atmosphere" if index == 0 else "evidence"
    return spec.media_requirement == "required" and effective_role == "evidence"


def compile_composition(
    direction: SlideCompositionDirection,
    slide: dict[str, Any],
    program: DeckDesignProgram,
) -> CompiledComposition:
    spec = COMPOSITION_SPECS[direction.composition_id]
    item_count = len(_items(slide))
    slide_type = str(slide.get("slideType", "summary"))
    if not spec.min_items <= item_count <= spec.max_items:
        raise CompositionCompileError(
            f"{direction.composition_id} does not support {item_count} content items"
        )
    if direction.variant not in spec.variants:
        raise CompositionCompileError(
            f"{direction.composition_id} does not support {direction.variant}"
        )
    style = _style(program, direction.background_mode)
    elements, focal_id = spec.factory(direction, slide, style)
    elements = _deduplicate_exact_visible_text(elements)
    if focal_id not in {str(element.get("elementId")) for element in elements}:
        raise CompositionCompileError("Composition focal element is missing")
    return CompiledComposition(
        elements=elements,
        primary_focal_element_id=focal_id,
        layout=_deck_layout(direction.composition_id, slide_type),
        background_color=style.background,
    )


def design_program_snapshot(program: DeckDesignProgram) -> dict[str, Any]:
    return {
        "version": program.version,
        "visualConcept": program.visual_concept,
        "paletteRoles": program.palette_roles.model_dump(),
        "typography": program.typography.model_dump(by_alias=True),
        "backgroundSequence": program.background_sequence,
        "imageStyle": program.image_style,
        "surfaceStyle": program.surface_style,
        "compositionIds": [slide.composition_id for slide in program.slides],
    }


def _supports(composition_id: CompositionId, slide_type: str, item_count: int) -> bool:
    spec = COMPOSITION_SPECS[composition_id]
    return slide_type in spec.purposes and spec.min_items <= item_count <= spec.max_items


def _first_supported(
    candidates: tuple[CompositionId, ...],
    slide_type: str,
    item_count: int,
    *,
    usage: Counter[str] | None = None,
    forbidden_silhouette: str = "",
    allow_missing: bool = False,
) -> CompositionId | None:
    for candidate in candidates:
        spec = COMPOSITION_SPECS[candidate]
        if not _supports(candidate, slide_type, item_count):
            continue
        if usage is not None and usage[candidate] >= 2:
            continue
        if forbidden_silhouette and spec.silhouette == forbidden_silhouette:
            continue
        return candidate
    if allow_missing:
        return None
    raise CompositionCompileError(
        f"No composition supports {slide_type} with {item_count} content items"
    )


def _enforce_media_budget(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
    media_policy: str,
    media_budget: int,
) -> None:
    if media_policy in {"minimal", "avoid"}:
        return
    if media_policy == "hybrid" and not any(
        direction.asset_role == "evidence" for direction in program.slides
    ):
        _promote_official_evidence(program, slides)
    selected = sorted(
        (slide for slide in program.slides if slide.asset_role != "none"),
        key=lambda direction: direction.asset_role != "evidence",
    )
    for direction in selected[media_budget:]:
        if COMPOSITION_SPECS[direction.composition_id].media_requirement == "required":
            slide = slides[direction.order - 1]
            slide_type = (
                "cover" if direction.order == 1 else _composition_slide_type(slide)
            )
            item_count = len(_items(slide))
            alternatives = tuple(
                candidate
                for candidate in FALLBACK_COMPOSITIONS.get(slide_type, ())
                if COMPOSITION_SPECS[candidate].media_requirement != "required"
            )
            replacement = _first_supported(alternatives, slide_type, item_count, allow_missing=True)
            if replacement is None:
                continue
            direction.composition_id = replacement
        direction.asset_role = "none"
        direction.required_asset = False

    minimum = min(3, media_budget)
    current = sum(slide.asset_role != "none" for slide in program.slides)
    if current >= minimum:
        return
    for direction in program.slides:
        if current >= minimum:
            break
        if direction.asset_role != "none":
            continue
        index = direction.order - 1
        candidate = _media_candidate(program, slides, index)
        if candidate is None:
            continue
        direction.composition_id = candidate
        slide = slides[index]
        direction.asset_role = (
            "evidence" if slide.get("officialSourceAvailable") is True else "atmosphere"
        )
        direction.required_asset = False
        current += 1


def _promote_official_evidence(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
) -> None:
    usage = Counter(direction.composition_id for direction in program.slides)
    for index, (direction, slide) in enumerate(
        zip(program.slides, slides, strict=True)
    ):
        if slide.get("officialSourceAvailable") is not True:
            continue
        candidate = _media_candidate(
            program,
            slides,
            index,
            usage=usage,
            allow_required=True,
        )
        if candidate is None:
            continue
        usage[direction.composition_id] -= 1
        direction.composition_id = candidate
        direction.asset_role = "evidence"
        direction.required_asset = (
            COMPOSITION_SPECS[candidate].media_requirement == "required"
        )
        return


def _enforce_hybrid_media_mix(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
    media_budget: int,
) -> None:
    evidence = [
        direction
        for direction in program.slides
        if direction.asset_role == "evidence"
    ]
    if evidence:
        keeper = max(
            evidence,
            key=lambda direction: (
                direction.required_asset,
                direction.order not in {1, len(program.slides)},
                -direction.order,
            ),
        )
        for direction in evidence:
            if direction is keeper:
                continue
            spec = COMPOSITION_SPECS[direction.composition_id]
            if direction.order in {1, len(program.slides)} and spec.media_requirement == "optional":
                direction.asset_role = "atmosphere"
                direction.required_asset = False
            elif spec.media_requirement == "optional":
                direction.asset_role = "none"
                direction.required_asset = False

    target_atmosphere = min(2, max(1, media_budget - 1))
    preferred_indices = list(
        dict.fromkeys(
            [
                0,
                len(program.slides) - 1,
                *[
                    index
                    for index, slide in enumerate(slides)
                    if slide.get("officialSourceAvailable") is not True
                ],
                *range(len(program.slides)),
            ]
        )
    )
    for index in preferred_indices:
        if (
            sum(
                direction.asset_role == "atmosphere"
                for direction in program.slides
            )
            >= target_atmosphere
        ):
            break
        direction = program.slides[index]
        if direction.asset_role != "none":
            continue
        candidate = _media_candidate(program, slides, index)
        if candidate is None:
            continue
        direction.composition_id = candidate
        direction.asset_role = "atmosphere"
        direction.required_asset = False


def _media_candidate(
    program: DeckDesignProgram,
    slides: list[dict[str, Any]],
    index: int,
    *,
    usage: Counter[str] | None = None,
    allow_required: bool = False,
) -> CompositionId | None:
    direction = program.slides[index]
    slide = slides[index]
    slide_type = "cover" if index == 0 else _composition_slide_type(slide)
    item_count = len(_items(slide))
    composition_usage = usage or Counter(
        item.composition_id for item in program.slides
    )
    neighboring_silhouettes = {
        COMPOSITION_SPECS[program.slides[neighbor].composition_id].silhouette
        for neighbor in (index - 1, index + 1)
        if 0 <= neighbor < len(program.slides)
    }
    candidates = (
        direction.composition_id,
        *FALLBACK_COMPOSITIONS.get(slide_type, ()),
    )
    return next(
        (
            candidate
            for candidate in dict.fromkeys(candidates)
            if COMPOSITION_SPECS[candidate].media_requirement
            in ({"optional", "required"} if allow_required else {"optional"})
            and _supports(candidate, slide_type, item_count)
            and content_supports_composition(candidate, slide)
            and composition_usage[candidate]
            - int(candidate == direction.composition_id)
            < 2
            and COMPOSITION_SPECS[candidate].silhouette
            not in neighboring_silhouettes
        ),
        None,
    )


def _enforce_background_rhythm(
    program: DeckDesignProgram,
    force_light: bool,
    force_dark: bool,
) -> None:
    if force_light:
        for slide in program.slides:
            if slide.composition_id == "hero-full-bleed":
                slide.composition_id = "hero-split"
            slide.background_mode = "light"
            slide.variant = "light"
        program.background_sequence = ["light"] * len(program.slides)
        return
    if force_dark:
        for slide in program.slides:
            if slide.composition_id == "hero-full-bleed":
                slide.composition_id = "hero-split"
            slide.background_mode = "dark"
            slide.variant = "dark"
        program.background_sequence = ["dark"] * len(program.slides)
        return
    if len(program.slides) >= 6 and len({slide.background_mode for slide in program.slides}) < 2:
        for index, slide in enumerate(program.slides):
            if slide.composition_id == "hero-full-bleed":
                slide.background_mode = "image"
                slide.variant = "image"
            elif index in {0, len(program.slides) - 1}:
                slide.background_mode = "dark"
                slide.variant = "dark"
            else:
                slide.background_mode = "light"
                slide.variant = "light"
    for slide in program.slides:
        if slide.composition_id == "hero-full-bleed":
            slide.background_mode = "image"
            slide.variant = "image"
        elif slide.background_mode == "image":
            slide.background_mode = "dark"
            slide.variant = "dark"
    _break_long_background_runs(program)
    program.background_sequence = [slide.background_mode for slide in program.slides]


def _composition_slide_type(slide: dict[str, Any]) -> str:
    slide_type = str(slide.get("slideType", "summary"))
    if slide_type != "chart":
        return slide_type
    content = " ".join(
        [str(slide.get("message", "")), *[value for _, value in _items(slide)]]
    )
    return "chart" if re.search(r"\d", content) else "feature-grid"


def _break_long_background_runs(program: DeckDesignProgram) -> None:
    index = 0
    while index < len(program.slides):
        mode = program.slides[index].background_mode
        run_end = index + 1
        while (
            run_end < len(program.slides)
            and program.slides[run_end].background_mode == mode
        ):
            run_end += 1
        run_length = run_end - index
        if mode in {"light", "dark"} and run_length > 4:
            pivot = index + run_length // 2
            replacement = "dark" if mode == "light" else "light"
            program.slides[pivot].background_mode = replacement
            program.slides[pivot].variant = replacement
            index = pivot + 1
            continue
        index = run_end


def _style(program: DeckDesignProgram, mode: BackgroundMode) -> Style:
    roles = program.palette_roles
    scale = program.typography.type_scale
    if mode in {"dark", "image"}:
        background = (
            roles.dominant
            if _is_dark(roles.dominant)
            else roles.text
            if _is_dark(roles.text)
            else "#101828"
        )
        text = roles.text if not _is_dark(roles.text) else "#FFFFFF"
        surface = roles.surface if _is_dark(roles.surface) else "#1F2937"
        muted_text = "#D1D5DB"
    else:
        background = roles.dominant if not _is_dark(roles.dominant) else "#FFFFFF"
        text = roles.text if _is_dark(roles.text) else "#111827"
        surface = roles.surface if not _is_dark(roles.surface) else "#F3F4F6"
        muted_text = "#475569"
    if surface.casefold() == background.casefold():
        surface = "#1F2937" if mode in {"dark", "image"} else "#F3F4F6"
    return Style(
        background=background,
        surface=surface,
        text=text,
        muted_text=muted_text,
        focal=roles.focal,
        secondary=roles.secondary,
        heading_font=program.typography.heading_font,
        body_font=program.typography.body_font,
        cover_size=max(44, int(scale.get("cover", 60))),
        title_size=max(32, int(scale.get("title", 40))),
        body_size=max(18, int(scale.get("body", 22))),
        caption_size=max(14, int(scale.get("caption", 14))),
    )


def _is_dark(color: str) -> bool:
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
        return False
    red, green, blue = (int(color[index : index + 2], 16) for index in (1, 3, 5))
    return (red * 299 + green * 587 + blue * 114) / 1000 < 128


def _contrasting_text_color(background: str, preferred: str) -> str:
    return "#FFFFFF" if _is_dark(background) else preferred


def _metric_value(slide: dict[str, Any], items: list[tuple[str, str]]) -> str:
    values = [str(slide.get("message", "")), *(value for _, value in items)]
    for value in values:
        date_match = re.search(
            r"\d{4}\s*년(?:\s*\d{1,2}\s*월)?(?:\s*\d{1,2}\s*일)?",
            value,
        )
        if date_match:
            return " ".join(date_match.group(0).split())
        match = re.search(r"(?:\d[\d,.]*\s?(?:%|만|억|배|명|개|월|일|년)?)", value)
        if match:
            return match.group(0)
    return textwrap.shorten(str(slide.get("message", "")), width=24, placeholder="...")


def _media_caption(slide: dict[str, Any]) -> str:
    intent = slide.get("mediaIntent", {})
    return str(intent.get("alt") or intent.get("caption") or slide.get("title", "Visual"))


def _deck_layout(composition_id: CompositionId, slide_type: str) -> str:
    if composition_id in {"hero-split", "hero-full-bleed", "minimal-cover"}:
        return "title"
    if composition_id == "cta-closing" or slide_type == "summary":
        return "closing"
    if composition_id in {"editorial-split", "image-evidence", "feature-comparison"}:
        return "two-column"
    return "title-content"
