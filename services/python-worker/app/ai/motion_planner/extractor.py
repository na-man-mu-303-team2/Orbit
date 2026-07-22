from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.motion_planner.models import (
    ExtractedMotionContext,
    MotionPlanningContext,
    MotionSemanticRole,
    MotionTarget,
    NarrativeIntent,
    SlideType,
)


@dataclass(frozen=True)
class MotionPromptInput:
    context: ExtractedMotionContext
    target_labels: dict[str, str]
    speaker_notes: str


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
    if slide.get("order") == 1 and len(targets) <= 3:
        return "cover"
    if "closing" in cue_types or any(token in title for token in ("summary", "요약")):
        return "summary"
    if "problem" in cue_types:
        return "problem"
    if "solution" in cue_types:
        return "solution"
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
