from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.models import (
    ExtractedMotionContext,
    ExtractedMotionContextV3,
    MotionPlanningContext,
    MotionSemanticRole,
    MotionTarget,
    MotionUnit,
    MotionUnitSemanticRole,
    NarrativeIntent,
    SlideType,
)
from app.ai.motion_planner.structure_resolvers import (
    MotionStructureResolutionError,
    ResolvedMotionStructure,
    resolve_motion_structure,
)

CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080
MAX_SPATIAL_CONTAINER_AREA_RATIO = 0.35
MIN_CHILD_OVERLAP_RATIO = 0.8
CONTAINER_TYPES = {"rect", "ellipse", "polygon", "star", "ring", "customShape"}
CONTENT_TYPES = {"text", "image", "svg", "chart", "table"}
EXCLUDED_ROLES = {"background", "footer"}


@dataclass(frozen=True)
class MotionPromptInput:
    context: ExtractedMotionContext
    target_labels: dict[str, str]
    speaker_notes: str


@dataclass(frozen=True)
class MotionPromptInputV3:
    context: ExtractedMotionContextV3
    target_labels: dict[str, str]
    speaker_notes: str


@dataclass(frozen=True)
class _UnitCandidate:
    unit: MotionUnit
    frame: dict[str, Any]
    label: str
    structured_order: int | None = None


def extract_motion_context(
    slide: dict[str, Any],
    planning_context: MotionPlanningContext,
) -> MotionPromptInput:
    allowed_ids = set(planning_context.allowed_target_element_ids)
    elements = [
        element
        for element in slide.get("elements", [])
        if isinstance(element, dict)
        and str(element.get("elementId", "")) in allowed_ids
    ]
    typography = {
        item.element_id: item for item in planning_context.effective_typography
    }
    approved_cues = [
        cue
        for cue in slide.get("semanticCues", [])
        if isinstance(cue, dict)
        and cue.get("reviewStatus") == "approved"
        and cue.get("freshness") == "current"
    ]
    cue_importance: dict[str, str] = {}
    for cue in approved_cues:
        importance = str(cue.get("importance", "supporting"))
        for element_id in cue.get("targetElementIds", []):
            target_id = str(element_id)
            if target_id in allowed_ids:
                cue_importance[target_id] = _stronger_importance(
                    cue_importance.get(target_id), importance
                )

    focal_id = _primary_focal_id(slide, allowed_ids)
    groups = _group_memberships(slide, allowed_ids)
    ordered = sorted(
        elements,
        key=lambda element: _reading_key(element, typography),
    )[:8]
    targets = [
        MotionTarget(
            elementId=str(element["elementId"]),
            semanticRole=_semantic_role(
                element,
                focal_id=focal_id,
                cue_importance=cue_importance,
                typography=typography,
            ),
            groupId=groups.get(str(element["elementId"])),
            readingOrder=index,
            emphasis=_emphasis(
                str(element["elementId"]), focal_id, cue_importance
            ),
            geometryBucket=_geometry_bucket(element),
        )
        for index, element in enumerate(ordered, start=1)
    ]
    slide_type = _slide_type(slide, targets, approved_cues)
    return MotionPromptInput(
        context=ExtractedMotionContext(
            slideType=slide_type,
            narrativeIntent=_narrative_intent(slide_type),
            targets=targets,
            approvedCueCount=len(approved_cues),
            notesPresent=planning_context.notes_present,
            notesTruncated=planning_context.notes_truncated,
        ),
        target_labels={
            str(element["elementId"]): _target_label(element)
            for element in ordered
        },
        speaker_notes=planning_context.speaker_notes,
    )


