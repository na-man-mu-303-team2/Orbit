from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Literal

from app.ai.motion_planner.models import MotionUnitSemanticRole

MotionStructureFamily = Literal[
    "timeline",
    "feature-comparison",
    "diagram-hub",
]


class MotionStructureResolutionError(ValueError):
    def __init__(
        self,
        structure_family: MotionStructureFamily,
        reason: str,
    ) -> None:
        super().__init__(f"{structure_family}: {reason}")
        self.structure_family = structure_family
        self.reason = reason


@dataclass(frozen=True)
class ResolvedMotionSlot:
    slot_id: str
    order: int
    member_element_ids: tuple[str, ...]
    frame_element_id: str
    semantic_role: MotionUnitSemanticRole


@dataclass(frozen=True)
class ResolvedMotionStructure:
    family: MotionStructureFamily
    slots: tuple[ResolvedMotionSlot, ...]


MotionStructureResolver = Callable[
    [dict[str, Any], list[dict[str, Any]]],
    ResolvedMotionStructure,
]

STRUCTURE_RESOLVERS: dict[str, MotionStructureResolver] = {}
SHAPE_TYPES = {"rect", "ellipse", "polygon", "star", "ring", "customShape"}


def register_structure_resolver(
    composition_id: str,
) -> Callable[[MotionStructureResolver], MotionStructureResolver]:
    def decorator(resolver: MotionStructureResolver) -> MotionStructureResolver:
        if composition_id in STRUCTURE_RESOLVERS:
            raise ValueError(
                f"Motion structure resolver already registered: {composition_id}"
            )
        STRUCTURE_RESOLVERS[composition_id] = resolver
        return resolver

    return decorator


