from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

MotionReasonCode = Literal[
    "SPECIAL_SLIDE",
    "SNAPSHOT_SLIDE",
    "IMPORT_RENDER_MODE_UNKNOWN",
    "IMPORT_SOURCE_MISSING",
    "IMPORT_COVERAGE_UNSAFE",
    "NO_STABLE_TARGETS",
    "NO_VISIBLE_CONTENT_TARGETS",
]


class MotionImportContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    render_mode: Literal["editable", "hybrid", "snapshot"] = Field(
        alias="renderMode"
    )
    source_slide_part_present: bool = Field(alias="sourceSlidePartPresent")
    imported_main_sequence_coverage: Literal[
        "absent", "complete", "partial", "unknown"
    ] = Field(alias="importedMainSequenceCoverage")
    stable_target_element_ids: list[str] = Field(
        alias="stableTargetElementIds", max_length=200
    )


class MotionEligibility(BaseModel):
    outcome: Literal["applicable", "not-needed", "refused-unsafe"]
    allowed_target_element_ids: list[str] = Field(
        default_factory=list, alias="allowedTargetElementIds"
    )
    source: Literal[
        "authored", "imported-editable", "imported-hybrid"
    ] | None = None
    reason_code: MotionReasonCode | None = Field(default=None, alias="reasonCode")


def evaluate_motion_eligibility(
    slide: dict[str, Any],
    *,
    deck_source_type: str | None = None,
    import_context: MotionImportContext | None = None,
) -> MotionEligibility:
    if slide.get("kind", "content") != "content":
        return _refused("SPECIAL_SLIDE")

    render_mode = (
        import_context.render_mode
        if import_context is not None
        else slide.get("importRenderMode")
    )
    if render_mode == "snapshot":
        return _refused("SNAPSHOT_SLIDE")

    elements = slide.get("elements")
    elements = elements if isinstance(elements, list) else []
    visible_target_ids = [
        str(element["elementId"])
        for element in elements
        if _is_visible_content_target(element)
    ]
    imported = _is_imported_slide(
        slide,
        elements,
        deck_source_type=deck_source_type,
        import_context=import_context,
    )
    if not imported:
        if visible_target_ids:
            return MotionEligibility(
                outcome="applicable",
                allowedTargetElementIds=visible_target_ids,
                source="authored",
            )
        return MotionEligibility(
            outcome="not-needed", reasonCode="NO_VISIBLE_CONTENT_TARGETS"
        )

    if render_mode not in {"editable", "hybrid"}:
        return _refused("IMPORT_RENDER_MODE_UNKNOWN")

    source_slide_part_present = (
        import_context.source_slide_part_present
        if import_context is not None
        else bool(slide.get("ooxmlSourceSlidePart"))
    )
    if not source_slide_part_present:
        return _refused("IMPORT_SOURCE_MISSING")

    coverage = (
        import_context.imported_main_sequence_coverage
        if import_context is not None
        else _slide_coverage(slide)
    )
    if coverage not in {"absent", "complete"}:
        return _refused("IMPORT_COVERAGE_UNSAFE")

    stable_target_ids = (
        set(import_context.stable_target_element_ids)
        if import_context is not None
        else set()
    )
    allowed_target_ids = [
        element_id
        for element_id in visible_target_ids
        if element_id in stable_target_ids
    ]
    if not allowed_target_ids:
        return _refused("NO_STABLE_TARGETS")

    return MotionEligibility(
        outcome="applicable",
        allowedTargetElementIds=allowed_target_ids,
        source=(
            "imported-hybrid" if render_mode == "hybrid" else "imported-editable"
        ),
    )


def motion_eligibility_message(reason_code: MotionReasonCode) -> str:
    return {
        "SPECIAL_SLIDE": "참여 장표와 결과 장표에는 애니메이션을 추천할 수 없습니다.",
        "SNAPSHOT_SLIDE": "이미지로 가져온 슬라이드에는 애니메이션을 안전하게 적용할 수 없습니다.",
        "IMPORT_RENDER_MODE_UNKNOWN": "가져온 슬라이드의 편집 모드를 확인할 수 없어 애니메이션 추천을 사용할 수 없습니다.",
        "IMPORT_SOURCE_MISSING": "가져온 슬라이드의 안정적인 OOXML 위치 정보가 없습니다.",
        "IMPORT_COVERAGE_UNSAFE": "가져온 애니메이션 구조를 완전하게 보존할 수 없어 추천을 사용할 수 없습니다.",
        "NO_STABLE_TARGETS": "원본에 안전하게 저장할 수 있는 애니메이션 대상이 없습니다.",
        "NO_VISIBLE_CONTENT_TARGETS": "애니메이션을 추천할 본문 요소가 없습니다.",
    }[reason_code]


def _is_imported_slide(
    slide: dict[str, Any],
    elements: list[Any],
    *,
    deck_source_type: str | None,
    import_context: MotionImportContext | None,
) -> bool:
    return bool(
        deck_source_type == "import"
        or import_context is not None
        or slide.get("importRenderMode") is not None
        or slide.get("ooxmlOrigin") == "imported"
        or slide.get("ooxmlSourceSlidePart") is not None
        or any(
            isinstance(element, dict) and element.get("ooxmlOrigin") == "imported"
            for element in elements
        )
    )


def _is_visible_content_target(element: Any) -> bool:
    return bool(
        isinstance(element, dict)
        and element.get("elementId")
        and element.get("visible") is not False
        and float(element.get("opacity", 1)) > 0
        and element.get("locked") is not True
        and element.get("role") not in {"background", "decoration", "footer"}
        and element.get("type") not in {"activity-qr", "arrow", "group", "line"}
    )


def _slide_coverage(slide: dict[str, Any]) -> Any:
    capabilities = slide.get("ooxmlMotionCapabilities")
    return (
        capabilities.get("importedMainSequenceCoverage")
        if isinstance(capabilities, dict)
        else None
    )


def _refused(reason_code: MotionReasonCode) -> MotionEligibility:
    return MotionEligibility(outcome="refused-unsafe", reasonCode=reason_code)
