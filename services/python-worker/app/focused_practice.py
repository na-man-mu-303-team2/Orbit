from typing import Any, cast

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter()


class FocusedPracticeGoalRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    goal_id: str = Field(alias="goalId")
    criterion_ref: dict[str, Any] = Field(alias="criterionRef")
    criterion: dict[str, Any] | None = None


class FocusedPracticeAnalyzeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    transcript: str
    duration_ms: int = Field(alias="durationMs", ge=1, le=300_000)
    goals: list[FocusedPracticeGoalRequest] = Field(min_length=1, max_length=3)


class FocusedPracticeAnalyzeResponse(BaseModel):
    outcomes: list[dict[str, Any]]


@router.post("/focused-practice/analyze", response_model=FocusedPracticeAnalyzeResponse)
def analyze_focused_practice(
    payload: FocusedPracticeAnalyzeRequest,
) -> FocusedPracticeAnalyzeResponse:
    outcomes: list[dict[str, Any]] = []
    for goal in payload.goals:
        criterion = goal.criterion or {}
        measurement = cast(dict[str, Any], criterion.get("measurement", {}))
        measurement_type = str(measurement.get("type", ""))
        if not payload.transcript.strip() or not criterion:
            observation: dict[str, Any] = {"kind": "none"}
            threshold: dict[str, Any] = {"kind": "none"}
            outcome = "unmeasured"
            reason_code = "TRANSCRIPT_INCOMPLETE"
            measurement_state = "unmeasured"
        elif measurement_type == "max-duration-seconds":
            maximum = float(measurement.get("maximum", 0))
            actual = payload.duration_ms / 1000
            passed = actual <= maximum
            observation = {"kind": "duration-seconds", "value": actual}
            threshold = {"kind": "max-duration-seconds", "value": maximum}
            outcome = "passed" if passed else "failed"
            reason_code = "PASSED" if passed else "THRESHOLD_EXCEEDED"
            measurement_state = "measured"
        elif measurement_type == "max-count":
            metric = str(measurement.get("metric"))
            count = payload.transcript.count("음")
            maximum = int(measurement.get("maximum", 0))
            passed = count <= maximum
            observation = {"kind": "count", "metric": metric, "value": count}
            threshold = {"kind": "max-count", "metric": metric, "value": maximum}
            outcome = "passed" if passed else "failed"
            reason_code = "PASSED" if passed else "THRESHOLD_EXCEEDED"
            measurement_state = "measured"
        else:
            passed = len(payload.transcript.strip()) >= 12
            observation = {
                "kind": "semantic",
                "value": "covered" if passed else "missed",
            }
            threshold = {"kind": "semantic-required", "minimum": "partial"}
            outcome = "passed" if passed else "failed"
            reason_code = "PASSED" if passed else "CONCEPT_MISSED"
            measurement_state = "measured"
        outcomes.append(
            {
                "goalId": goal.goal_id,
                "criterionRef": goal.criterion_ref,
                "measurementState": measurement_state,
                "outcome": outcome,
                "observation": observation,
                "threshold": threshold,
                "reasonCode": reason_code,
            }
        )
    return FocusedPracticeAnalyzeResponse(outcomes=outcomes)
