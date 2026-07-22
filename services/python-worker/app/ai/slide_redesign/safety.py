from __future__ import annotations

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
