from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


RedesignOutcome = Literal["applicable", "fallback-allowed", "refused-unsafe"]

UNSAFE_ELEMENT_TYPES_BASE: frozenset[str] = frozenset(
    {
        "activity-qr",
        "arrow",
        "chart",
        "customShape",
        "ellipse",
        "group",
        "line",
        "polygon",
        "ring",
        "star",
        "table",
    }
)
MEDIA_ELEMENT_TYPES: frozenset[str] = frozenset({"image", "svg"})


@dataclass(frozen=True)
class ElementConstraints:
    """References that prevent replacing an element with a new ID."""

    referenced_element_ids: frozenset[str]
    locked_element_ids: frozenset[str]
    grouped_element_ids: frozenset[str]
    ooxml_element_ids: frozenset[str]


def unsafe_element_types(*, media_slots_available: bool = False) -> frozenset[str]:
    """Return element types that cannot be preserved in the current milestone."""
    if media_slots_available:
        return UNSAFE_ELEMENT_TYPES_BASE
    return UNSAFE_ELEMENT_TYPES_BASE | MEDIA_ELEMENT_TYPES


def find_unsafe_elements(
    slide: dict[str, Any], *, media_slots_available: bool = False
) -> list[str]:
    """Return IDs for elements that the redesign pipeline cannot preserve."""
    unsafe_types = unsafe_element_types(media_slots_available=media_slots_available)
    unsafe_ids: list[str] = []
    for element in slide.get("elements", []):
        if not isinstance(element, dict) or element.get("type") not in unsafe_types:
            continue
        element_id = element.get("elementId")
        if isinstance(element_id, str) and element_id:
            unsafe_ids.append(element_id)
    return unsafe_ids


def collect_element_constraints(slide: dict[str, Any]) -> ElementConstraints:
    """Collect element references from the current shared Slide contract."""
    animations = [
        animation
        for animation in slide.get("animations", [])
        if isinstance(animation, dict)
    ]
    animation_element_ids = {
        element_id
        for animation in animations
        if isinstance((element_id := animation.get("elementId")), str)
        and element_id
    }
    animation_elements_by_id = {
        animation_id: element_id
        for animation in animations
        if isinstance((animation_id := animation.get("animationId")), str)
        and isinstance((element_id := animation.get("elementId")), str)
        and animation_id
        and element_id
    }

    action_element_ids: set[str] = set()
    for action in slide.get("actions", []):
        if not isinstance(action, dict):
            continue
        effect = action.get("effect")
        if not isinstance(effect, dict) or effect.get("kind") != "play-animation":
            continue
        animation_id = effect.get("animationId")
        if isinstance(animation_id, str) and animation_id in animation_elements_by_id:
            action_element_ids.add(animation_elements_by_id[animation_id])

    semantic_element_ids: set[str] = set()
    for cue in slide.get("semanticCues", []):
        if not isinstance(cue, dict):
            continue
        semantic_element_ids.update(_string_values(cue.get("targetElementIds")))
        for source_ref in cue.get("sourceRefs", []):
            if not isinstance(source_ref, dict) or source_ref.get("kind") not in {
                "element",
                "table",
                "chart",
                "image-analysis",
            }:
                continue
            ref_id = source_ref.get("refId")
            if isinstance(ref_id, str) and ref_id:
                semantic_element_ids.add(ref_id)

    locked_element_ids: set[str] = set()
    grouped_element_ids: set[str] = set()
    ooxml_element_ids: set[str] = set()
    for element in slide.get("elements", []):
        if not isinstance(element, dict):
            continue
        element_id = element.get("elementId")
        if not isinstance(element_id, str) or not element_id:
            continue
        if element.get("locked") is True:
            locked_element_ids.add(element_id)
        if element.get("ooxmlOrigin") is not None:
            ooxml_element_ids.add(element_id)
        if element.get("type") == "group":
            props = element.get("props")
            if isinstance(props, dict):
                grouped_element_ids.update(_string_values(props.get("childElementIds")))

    return ElementConstraints(
        referenced_element_ids=frozenset(
            animation_element_ids | action_element_ids | semantic_element_ids
        ),
        locked_element_ids=frozenset(locked_element_ids),
        grouped_element_ids=frozenset(grouped_element_ids),
        ooxml_element_ids=frozenset(ooxml_element_ids),
    )


def can_replace(element_id: str, constraints: ElementConstraints) -> bool:
    """Return whether an irreversible mapping may replace this element ID."""
    return not any(
        element_id in constrained_ids
        for constrained_ids in (
            constraints.referenced_element_ids,
            constraints.locked_element_ids,
            constraints.grouped_element_ids,
            constraints.ooxml_element_ids,
        )
    )


def _string_values(value: object) -> set[str]:
    if not isinstance(value, list):
        return set()
    return {item for item in value if isinstance(item, str) and item}


def unsafe_refusal_message(
    unsafe_element_ids: list[str], slide: dict[str, Any]
) -> str:
    """Build a user-facing refusal without exposing slide content."""
    unsafe_id_set = set(unsafe_element_ids)
    unsafe_types = {
        str(element.get("type"))
        for element in slide.get("elements", [])
        if isinstance(element, dict) and element.get("elementId") in unsafe_id_set
    }
    if unsafe_types & {"chart", "table"}:
        subject = "차트 또는 표"
    elif unsafe_types & MEDIA_ELEMENT_TYPES:
        subject = "이미지"
    elif "activity-qr" in unsafe_types:
        subject = "활동 QR"
    else:
        subject = "현재 보존할 수 없는 요소"
    return (
        f"이 슬라이드에는 {subject}가 포함되어 있어 전체 리디자인을 적용하지 "
        "않았습니다. 해당 요소를 제외한 부분만 정리하려면 요소를 선택한 뒤 "
        "요청해 주세요."
    )