def extract_motion_units(
    slide: dict[str, Any],
    planning_context: MotionPlanningContext,
) -> MotionPromptInputV3:
    allowed_ids = set(planning_context.allowed_target_element_ids)
    elements = [
        element
        for element in slide.get("elements", [])
        if isinstance(element, dict)
        and _is_visible_unlocked(element)
        and (
            str(element.get("elementId", "")) in allowed_ids
            or _is_semantic_container_seed(element)
        )
    ]
    by_id = {str(element["elementId"]): element for element in elements}
    typography = {
        item.element_id: item for item in planning_context.effective_typography
    }
    approved_cues = [
        cue
        for cue in slide.get("semanticCues", [])
        if isinstance(cue, dict)
        and cue.get("reviewStatus") == "approved"
        and cue.get("freshness") == "current"
    ]
    cue_importance = _cue_importance(approved_cues, allowed_ids)
    focal_id = _primary_focal_id(slide, allowed_ids)

    candidates: list[_UnitCandidate] = []
    claimed_ids: set[str] = set()
    explicit_group_by_member: dict[str, str] = {}
    for group in sorted(
        (element for element in elements if element.get("type") == "group"),
        key=_frame_order_key,
    ):
        group_id = str(group["elementId"])
        props = group.get("props")
        child_ids = (
            [str(child_id) for child_id in props.get("childElementIds", [])]
            if isinstance(props, dict)
            else []
        )
        members = [
            by_id[child_id]
            for child_id in child_ids
            if child_id in by_id and child_id not in claimed_ids
        ]
        if not members or len(members) > 8:
            continue
        unit = _build_unit(
                    kind="explicit-group",
                    animation_element_ids=[group_id],
                    member_elements=members,
                    frame_element=group,
                    focal_id=focal_id,
                    cue_importance=cue_importance,
                    typography=typography,
                )
        candidates.append(
            _UnitCandidate(
                unit=unit,
                frame=group,
                label=_unit_label(members),
            )
        )
        for member in members:
            member_id = str(member["elementId"])
            explicit_group_by_member[member_id] = unit.unit_id
            claimed_ids.add(member_id)
        claimed_ids.add(group_id)

    structure = resolve_motion_structure(slide, elements)
    if structure is not None:
        candidates, claimed_ids = _apply_resolved_structure(
            structure=structure,
            candidates=candidates,
            claimed_ids=claimed_ids,
            explicit_group_by_member=explicit_group_by_member,
            by_id=by_id,
            focal_id=focal_id,
            cue_importance=cue_importance,
            typography=typography,
        )

    containers = sorted(
        (
            element
            for element in elements
            if _is_spatial_container(element)
            and str(element["elementId"]) not in claimed_ids
        ),
        key=lambda element: (_frame_area(element), *_frame_order_key(element)),
    )
    for container in containers:
        container_id = str(container["elementId"])
        children = [
            element
            for element in elements
            if str(element["elementId"]) not in claimed_ids
            and str(element["elementId"]) != container_id
            and _is_spatial_content(element)
            and _is_contained_child(container, element)
        ]
        if not children or len(children) > 3:
            continue
        children.sort(key=lambda element: _reading_key(element, typography))
        members = [container, *children]
        candidates.append(
            _UnitCandidate(
                unit=_build_unit(
                    kind="spatial-cluster",
                    animation_element_ids=[
                        str(member["elementId"]) for member in members
                    ],
                    member_elements=members,
                    frame_element=container,
                    focal_id=focal_id,
                    cue_importance=cue_importance,
                    typography=typography,
                ),
                frame=container,
                label=_unit_label(children),
            )
        )
        claimed_ids.update(str(member["elementId"]) for member in members)

    for element in elements:
        element_id = str(element["elementId"])
        if (
            element_id in claimed_ids
            or element.get("type") == "group"
            or str(element.get("role") or "")
            in {"background", "decoration", "footer"}
            or element.get("type") in {"line", "arrow", "activity-qr"}
        ):
            continue
        candidates.append(
            _UnitCandidate(
                unit=_build_unit(
                    kind="element",
                    animation_element_ids=[element_id],
                    member_elements=[element],
                    frame_element=element,
                    focal_id=focal_id,
                    cue_importance=cue_importance,
                    typography=typography,
                ),
                frame=element,
                label=_target_label(element),
            )
        )

    ordered = sorted(
        candidates,
        key=lambda item: _candidate_reading_key(item, structure),
    )
    if structure is None:
        ordered = ordered[:8]
    elif len(ordered) > 8:
        raise MotionStructureResolutionError(
            structure.family,
            "resolved structure exceeds eight motion units",
        )
    units: list[MotionUnit] = []
    target_labels: dict[str, str] = {}
    for index, candidate in enumerate(ordered, start=1):
        hydrated = candidate.unit.model_copy(update={"reading_order": index})
        units.append(hydrated)
        target_labels[hydrated.unit_id] = candidate.label
    slide_type = _slide_type_for_units(slide, units, approved_cues)
    return MotionPromptInputV3(
        context=ExtractedMotionContextV3(
            slideType=slide_type,
            narrativeIntent=_narrative_intent(slide_type),
            structureFamily=structure.family if structure is not None else None,
            units=units,
            approvedCueCount=len(approved_cues),
            notesPresent=planning_context.notes_present,
            notesTruncated=planning_context.notes_truncated,
        ),
        target_labels=target_labels,
        speaker_notes=planning_context.speaker_notes,
    )


