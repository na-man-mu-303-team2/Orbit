from __future__ import annotations

import re
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from app.ai.design_program import CompositionId, PaletteRoles


Element = dict[str, Any]
ShapeType = Literal["ellipse", "line", "polygon"]
SAFE_X = 120
SAFE_Y = 88
SAFE_RIGHT = 1800
SAFE_BOTTOM = 992
MAX_ORNAMENTS = 12


@dataclass(frozen=True)
class OrnamentCandidate:
    element: Element
    allowed_overlap_element_ids: frozenset[str] = frozenset()
    allow_safe_area_overflow: bool = False


def generate_ornaments(
    composition_id: CompositionId,
    elements: list[Element],
    palette: PaletteRoles,
) -> list[Element]:
    """Generate optional composition ornaments without moving content elements."""
    candidates: list[OrnamentCandidate]
    if composition_id == "process-horizontal":
        candidates = _process_ornaments(elements, palette)
    elif composition_id == "statement-poster":
        candidates = _statement_ornaments(palette)
    elif composition_id == "metric-poster":
        candidates = _metric_ornaments(elements, palette)
    else:
        candidates = []
    return finalize_ornaments(candidates, elements)


def finalize_ornaments(
    candidates: list[OrnamentCandidate],
    content_elements: list[Element],
    *,
    max_count: int = MAX_ORNAMENTS,
) -> list[Element]:
    """Drop unsafe ornaments and cap the result; content always wins collisions."""
    if max_count <= 0:
        return []
    text_elements = [
        element
        for element in content_elements
        if element.get("type") == "text" and element.get("visible") is not False
    ]
    max_z_index = max(
        (_integer(element.get("zIndex"), 0) for element in content_elements),
        default=0,
    )
    accepted: list[Element] = []
    for candidate in candidates:
        element = deepcopy(candidate.element)
        element["zIndex"] = max_z_index + 1
        if not _has_ornament_contract(element):
            continue
        if not candidate.allow_safe_area_overflow and not _inside_safe_area(element):
            continue
        overlapping_text_ids = {
            str(text["elementId"])
            for text in text_elements
            if isinstance(text.get("elementId"), str)
            and _overlaps(element, text)
        }
        if overlapping_text_ids - candidate.allowed_overlap_element_ids:
            continue
        accepted.append(element)
        if len(accepted) == max_count:
            break
    return accepted


def _process_ornaments(
    elements: list[Element], palette: PaletteRoles
) -> list[OrnamentCandidate]:
    fields: list[tuple[int, Element]] = []
    for element in elements:
        element_id = str(element.get("elementId", ""))
        match = re.search(r"_step_(\d+)_field$", element_id)
        if match and element.get("type") == "rect":
            fields.append((int(match.group(1)), element))
    fields.sort(key=lambda item: item[0])

    candidates: list[OrnamentCandidate] = []
    for index, field in fields:
        x, y, width, _ = _frame(field)
        number_id = _find_element_id(elements, rf"_step_number_{index}$")
        candidates.append(
            OrnamentCandidate(
                _shape(
                    "ellipse",
                    f"step_badge_{index}",
                    x + 24,
                    y + 20,
                    min(72, max(40, width - 48)),
                    72,
                    fill="transparent",
                    stroke=palette.focal,
                    stroke_width=4,
                    border_radius=36,
                ),
                frozenset({number_id}) if number_id else frozenset(),
            )
        )

    for connector_index, ((_, left), (_, right)) in enumerate(
        zip(fields, fields[1:], strict=False),
        start=1,
    ):
        left_x, left_y, left_width, left_height = _frame(left)
        right_x, right_y, _, right_height = _frame(right)
        left_center_y = left_y + left_height / 2
        right_center_y = right_y + right_height / 2
        gap = right_x - (left_x + left_width)
        if gap < 12 or abs(left_center_y - right_center_y) > 8:
            continue
        candidates.append(
            OrnamentCandidate(
                _shape(
                    "line",
                    f"connector_{connector_index}",
                    left_x + left_width + 4,
                    left_center_y - 2,
                    gap - 8,
                    4,
                    fill="transparent",
                    stroke=palette.secondary,
                    stroke_width=4,
                    border_radius=0,
                    lineCap="round",
                )
            )
        )
    return candidates


def _statement_ornaments(palette: PaletteRoles) -> list[OrnamentCandidate]:
    return [
        OrnamentCandidate(
            _shape(
                "polygon",
                "accent_bar_1",
                1728,
                312,
                40,
                216,
                fill=palette.focal,
                stroke="transparent",
                stroke_width=0,
                border_radius=0,
                sides=4,
            )
        )
    ]


def _metric_ornaments(
    elements: list[Element], palette: PaletteRoles
) -> list[OrnamentCandidate]:
    metric = next(
        (
            element
            for element in elements
            if re.search(r"_metric$", str(element.get("elementId", "")))
            and element.get("type") == "text"
        ),
        None,
    )
    if metric is None:
        return []
    x, y, width, height = _frame(metric)
    diameter = min(360, max(200, height + 80))
    ring = _shape(
        "ellipse",
        "metric_ring_1",
        x + width / 2 - diameter / 2,
        y + height / 2 - diameter / 2,
        diameter,
        diameter,
        fill="transparent",
        stroke=palette.focal,
        stroke_width=6,
        border_radius=diameter / 2,
    )
    return [
        OrnamentCandidate(
            ring,
            frozenset({str(metric["elementId"])}),
        )
    ]


def _shape(
    shape_type: ShapeType,
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    fill: str,
    stroke: str,
    stroke_width: float,
    border_radius: float,
    **extra_props: Any,
) -> Element:
    return {
        "elementId": f"el_orn_{name}",
        "type": shape_type,
        "role": "decoration",
        "x": x,
        "y": y,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": 0,
        "locked": False,
        "visible": True,
        "props": {
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": stroke_width,
            "borderRadius": border_radius,
            **extra_props,
        },
    }


def _has_ornament_contract(element: Element) -> bool:
    element_id = element.get("elementId")
    return (
        isinstance(element_id, str)
        and element_id.startswith("el_orn_")
        and element.get("type") in {"ellipse", "line", "polygon"}
        and element.get("role") == "decoration"
        and all(value > 0 for value in _frame(element)[2:])
    )


def _inside_safe_area(element: Element) -> bool:
    x, y, width, height = _frame(element)
    return (
        x >= SAFE_X
        and y >= SAFE_Y
        and x + width <= SAFE_RIGHT
        and y + height <= SAFE_BOTTOM
    )


def _overlaps(left: Element, right: Element) -> bool:
    left_x, left_y, left_width, left_height = _frame(left)
    right_x, right_y, right_width, right_height = _frame(right)
    return (
        left_x < right_x + right_width
        and left_x + left_width > right_x
        and left_y < right_y + right_height
        and left_y + left_height > right_y
    )


def _frame(element: Element) -> tuple[float, float, float, float]:
    return (
        _number(element.get("x")),
        _number(element.get("y")),
        _number(element.get("width")),
        _number(element.get("height")),
    )


def _find_element_id(elements: list[Element], pattern: str) -> str | None:
    return next(
        (
            str(element["elementId"])
            for element in elements
            if isinstance(element.get("elementId"), str)
            and re.search(pattern, str(element["elementId"]))
        ),
        None,
    )


def _number(value: object) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _integer(value: object, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default
