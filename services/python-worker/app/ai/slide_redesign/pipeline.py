from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from app.ai.composition_library import CompositionCompileError
from app.ai.design_agent import (
    DesignAgentRequest,
    DesignAgentResponse,
    _is_broad_preset_request,
)

from .composer import eligible_candidates, select_composition
from .diff import build_operations, filter_safe_candidates
from .safety import (
    ElementConstraints,
    RedesignOutcome,
    collect_element_constraints,
    find_unsafe_elements,
    unsafe_refusal_message,
)
from .slide_extractor import (
    classify_slide_type_with_source,
    collect_text_elements,
    extract_slide,
    infer_hierarchy,
)


MEDIA_ENABLED = False
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RedesignResult:
    outcome: RedesignOutcome
    response: DesignAgentResponse | None = None
    reason: str | None = None


def redesign_slide(
    request: DesignAgentRequest,
    *,
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> RedesignResult:
    """Attempt one safe whole-slide redesign and never propagate exceptions."""
    started_at = time.perf_counter()
    phase_started_at = started_at
    durations: dict[str, int] = {}
    slide_type_source: str | None = None
    candidate_count = 0
    safe_candidate_count = 0
    chosen_composition_id: str | None = None
    operation_count = 0
    irreversible_count = 0

    def mark_phase(name: str) -> None:
        nonlocal phase_started_at
        now = time.perf_counter()
        durations[name] = round((now - phase_started_at) * 1000)
        phase_started_at = now

    def complete(
        result: RedesignResult,
        *,
        unsafe_reason: str | None = None,
    ) -> RedesignResult:
        _log_result(
            result,
            slide_type_source=slide_type_source,
            candidate_count=candidate_count,
            safe_candidate_count=safe_candidate_count,
            chosen_composition_id=chosen_composition_id,
            operation_count=operation_count,
            irreversible_count=irreversible_count,
            unsafe_reason=unsafe_reason,
            durations={
                **durations,
                "total": round((time.perf_counter() - started_at) * 1000),
            },
        )
        return result

    if not _should_attempt_redesign(request):
        mark_phase("routing")
        return complete(_fallback("request-not-broad"))
    if request.context.canvas.width != 1920 or request.context.canvas.height != 1080:
        mark_phase("routing")
        return complete(_fallback("unsupported-canvas"))
    mark_phase("routing")

    slide = request.context.slide
    unsafe_ids = find_unsafe_elements(
        slide,
        media_slots_available=MEDIA_ENABLED,
    )
    if unsafe_ids:
        mark_phase("safety")
        return complete(
            RedesignResult(
                outcome="refused-unsafe",
                reason=unsafe_refusal_message(unsafe_ids, slide),
            ),
            unsafe_reason="unsupported-element",
        )

    texts = collect_text_elements(slide)
    if not texts:
        mark_phase("safety")
        return complete(_fallback("no-visible-text"))
    mark_phase("safety")

    try:
        hierarchy = infer_hierarchy(texts)
        slide_type, slide_type_source = classify_slide_type_with_source(
            hierarchy,
            model=model,
            api_key=api_key,
            client=client,
        )
        extracted = extract_slide(
            slide,
            slide_type=slide_type,
            hierarchy=hierarchy,
        )
        mark_phase("extraction")
        candidates = eligible_candidates(extracted.summary)
        candidate_count = len(candidates)
        constraints = collect_element_constraints(slide)
        analyses = filter_safe_candidates(
            extracted.summary,
            extracted.provenance,
            slide,
            candidates,
            request.context.theme,
            constraints,
        )
        safe_candidate_count = len(analyses)
        mark_phase("candidate_analysis")
        if not analyses:
            constrained_ids = _constrained_ids(constraints)
            if constrained_ids:
                return complete(
                    RedesignResult(
                        outcome="refused-unsafe",
                        reason=unsafe_refusal_message(sorted(constrained_ids), slide),
                    ),
                    unsafe_reason="constraints-eliminated-candidates",
                )
            return complete(_fallback("no-safe-candidate"))

        chosen = select_composition(
            extracted.summary,
            [analysis.candidate for analysis in analyses],
            request.question,
            model=model,
            api_key=api_key,
            client=client,
        )
        chosen_composition_id = chosen.composition_id
        analysis = next(
            item for item in analyses if item.candidate == chosen
        )
        irreversible_count = len(analysis.matching.irreversible)
        mark_phase("selection")
        slide_id = str(slide.get("slideId", ""))
        original_elements = [
            element
            for element in slide.get("elements", [])
            if isinstance(element, dict)
        ]
        operations = build_operations(
            slide_id,
            original_elements,
            analysis.compiled,
            analysis.matching,
        )
        operation_count = len(operations)
        affected_element_ids = _affected_element_ids(operations)
        response = DesignAgentResponse.model_validate(
            {
                "message": "현재 문구를 유지한 전체 슬라이드 리디자인안을 준비했습니다.",
                "interpretedIntent": {
                    "target": "current-slide",
                    "action": "redesign-slide",
                    "alignment": None,
                },
                "operations": operations,
                "affectedElementIds": affected_element_ids,
                "warnings": [],
                "smartArtRequest": None,
                "uiAction": None,
            }
        )
        mark_phase("operations")
        return complete(RedesignResult(outcome="applicable", response=response))
    except (CompositionCompileError, StopIteration, ValueError, TypeError, KeyError):
        mark_phase("failure")
        return complete(_fallback("redesign-compile-failed"))
    except Exception:
        mark_phase("failure")
        return complete(_fallback("redesign-unavailable"))


def _should_attempt_redesign(request: DesignAgentRequest) -> bool:
    if _is_explicit_smart_art_request(request.question):
        return False
    return request.intent_preset == "redesign-slide" or _is_broad_preset_request(
        request.question
    )


def _fallback(reason: str) -> RedesignResult:
    return RedesignResult(outcome="fallback-allowed", reason=reason)


def _is_explicit_smart_art_request(question: str) -> bool:
    normalized = " ".join(question.casefold().split())
    return any(
        token in normalized
        for token in (
            "스마트아트",
            "다이어그램",
            "smartart",
            "smart art",
            "process diagram",
            "step diagram",
            "flow diagram",
        )
    )


def _constrained_ids(constraints: ElementConstraints) -> set[str]:
    return set().union(
        constraints.referenced_element_ids,
        constraints.locked_element_ids,
        constraints.grouped_element_ids,
        constraints.ooxml_element_ids,
    )


def _affected_element_ids(operations: list[dict[str, Any]]) -> list[str]:
    affected: list[str] = []
    for operation in operations:
        element_id = operation.get("elementId")
        if not isinstance(element_id, str):
            element = operation.get("element")
            element_id = element.get("elementId") if isinstance(element, dict) else None
        if isinstance(element_id, str) and element_id not in affected:
            affected.append(element_id)
    return affected


def _log_result(
    result: RedesignResult,
    *,
    slide_type_source: str | None,
    candidate_count: int,
    safe_candidate_count: int,
    chosen_composition_id: str | None,
    operation_count: int,
    irreversible_count: int,
    unsafe_reason: str | None,
    durations: dict[str, int],
) -> None:
    fields: dict[str, Any] = {
        "event": "slide-redesign.completed",
        "outcome": result.outcome,
        "slide_type_source": slide_type_source,
        "candidate_count": candidate_count,
        "safe_candidate_count": safe_candidate_count,
        "chosen_composition_id": chosen_composition_id,
        "operation_count": operation_count,
        "irreversible_count": irreversible_count,
        "duration_ms": durations,
        "durationMs": durations["total"],
    }
    if result.outcome == "refused-unsafe" and unsafe_reason is not None:
        fields["unsafe_reason"] = unsafe_reason
    log = logger.warning if result.outcome == "refused-unsafe" else logger.info
    log("slide-redesign.completed", extra=fields)