def _apply_resolved_structure(
    *,
    structure: ResolvedMotionStructure,
    candidates: list[_UnitCandidate],
    claimed_ids: set[str],
    explicit_group_by_member: dict[str, str],
    by_id: dict[str, dict[str, Any]],
    focal_id: str | None,
    cue_importance: dict[str, str],
    typography: dict[str, Any],
) -> tuple[list[_UnitCandidate], set[str]]:
    candidate_by_unit_id = {
        candidate.unit.unit_id: candidate for candidate in candidates
    }
    structured_candidates = list(candidates)
    updated_claimed_ids = set(claimed_ids)

    for slot in structure.slots:
        member_ids = list(slot.member_element_ids)
        missing_ids = [element_id for element_id in member_ids if element_id not in by_id]
        if missing_ids:
            raise MotionStructureResolutionError(
                structure.family,
                f"{slot.slot_id} references unavailable members",
            )
        group_unit_ids = {
            explicit_group_by_member[element_id]
            for element_id in member_ids
            if element_id in explicit_group_by_member
        }
        claimed_members = [
            element_id for element_id in member_ids if element_id in claimed_ids
        ]
        if claimed_members:
            if len(claimed_members) != len(member_ids) or len(group_unit_ids) != 1:
                raise MotionStructureResolutionError(
                    structure.family,
                    f"{slot.slot_id} is partially claimed by explicit groups",
                )
            group_unit_id = next(iter(group_unit_ids))
            existing = candidate_by_unit_id[group_unit_id]
            replacement = _UnitCandidate(
                unit=existing.unit,
                frame=existing.frame,
                label=existing.label,
                structured_order=slot.order,
            )
            structured_candidates = [
                replacement
                if candidate.unit.unit_id == group_unit_id
                else candidate
                for candidate in structured_candidates
            ]
            candidate_by_unit_id[group_unit_id] = replacement
            continue

        members = [by_id[element_id] for element_id in member_ids]
        frame = by_id[slot.frame_element_id]
        unit = _build_unit(
            kind="spatial-cluster",
            animation_element_ids=member_ids,
            member_elements=members,
            frame_element=frame,
            focal_id=focal_id,
            cue_importance=cue_importance,
            typography=typography,
        ).model_copy(update={"semantic_role": slot.semantic_role})
        structured_candidates.append(
            _UnitCandidate(
                unit=unit,
                frame=frame,
                label=_unit_label(members),
                structured_order=slot.order,
            )
        )
        updated_claimed_ids.update(member_ids)

    return structured_candidates, updated_claimed_ids


def _cue_importance(
    approved_cues: list[dict[str, Any]], allowed_ids: set[str]
) -> dict[str, str]:
    result: dict[str, str] = {}
    for cue in approved_cues:
        importance = str(cue.get("importance", "supporting"))
        for element_id in cue.get("targetElementIds", []):
            target_id = str(element_id)
            if target_id in allowed_ids:
                result[target_id] = _stronger_importance(
                    result.get(target_id), importance
                )
    return result


def _build_unit(
    *,
    kind: Literal["element", "explicit-group", "spatial-cluster"],
    animation_element_ids: list[str],
    member_elements: list[dict[str, Any]],
    frame_element: dict[str, Any],
    focal_id: str | None,
    cue_importance: dict[str, str],
    typography: dict[str, Any],
) -> MotionUnit:
    member_ids = [str(element["elementId"]) for element in member_elements]
    semantic_roles = [
        _semantic_role(
            element,
            focal_id=focal_id,
            cue_importance=cue_importance,
            typography=typography,
        )
        for element in member_elements
    ]
    emphasis_values = [
        _emphasis(element_id, focal_id, cue_importance)
        for element_id in member_ids
    ]
    return MotionUnit(
        unitId=_stable_unit_id(kind, animation_element_ids, member_ids),
        kind=kind,
        animationElementIds=animation_element_ids,
        memberElementIds=member_ids,
        semanticRole=_unit_semantic_role(kind, semantic_roles),
        readingOrder=1,
        emphasis=(
            "primary"
            if "primary" in emphasis_values
            else "secondary"
            if "secondary" in emphasis_values
            else "supporting"
        ),
        geometryBucket=_geometry_bucket(frame_element),
    )