def resolve_motion_structure(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure | None:
    composition_id = _composition_id(slide)
    resolver = STRUCTURE_RESOLVERS.get(composition_id)
    return resolver(slide, elements) if resolver is not None else None


def _composition_id(slide: dict[str, Any]) -> str:
    ai_notes = slide.get("aiNotes")
    if not isinstance(ai_notes, dict):
        return ""
    composition = ai_notes.get("compositionPlan")
    if not isinstance(composition, dict):
        return ""
    return str(composition.get("compositionId", ""))


@register_structure_resolver("timeline")
def _resolve_timeline(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure:
    del slide
    family: MotionStructureFamily = "timeline"
    markers = _indexed_elements(
        elements,
        r"_timeline_marker_(\d+)(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
    )
    if not markers:
        marker_candidates = [
            element
            for element in elements
            if element.get("type") in SHAPE_TYPES
            and str(element.get("role", "")) == "decoration"
            and 24 <= _width(element) <= 96
            and 24 <= _height(element) <= 96
            and max(_width(element), _height(element))
            / max(1.0, min(_width(element), _height(element)))
            <= 1.5
        ]
        if not 3 <= len(marker_candidates) <= 6:
            raise MotionStructureResolutionError(
                family,
                "expected three to six aligned timeline markers",
            )
        horizontal = _axis_is_horizontal(marker_candidates)
        marker_candidates.sort(
            key=lambda element: _center(element)[0 if horizontal else 1]
        )
        markers = {
            index: element
            for index, element in enumerate(marker_candidates, start=1)
        }

    expected_ordinals = list(range(1, len(markers) + 1))
    if sorted(markers) != expected_ordinals or not 3 <= len(markers) <= 6:
        raise MotionStructureResolutionError(
            family,
            "timeline marker indexes must be consecutive from one",
        )
    horizontal = _axis_is_horizontal(list(markers.values()))

    marker_labels = _indexed_elements(
        elements,
        r"_timeline_marker_label_(\d+)(?:_r\d+)?$",
        _is_text,
        family,
    )
    indexes = _indexed_elements(
        elements,
        r"_timeline_(\d+)_index(?:_r\d+)?$",
        _is_text,
        family,
    )
    bodies = _indexed_elements(
        elements,
        r"_timeline_(\d+)(?:_r\d+)?$",
        lambda element: _is_text(element)
        and str(element.get("role", "")) == "body",
        family,
    )

    numeric_candidates = [
        element
        for element in elements
        if _is_text(element) and _numeric_text(element) is not None
    ]
    body_candidates = [
        element
        for element in elements
        if _is_text(element) and str(element.get("role", "")) == "body"
    ]
    used_ids: set[str] = set()
    slots: list[ResolvedMotionSlot] = []
    for ordinal in expected_ordinals:
        marker = markers[ordinal]
        marker_id = _element_id(marker)
        label = marker_labels.get(ordinal) or _single_contained_numeric_text(
            marker,
            numeric_candidates,
            used_ids,
            family,
        )
        used_ids.add(_element_id(label))
        index = indexes.get(ordinal) or _nearest_axis_element(
            marker,
            [
                candidate
                for candidate in numeric_candidates
                if _element_id(candidate) not in used_ids
                and not _center_is_inside(marker, candidate)
            ],
            horizontal,
            family,
            f"timeline {ordinal} index",
        )
        used_ids.add(_element_id(index))
        body = bodies.get(ordinal) or _nearest_axis_element(
            marker,
            [
                candidate
                for candidate in body_candidates
                if _element_id(candidate) not in used_ids
            ],
            horizontal,
            family,
            f"timeline {ordinal} body",
        )
        used_ids.add(_element_id(body))
        slots.append(
            ResolvedMotionSlot(
                slot_id=f"timeline-{ordinal}",
                order=ordinal,
                member_element_ids=(
                    marker_id,
                    _element_id(label),
                    _element_id(index),
                    _element_id(body),
                ),
                frame_element_id=marker_id,
                semantic_role="card",
            )
        )

    if len({_element_id(body) for body in body_candidates} & used_ids) != len(
        expected_ordinals
    ):
        raise MotionStructureResolutionError(
            family,
            "timeline bodies do not map one-to-one to markers",
        )
    return ResolvedMotionStructure(family=family, slots=tuple(slots))


def _indexed_elements(
    elements: list[dict[str, Any]],
    pattern: str,
    predicate: Callable[[dict[str, Any]], bool],
    family: MotionStructureFamily,
) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for element in elements:
        match = re.search(pattern, _element_id(element))
        if match is None or not predicate(element):
            continue
        ordinal = int(match.group(1))
        if ordinal in result:
            raise MotionStructureResolutionError(
                family,
                f"duplicate structural index {ordinal}",
            )
        result[ordinal] = element
    return result


def _single_contained_numeric_text(
    container: dict[str, Any],
    candidates: list[dict[str, Any]],
    used_ids: set[str],
    family: MotionStructureFamily,
) -> dict[str, Any]:
    matches = [
        candidate
        for candidate in candidates
        if _element_id(candidate) not in used_ids
        and _center_is_inside(container, candidate)
    ]
    if len(matches) != 1:
        raise MotionStructureResolutionError(
            family,
            "timeline marker must contain exactly one numeric label",
        )
    return matches[0]


def _nearest_axis_element(
    anchor: dict[str, Any],
    candidates: list[dict[str, Any]],
    horizontal: bool,
    family: MotionStructureFamily,
    label: str,
) -> dict[str, Any]:
    axis = 0 if horizontal else 1
    anchor_position = _center(anchor)[axis]
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            abs(_center(candidate)[axis] - anchor_position),
            _element_id(candidate),
        ),
    )
    if not ranked:
        raise MotionStructureResolutionError(family, f"{label} is missing")
    if len(ranked) > 1:
        first_distance = abs(_center(ranked[0])[axis] - anchor_position)
        second_distance = abs(_center(ranked[1])[axis] - anchor_position)
        if abs(first_distance - second_distance) < 1:
            raise MotionStructureResolutionError(
                family,
                f"{label} has ambiguous geometry",
            )
    return ranked[0]


def _axis_is_horizontal(elements: list[dict[str, Any]]) -> bool:
    centers = [_center(element) for element in elements]
    x_range = max(center[0] for center in centers) - min(center[0] for center in centers)
    y_range = max(center[1] for center in centers) - min(center[1] for center in centers)
    return x_range >= y_range


def _center_is_inside(
    container: dict[str, Any],
    child: dict[str, Any],
) -> bool:
    child_x, child_y = _center(child)
    return bool(
        float(container.get("x", 0))
        <= child_x
        <= float(container.get("x", 0)) + _width(container)
        and float(container.get("y", 0))
        <= child_y
        <= float(container.get("y", 0)) + _height(container)
    )


def _numeric_text(element: dict[str, Any]) -> int | None:
    props = element.get("props")
    value = props.get("text") if isinstance(props, dict) else None
    normalized = str(value or "").strip()
    return int(normalized) if re.fullmatch(r"\d{1,2}", normalized) else None


def _is_text(element: dict[str, Any]) -> bool:
    return element.get("type") == "text"


def _element_id(element: dict[str, Any]) -> str:
    return str(element.get("elementId", ""))


def _width(element: dict[str, Any]) -> float:
    return max(0.0, float(element.get("width", 0)))


def _height(element: dict[str, Any]) -> float:
    return max(0.0, float(element.get("height", 0)))


def _center(element: dict[str, Any]) -> tuple[float, float]:
    return (
        float(element.get("x", 0)) + _width(element) / 2,
        float(element.get("y", 0)) + _height(element) / 2,
    )
