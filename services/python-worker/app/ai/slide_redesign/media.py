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


def collect_source_images(slide: dict[str, Any]) -> list[dict[str, Any]]:
    """Collect existing image/svg elements from largest frame to smallest."""
    elements = slide.get("elements")
    if not isinstance(elements, list):
        return []
    sources = [
        element
        for element in elements
        if isinstance(element, dict) and element.get("type") in {"image", "svg"}
    ]
    return sorted(
        sources,
        key=lambda element: _frame(element)[2] * _frame(element)[3],
        reverse=True,
    )


def assign_media(
    slots: list[MediaSlot],
    sources: list[dict[str, Any]],
) -> list[MediaAssignment] | None:
    """Assign largest sources to largest slots without dropping any source."""
    if len(sources) > len(slots):
        return None
    sorted_slots = sorted(
        slots,
        key=lambda slot: slot.width * slot.height,
        reverse=True,
    )
    sorted_sources = sorted(
        sources,
        key=lambda element: _frame(element)[2] * _frame(element)[3],
        reverse=True,
    )
    assignments: list[MediaAssignment] = []
    for index, slot in enumerate(sorted_slots):
        if index >= len(sorted_sources):
            assignments.append(
                MediaAssignment(
                    slot=slot,
                    source_element_id=None,
                    needs_generation=True,
                    fit="cover",
                )
            )
            continue
        source = sorted_sources[index]
        source_id = source.get("elementId")
        if not isinstance(source_id, str) or not source_id:
            return None
        _, _, width, height = _frame(source)
        source_ratio = _aspect_ratio(width, height) if width > 0 and height > 0 else None
        assignments.append(
            MediaAssignment(
                slot=slot,
                source_element_id=source_id,
                needs_generation=False,
                fit=(
                    "contain"
                    if source_ratio == slot.aspect_ratio
                    else "cover"
                ),
            )
        )
    return assignments


def build_media_operations(
    slide_id: str,
    assignments: list[MediaAssignment],
) -> list[dict[str, Any]]:
    """Move assigned sources into media slots without replacing their IDs."""
    operations: list[dict[str, Any]] = []
    for assignment in assignments:
        element_id = assignment.source_element_id
        if element_id is None:
            continue
        slot = assignment.slot
        operations.extend(
            [
                {
                    "type": "update_element_frame",
                    "slideId": slide_id,
                    "elementId": element_id,
                    "frame": {
                        "role": "media",
                        "x": slot.x,
                        "y": slot.y,
                        "width": slot.width,
                        "height": slot.height,
                        "zIndex": slot.z_index + 1,
                    },
                },
                {
                    "type": "update_element_props",
                    "slideId": slide_id,
                    "elementId": element_id,
                    "props": {"fit": assignment.fit},
                },
            ]
        )
    return operations


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