def _stable_unit_id(
    kind: str, animation_element_ids: list[str], member_element_ids: list[str]
) -> str:
    source = "\0".join(
        [kind, *sorted(animation_element_ids), "|", *sorted(member_element_ids)]
    )
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
    return f"motion_unit_{kind.replace('-', '_')}_{digest}"


def _unit_semantic_role(
    kind: str, roles: list[MotionSemanticRole]
) -> MotionUnitSemanticRole:
    if kind != "element":
        if "data" in roles:
            return "data"
        if "media" in roles and not any(
            role in {"title", "subtitle", "body", "focal", "supporting"}
            for role in roles
        ):
            return "media"
        return "card"
    return roles[0] if roles else "other"


def _unit_reading_key(
    unit: MotionUnit, frame_element: dict[str, Any]
) -> tuple[int, float, float, str]:
    role_rank = {
        "title": 0,
        "subtitle": 1,
        "focal": 2,
        "card": 2,
        "body": 3,
        "data": 3,
        "media": 4,
        "supporting": 4,
        "label": 5,
        "other": 6,
    }
    return (
        role_rank.get(unit.semantic_role, 6),
        float(frame_element.get("y", 0)),
        float(frame_element.get("x", 0)),
        unit.unit_id,
    )


def _candidate_reading_key(
    candidate: _UnitCandidate,
    structure: ResolvedMotionStructure | None,
) -> tuple[int, int, int, float, float, str]:
    unit_key = _unit_reading_key(candidate.unit, candidate.frame)
    if structure is None:
        return (1, 0, *unit_key)
    if candidate.structured_order is not None:
        return (1, candidate.structured_order, *unit_key)

    frame_top = float(candidate.frame.get("y", 0))
    frame_bottom = frame_top + float(candidate.frame.get("height", 0))
    if candidate.unit.semantic_role in {"title", "subtitle"}:
        phase = 0
    elif candidate.unit.geometry_bucket == "bottom":
        phase = 2
    else:
        phase = 0 if frame_bottom <= CANVAS_HEIGHT / 3 else 2
    return (phase, 0, *unit_key)


def _slide_type_for_units(
    slide: dict[str, Any],
    units: list[MotionUnit],
    approved_cues: list[dict[str, Any]],
) -> SlideType:
    ai_notes = slide.get("aiNotes")
    if isinstance(ai_notes, dict):
        visual_plan = ai_notes.get("visualPlan")
        visual_type = (
            str(visual_plan.get("visualType", ""))
            if isinstance(visual_plan, dict)
            else ""
        )
        visual_type_map: dict[str, SlideType] = {
            "cover": "cover",
            "title": "title",
            "problem": "problem",
            "solution": "solution",
            "feature-grid": "feature-grid",
            "process": "process",
            "architecture": "architecture",
            "data": "data",
            "chart": "chart",
            "comparison": "comparison",
            "quote": "quote",
            "summary": "summary",
        }
        if visual_type in visual_type_map:
            return visual_type_map[visual_type]
        composition = ai_notes.get("compositionPlan")
        composition_id = (
            str(composition.get("compositionId", ""))
            if isinstance(composition, dict)
            else ""
        )
        if composition_id in {
            "process-horizontal",
            "process-vertical-rail",
            "timeline",
        }:
            return "process"
        if composition_id in {"diagram-hub", "diagram-orbit"}:
            return "architecture"
    cue_types = {str(cue.get("cueType", "")) for cue in approved_cues}
    title = str(slide.get("title", "")).lower()
    if "closing" in cue_types or any(token in title for token in ("summary", "요약")):
        return "summary"
    if "problem" in cue_types:
        return "problem"
    if "solution" in cue_types:
        return "solution"
    if any(token in title for token in ("vs", "비교", "comparison")):
        return "comparison"
    if any(token in title for token in ("process", "프로세스", "단계")):
        return "process"
    if any(token in title for token in ("architecture", "아키텍처", "구조")):
        return "architecture"
    if any(unit.semantic_role == "data" for unit in units):
        return "data"
    if sum(unit.semantic_role == "card" for unit in units) >= 2:
        return "feature-grid"
    roles = {unit.semantic_role for unit in units}
    if roles <= {"title", "subtitle", "supporting"} and len(units) <= 2:
        return "title"
    return "solution" if "focal" in roles else "title"


