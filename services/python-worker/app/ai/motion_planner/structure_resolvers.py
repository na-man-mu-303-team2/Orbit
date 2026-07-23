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


@register_structure_resolver("process-vertical-rail")
def _resolve_process_vertical_rail(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure:
    del slide
    family: MotionStructureFamily = "timeline"
    markers = _indexed_elements(
        elements,
        r"_rail_marker_(\d+)(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
    )
    labels = _indexed_elements(
        elements,
        r"_rail_marker_label_(\d+)(?:_r\d+)?$",
        _is_text,
        family,
    )
    bodies = _indexed_elements(
        elements,
        r"_rail_step_(\d+)(?:_r\d+)?$",
        lambda element: _is_text(element)
        and str(element.get("role", "")) == "body",
        family,
    )
    expected_ordinals = list(range(1, len(markers) + 1))
    if sorted(markers) != expected_ordinals or not 3 <= len(markers) <= 6:
        raise MotionStructureResolutionError(
            family,
            "vertical rail markers must be consecutive with three to six steps",
        )
    if sorted(labels) != expected_ordinals:
        raise MotionStructureResolutionError(
            family,
            "every vertical rail step requires one marker label",
        )
    if sorted(bodies) != expected_ordinals:
        raise MotionStructureResolutionError(
            family,
            "every vertical rail step requires one body",
        )

    slots: list[ResolvedMotionSlot] = []
    member_ids: set[str] = set()
    for ordinal in expected_ordinals:
        label = labels[ordinal]
        if _numeric_text(label) != ordinal:
            raise MotionStructureResolutionError(
                family,
                f"vertical rail marker label {ordinal} must match its ordinal",
            )
        marker_id = _element_id(markers[ordinal])
        label_id = _element_id(label)
        body_id = _element_id(bodies[ordinal])
        slot_member_ids = (marker_id, label_id, body_id)
        if member_ids.intersection(slot_member_ids):
            raise MotionStructureResolutionError(
                family,
                f"vertical rail step {ordinal} reuses a member",
            )
        member_ids.update(slot_member_ids)
        slots.append(
            ResolvedMotionSlot(
                slot_id=f"vertical-rail-{ordinal}",
                order=ordinal,
                member_element_ids=slot_member_ids,
                frame_element_id=marker_id,
                semantic_role="card",
            )
        )
    return ResolvedMotionStructure(family=family, slots=tuple(slots))


@register_structure_resolver("feature-comparison")
def _resolve_feature_comparison(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure:
    del slide
    family: MotionStructureFamily = "feature-comparison"
    backings = _indexed_elements(
        elements,
        r"_comparison_(\d+)_(?:field|rule)(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
    )
    indexes = _indexed_elements(
        elements,
        r"_comparison_(\d+)_index(?:_r\d+)?$",
        _is_text,
        family,
    )
    bodies = _indexed_elements(
        elements,
        r"_comparison_(\d+)(?:_r\d+)?$",
        lambda element: _is_text(element)
        and str(element.get("role", "")) == "body",
        family,
    )
    expected_ordinals = list(range(1, len(backings) + 1))
    if sorted(backings) != expected_ordinals or not 2 <= len(backings) <= 4:
        raise MotionStructureResolutionError(
            family,
            "comparison indexes must be consecutive with two to four items",
        )
    if sorted(indexes) != expected_ordinals:
        raise MotionStructureResolutionError(
            family,
            "every comparison item requires one numeric index",
        )

    body_candidates = [
        element
        for element in elements
        if _is_text(element) and str(element.get("role", "")) == "body"
    ]
    used_body_ids: set[str] = set()
    slots: list[ResolvedMotionSlot] = []
    for ordinal in expected_ordinals:
        backing = backings[ordinal]
        index = indexes[ordinal]
        body = bodies.get(ordinal) or _nearest_comparison_body(
            backing,
            index,
            [
                candidate
                for candidate in body_candidates
                if _element_id(candidate) not in used_body_ids
            ],
            family,
            ordinal,
        )
        body_id = _element_id(body)
        if body_id in used_body_ids:
            raise MotionStructureResolutionError(
                family,
                f"comparison {ordinal} reuses a body",
            )
        used_body_ids.add(body_id)
        backing_id = _element_id(backing)
        slots.append(
            ResolvedMotionSlot(
                slot_id=f"comparison-{ordinal}",
                order=ordinal,
                member_element_ids=(
                    backing_id,
                    _element_id(index),
                    body_id,
                ),
                frame_element_id=backing_id,
                semantic_role="card",
            )
        )

    if len(used_body_ids) != len(body_candidates):
        raise MotionStructureResolutionError(
            family,
            "comparison bodies do not map one-to-one to items",
        )
    return ResolvedMotionStructure(family=family, slots=tuple(slots))


def _nearest_comparison_body(
    backing: dict[str, Any],
    index: dict[str, Any],
    candidates: list[dict[str, Any]],
    family: MotionStructureFamily,
    ordinal: int,
) -> dict[str, Any]:
    index_center = _center(index)
    ranked = sorted(
        candidates,
        key=lambda candidate: (
            0 if _center_is_inside(backing, candidate) else 1,
            abs(_center(candidate)[0] - index_center[0]),
            abs(_center(candidate)[1] - index_center[1]),
            _element_id(candidate),
        ),
    )
    if not ranked:
        raise MotionStructureResolutionError(
            family,
            f"comparison {ordinal} body is missing",
        )
    return ranked[0]


@register_structure_resolver("diagram-hub")
def _resolve_diagram_hub(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure:
    family: MotionStructureFamily = "diagram-hub"
    hub_field = _single_element_by_pattern(
        elements,
        r"_hub_field(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
        "hub field",
    )
    assert hub_field is not None
    hub_text = _single_element_by_pattern(
        elements,
        r"_hub(?:_r\d+)?$",
        _is_text,
        family,
        "hub text",
        required=False,
    )
    if hub_text is None:
        focal_id = _primary_focal_id(slide)
        hub_text = next(
            (
                element
                for element in elements
                if _is_text(element)
                and (
                    _element_id(element) == focal_id
                    or str(element.get("role", "")) == "highlight"
                )
                and _center_is_inside(hub_field, element)
            ),
            None,
        )
    if hub_text is None:
        raise MotionStructureResolutionError(
            family,
            "hub field requires one contained focal text",
        )
    assert hub_text is not None

    fields = _indexed_elements(
        elements,
        r"_node_(\d+)_field(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
    )
    indexes = _indexed_elements(
        elements,
        r"_node_(\d+)_index(?:_r\d+)?$",
        _is_text,
        family,
    )
    bodies = _indexed_elements(
        elements,
        r"_node_(\d+)(?:_r\d+)?$",
        lambda element: _is_text(element)
        and str(element.get("role", "")) == "body",
        family,
    )
    expected_ordinals = list(range(1, len(fields) + 1))
    if sorted(fields) != expected_ordinals or not 3 <= len(fields) <= 6:
        raise MotionStructureResolutionError(
            family,
            "hub nodes must be consecutive with three to six items",
        )
    if sorted(indexes) != expected_ordinals:
        raise MotionStructureResolutionError(
            family,
            "every hub node requires one numeric index",
        )

    body_candidates = [
        element
        for element in elements
        if _is_text(element) and str(element.get("role", "")) == "body"
    ]
    used_body_ids: set[str] = set()
    slots = [
        ResolvedMotionSlot(
            slot_id="hub",
            order=0,
            member_element_ids=(
                _element_id(hub_field),
                _element_id(hub_text),
            ),
            frame_element_id=_element_id(hub_field),
            semantic_role="focal",
        )
    ]
    for ordinal in expected_ordinals:
        field = fields[ordinal]
        body = bodies.get(ordinal) or _single_contained_body(
            field,
            [
                candidate
                for candidate in body_candidates
                if _element_id(candidate) not in used_body_ids
            ],
            family,
            f"hub node {ordinal}",
        )
        body_id = _element_id(body)
        if body_id in used_body_ids:
            raise MotionStructureResolutionError(
                family,
                f"hub node {ordinal} reuses a body",
            )
        used_body_ids.add(body_id)
        field_id = _element_id(field)
        slots.append(
            ResolvedMotionSlot(
                slot_id=f"hub-node-{ordinal}",
                order=ordinal,
                member_element_ids=(
                    field_id,
                    _element_id(indexes[ordinal]),
                    body_id,
                ),
                frame_element_id=field_id,
                semantic_role="card",
            )
        )
    if len(used_body_ids) != len(body_candidates):
        raise MotionStructureResolutionError(
            family,
            "hub node bodies do not map one-to-one to fields",
        )
    return ResolvedMotionStructure(family=family, slots=tuple(slots))


@register_structure_resolver("diagram-orbit")
def _resolve_diagram_orbit(
    slide: dict[str, Any],
    elements: list[dict[str, Any]],
) -> ResolvedMotionStructure:
    del slide
    family: MotionStructureFamily = "diagram-hub"
    hub_field = _single_element_by_pattern(
        elements,
        r"_orbit_hub_field(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
        "orbit hub field",
    )
    hub_text = _single_element_by_pattern(
        elements,
        r"_orbit_hub(?:_r\d+)?$",
        _is_text,
        family,
        "orbit hub text",
    )
    assert hub_field is not None
    assert hub_text is not None

    fields = _indexed_elements(
        elements,
        r"_orbit_node_(\d+)_field(?:_r\d+)?$",
        lambda element: element.get("type") in SHAPE_TYPES,
        family,
    )
    bodies = _indexed_elements(
        elements,
        r"_orbit_node_(\d+)(?:_r\d+)?$",
        lambda element: _is_text(element)
        and str(element.get("role", "")) == "body",
        family,
    )
    expected_ordinals = list(range(1, len(fields) + 1))
    if sorted(fields) != expected_ordinals or not 3 <= len(fields) <= 6:
        raise MotionStructureResolutionError(
            family,
            "orbit nodes must be consecutive with three to six items",
        )
    if sorted(bodies) != expected_ordinals:
        raise MotionStructureResolutionError(
            family,
            "every orbit node requires one body",
        )

    hub_field_id = _element_id(hub_field)
    hub_text_id = _element_id(hub_text)
    member_ids = {hub_field_id, hub_text_id}
    if len(member_ids) != 2:
        raise MotionStructureResolutionError(
            family,
            "orbit hub members must be distinct",
        )
    slots = [
        ResolvedMotionSlot(
            slot_id="orbit-hub",
            order=0,
            member_element_ids=(hub_field_id, hub_text_id),
            frame_element_id=hub_field_id,
            semantic_role="focal",
        )
    ]
    for ordinal in expected_ordinals:
        field_id = _element_id(fields[ordinal])
        body_id = _element_id(bodies[ordinal])
        slot_member_ids = (field_id, body_id)
        if member_ids.intersection(slot_member_ids):
            raise MotionStructureResolutionError(
                family,
                f"orbit node {ordinal} reuses a member",
            )
        member_ids.update(slot_member_ids)
        slots.append(
            ResolvedMotionSlot(
                slot_id=f"orbit-node-{ordinal}",
                order=ordinal,
                member_element_ids=slot_member_ids,
                frame_element_id=field_id,
                semantic_role="card",
            )
        )
    return ResolvedMotionStructure(family=family, slots=tuple(slots))


def _single_element_by_pattern(
    elements: list[dict[str, Any]],
    pattern: str,
    predicate: Callable[[dict[str, Any]], bool],
    family: MotionStructureFamily,
    label: str,
    *,
    required: bool = True,
) -> dict[str, Any] | None:
    matches = [
        element
        for element in elements
        if re.search(pattern, _element_id(element)) is not None
        and predicate(element)
    ]
    if len(matches) > 1 or required and not matches:
        raise MotionStructureResolutionError(
            family,
            f"{label} must resolve to exactly one element",
        )
    return matches[0] if matches else None


def _single_contained_body(
    container: dict[str, Any],
    candidates: list[dict[str, Any]],
    family: MotionStructureFamily,
    label: str,
) -> dict[str, Any]:
    matches = [
        candidate
        for candidate in candidates
        if _center_is_inside(container, candidate)
    ]
    if len(matches) != 1:
        raise MotionStructureResolutionError(
            family,
            f"{label} must contain exactly one body",
        )
    return matches[0]


def _primary_focal_id(slide: dict[str, Any]) -> str:
    ai_notes = slide.get("aiNotes")
    composition = ai_notes.get("compositionPlan") if isinstance(ai_notes, dict) else None
    if not isinstance(composition, dict):
        return ""
    return str(composition.get("primaryFocalElementId", ""))


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
