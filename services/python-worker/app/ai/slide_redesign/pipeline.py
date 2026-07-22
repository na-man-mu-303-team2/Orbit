from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from app.ai.composition_library import CompositionCompileError
from app.ai.design_agent import DesignAgentRequest, DesignAgentResponse

from .diff import filter_safe_candidates
from .safety import RedesignOutcome
from .stages import run_compose_stage, run_interpret_stage, run_verify_stage


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

    try:
        interpreted = run_interpret_stage(
            request,
            model=model,
            api_key=api_key,
            client=client,
        )
        slide_type_source = interpreted.slide_type_source
        mark_phase("interpret")
        if interpreted.outcome != "applicable":
            return complete(
                RedesignResult(
                    outcome=interpreted.outcome,
                    reason=interpreted.reason,
                ),
                unsafe_reason=(
                    "unsupported-element"
                    if interpreted.outcome == "refused-unsafe"
                    else None
                ),
            )

        composed = run_compose_stage(
            request,
            interpreted,
            model=model,
            api_key=api_key,
            client=client,
            filter_candidates=filter_safe_candidates,
        )
        candidate_count = composed.candidate_count
        safe_candidate_count = composed.safe_candidate_count
        chosen_composition_id = composed.chosen_composition_id
        irreversible_count = composed.irreversible_count
        mark_phase("compose")
        if composed.outcome != "applicable":
            return complete(
                RedesignResult(outcome=composed.outcome, reason=composed.reason),
                unsafe_reason=(
                    "constraints-eliminated-candidates"
                    if composed.outcome == "refused-unsafe"
                    else None
                ),
            )

        verified = run_verify_stage(request, composed)
        mark_phase("verify")
        assert verified.response is not None
        operation_count = len(verified.response.operations)
        return complete(
            RedesignResult(outcome="applicable", response=verified.response)
        )
    except (CompositionCompileError, StopIteration, ValueError, TypeError, KeyError):
        mark_phase("failure")
        return complete(_fallback("redesign-compile-failed"))
    except Exception:
        mark_phase("failure")
        return complete(_fallback("redesign-unavailable"))


def _fallback(reason: str) -> RedesignResult:
    return RedesignResult(outcome="fallback-allowed", reason=reason)


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