def _is_visible_unlocked(element: dict[str, Any]) -> bool:
    return bool(
        element.get("visible") is not False
        and float(element.get("opacity", 1)) > 0
        and element.get("locked") is not True
    )


def _is_semantic_container_seed(element: dict[str, Any]) -> bool:
    return bool(
        element.get("type") == "group"
        or _is_spatial_container(element)
    )


def _is_spatial_container(element: dict[str, Any]) -> bool:
    area = _frame_area(element)
    return bool(
        element.get("type") in CONTAINER_TYPES
        and str(element.get("role") or "") not in EXCLUDED_ROLES
        and area > 0
        and area
        <= CANVAS_WIDTH * CANVAS_HEIGHT * MAX_SPATIAL_CONTAINER_AREA_RATIO
    )


def _is_spatial_content(element: dict[str, Any]) -> bool:
    return bool(
        element.get("type") in CONTENT_TYPES
        and str(element.get("role") or "")
        not in {"background", "decoration", "footer"}
    )


def _is_contained_child(
    container: dict[str, Any], child: dict[str, Any]
) -> bool:
    child_area = _frame_area(child)
    if child_area <= 0 or float(child.get("zIndex", 0)) <= float(
        container.get("zIndex", 0)
    ):
        return False
    left = max(float(container.get("x", 0)), float(child.get("x", 0)))
    top = max(float(container.get("y", 0)), float(child.get("y", 0)))
    right = min(
        float(container.get("x", 0)) + float(container.get("width", 0)),
        float(child.get("x", 0)) + float(child.get("width", 0)),
    )
    bottom = min(
        float(container.get("y", 0)) + float(container.get("height", 0)),
        float(child.get("y", 0)) + float(child.get("height", 0)),
    )
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    child_center_x = float(child.get("x", 0)) + float(child.get("width", 0)) / 2
    child_center_y = float(child.get("y", 0)) + float(child.get("height", 0)) / 2
    return bool(
        float(container.get("x", 0))
        <= child_center_x
        <= float(container.get("x", 0)) + float(container.get("width", 0))
        and float(container.get("y", 0))
        <= child_center_y
        <= float(container.get("y", 0)) + float(container.get("height", 0))
        and intersection / child_area >= MIN_CHILD_OVERLAP_RATIO
    )


def _frame_area(element: dict[str, Any]) -> float:
    return max(0.0, float(element.get("width", 0))) * max(
        0.0, float(element.get("height", 0))
    )


def _frame_order_key(element: dict[str, Any]) -> tuple[float, float, str]:
    return (
        float(element.get("y", 0)),
        float(element.get("x", 0)),
        str(element.get("elementId", "")),
    )


def _unit_label(elements: list[dict[str, Any]]) -> str:
    labels = [
        _target_label(element)
        for element in elements
        if element.get("type") == "text"
    ]
    return " · ".join(label for label in labels if label)[:160] or "복합 요소"


def _semantic_role(
    element: dict[str, Any],
    *,
    focal_id: str | None,
    cue_importance: dict[str, str],
    typography: dict[str, Any],
) -> MotionSemanticRole:
    element_id = str(element["elementId"])
    role = str(element.get("role") or "")
    if role == "title":
        return "title"
    if role == "subtitle":
        return "subtitle"
    if element_id == focal_id or role == "highlight":
        return "focal"
    if role in {"media"} or element.get("type") in {"image", "svg", "video"}:
        return "media"
    if role in {"chart", "table"} or element.get("type") in {"chart", "table"}:
        return "data"
    if role == "caption":
        return "label"
    if role == "body":
        return "body"
    if cue_importance.get(element_id) == "core":
        return "focal"
    effective_size = getattr(typography.get(element_id), "effective_font_size", 0)
    if element.get("type") == "text" and effective_size >= 36:
        return "title"
    if element.get("type") == "text":
        return "supporting"
    return "other"


def _reading_key(
    element: dict[str, Any], typography: dict[str, Any]
) -> tuple[int, float, float, int, str]:
    role = str(element.get("role") or "")
    role_rank = {
        "title": 0,
        "subtitle": 1,
        "highlight": 2,
        "body": 3,
        "chart": 3,
        "table": 3,
        "media": 4,
        "caption": 5,
    }.get(role, 4)
    element_id = str(element.get("elementId", ""))
    effective_size = getattr(typography.get(element_id), "effective_font_size", 0)
    return (
        role_rank,
        float(element.get("y", 0)),
        float(element.get("x", 0)),
        -round(effective_size),
        element_id,
    )


