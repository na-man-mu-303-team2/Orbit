from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.composition_library import CompiledComposition


AspectRatio = Literal["landscape", "portrait", "square"]


@dataclass(frozen=True)
class MediaSlot:
    placeholder_element_id: str
    caption_element_id: str | None
    x: float
    y: float
    width: float
    height: float
    z_index: int
    aspect_ratio: AspectRatio


@dataclass(frozen=True)
class MediaAssignment:
    slot: MediaSlot
    source_element_id: str | None
    needs_generation: bool
    fit: Literal["cover", "contain"]


def find_media_slots(compiled: CompiledComposition) -> list[MediaSlot]:
    """Interpret compiled media placeholder rects as stable layout slots."""
    element_ids = {
        str(element["elementId"])
        for element in compiled.elements
        if isinstance(element.get("elementId"), str)
    }
    slots: list[MediaSlot] = []
    for element in compiled.elements:
        element_id = element.get("elementId")
        if (
            not isinstance(element_id, str)
            or not element_id.endswith("_media_placeholder")
            or element.get("type") != "rect"
            or element.get("role") != "media"
        ):
            continue
        x, y, width, height = _frame(element)
        if width <= 0 or height <= 0:
            continue
        caption_id = element_id.removesuffix("_media_placeholder") + "_media_caption"
        slots.append(
            MediaSlot(
                placeholder_element_id=element_id,
                caption_element_id=(
                    caption_id if caption_id in element_ids else None
                ),
                x=x,
                y=y,
                width=width,
                height=height,
                z_index=_integer(element.get("zIndex")),
                aspect_ratio=_aspect_ratio(width, height),
            )
        )
    return slots


def _aspect_ratio(width: float, height: float) -> AspectRatio:
    ratio = width / height
    if ratio > 1.2:
        return "landscape"
    if ratio < 0.8:
        return "portrait"
    return "square"


def _frame(element: dict[str, Any]) -> tuple[float, float, float, float]:
    return (
        _number(element.get("x")),
        _number(element.get("y")),
        _number(element.get("width")),
        _number(element.get("height")),
    )


def _number(value: object) -> float:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _integer(value: object) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0
