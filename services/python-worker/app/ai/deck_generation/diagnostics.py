from __future__ import annotations

from typing import Any

from app.ai.deck_generation.layout_compiler import core_geometry_fingerprint
from app.ai.deck_generation.models import (
    GenerateDeckDiagnostics,
    RawInput,
    ValidationIssue,
    ValidationResult,
)


def generate_deck_diagnostics(
    raw_input: RawInput,
    deck: dict[str, Any],
    validation: ValidationResult,
) -> GenerateDeckDiagnostics:
    source_records = raw_input.source_records
    uploaded_source_ids = {
        record.source_id for record in source_records if record.source_type == "uploaded"
    }
    web_source_urls = {
        record.url for record in source_records if record.source_type == "web" and record.url
    }
    body_slides = deck.get("slides", [])[1:-1]
    validation_issue_count = sum(
        len(issues)
        for issues in (
            validation.layout_issues,
            validation.content_issues,
            validation.design_issues,
            validation.presentation_issues,
        )
    )
    return GenerateDeckDiagnostics(
        referencePolicy=raw_input.brief.reference_policy,
        uploadedSourceCount=len(uploaded_source_ids),
        webSourceCount=len(web_source_urls),
        researchAttempts=raw_input.research_attempts,
        relevantWebSourceCount=raw_input.relevant_web_source_count,
        officialWebSourceCount=raw_input.official_web_source_count,
        repairAttempted=raw_input.repair_attempted,
        repairReasons=raw_input.repair_reason_codes,
        uniqueCoreLayoutCount=(
            len({core_geometry_fingerprint(slide) for slide in body_slides})
        ),
        validationIssueCount=validation_issue_count,
    )


def generation_warnings(
    raw_input: RawInput,
    generated_slide_count: int,
    validation: ValidationResult,
) -> list[str]:
    warnings: list[str] = []
    if not raw_input.references:
        warnings.append("참고자료 없이 topic-only generation으로 생성했습니다.")
    if raw_input.min_slide_count <= generated_slide_count < raw_input.max_slide_count:
        warnings.append(
            f"AI가 참고자료/주제 밀도를 기준으로 {generated_slide_count}장이 적정하다고 판단했습니다."
        )
    for issue in validation.design_issues:
        if should_promote_design_issue_to_warning(issue) and issue.message not in warnings:
            warnings.append(issue.message)
    if validation.design_issues:
        warnings.append(
            f"Design Pack validation retained {len(validation.design_issues)} design issue(s)."
        )

    return warnings


def unique_warnings(warnings: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for warning in warnings:
        if warning in seen:
            continue
        seen.add(warning)
        result.append(warning)
    return result












def should_promote_design_issue_to_warning(issue: ValidationIssue) -> bool:
    return issue.message.startswith("이미지 소스가 없어") or issue.message.startswith(
        "근거 데이터가 없어"
    )