def _slide_type(
    slide: dict[str, Any],
    targets: list[MotionTarget],
    approved_cues: list[dict[str, Any]],
) -> SlideType:
    cue_types = {str(cue.get("cueType", "")) for cue in approved_cues}
    element_types = {
        str(element.get("type", ""))
        for element in slide.get("elements", [])
        if isinstance(element, dict)
    }
    roles = {target.semantic_role for target in targets}
    title = str(slide.get("title", "")).lower()
    style = slide.get("style")
    layout = str(style.get("layout", "")) if isinstance(style, dict) else ""
    if slide.get("order") == 1 and len(targets) <= 3:
        return "cover"
    if "closing" in cue_types or any(token in title for token in ("summary", "요약")):
        return "summary"
    if "problem" in cue_types:
        return "problem"
    if "solution" in cue_types:
        return "solution"
    if layout == "quote" or any(token in title for token in ("quote", "인용")):
        return "quote"
    if "chart" in element_types:
        return "chart"
    if "table" in element_types:
        return "data"
    if any(token in title for token in ("vs", "비교", "comparison")):
        return "comparison"
    if any(token in title for token in ("process", "프로세스", "단계")):
        return "process"
    if any(token in title for token in ("architecture", "아키텍처", "구조")):
        return "architecture"
    if len(targets) >= 5:
        return "feature-grid"
    if roles <= {"title", "subtitle", "supporting"} and len(targets) <= 2:
        return "title"
    return "solution" if "focal" in roles else "title"


def _narrative_intent(slide_type: SlideType) -> NarrativeIntent:
    if slide_type in {"process", "architecture", "feature-grid"}:
        return "sequence"
    if slide_type == "comparison":
        return "contrast"
    if slide_type in {"data", "chart"}:
        return "explain-data"
    if slide_type == "summary":
        return "summarize"
    if slide_type in {"problem", "solution", "quote"}:
        return "emphasize"
    return "orient"


def _primary_focal_id(slide: dict[str, Any], allowed_ids: set[str]) -> str | None:
    ai_notes = slide.get("aiNotes")
    composition = ai_notes.get("compositionPlan") if isinstance(ai_notes, dict) else None
    focal_id = (
        str(composition.get("primaryFocalElementId"))
        if isinstance(composition, dict) and composition.get("primaryFocalElementId")
        else None
    )
    return focal_id if focal_id in allowed_ids else None


def _group_memberships(
    slide: dict[str, Any], allowed_ids: set[str]
) -> dict[str, str]:
    memberships: dict[str, str] = {}
    for element in slide.get("elements", []):
        if not isinstance(element, dict) or element.get("type") != "group":
            continue
        group_id = str(element.get("elementId", ""))
        props = element.get("props")
        child_ids = props.get("childElementIds", []) if isinstance(props, dict) else []
        for child_id in child_ids:
            child = str(child_id)
            if child in allowed_ids and child not in memberships:
                memberships[child] = group_id
    return memberships


def _geometry_bucket(
    element: dict[str, Any]
) -> Literal["top", "left", "center", "right", "bottom"]:
    center_x = float(element.get("x", 0)) + float(element.get("width", 0)) / 2
    center_y = float(element.get("y", 0)) + float(element.get("height", 0)) / 2
    if center_y < 1080 / 3:
        return "top"
    if center_y > 1080 * 2 / 3:
        return "bottom"
    if center_x < 1920 / 3:
        return "left"
    if center_x > 1920 * 2 / 3:
        return "right"
    return "center"


def _emphasis(
    element_id: str, focal_id: str | None, cue_importance: dict[str, str]
) -> Literal["primary", "secondary", "supporting"]:
    if element_id == focal_id or cue_importance.get(element_id) == "core":
        return "primary"
    if cue_importance.get(element_id) == "supporting":
        return "secondary"
    return "supporting"


def _stronger_importance(current: str | None, candidate: str) -> str:
    ranks = {"optional": 0, "supporting": 1, "core": 2}
    return candidate if ranks.get(candidate, 0) > ranks.get(current or "", -1) else current or candidate


def _target_label(element: dict[str, Any]) -> str:
    props = element.get("props")
    if not isinstance(props, dict):
        return str(element.get("role") or element.get("type") or "element")[:80]
    value = props.get("text") or props.get("alt") or element.get("role") or element.get("type")
    return " ".join(str(value or "element").split())[:80]
