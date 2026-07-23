from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.motion_planner import (
    MotionPlannerError,
    MotionPlanningContext,
    extract_motion_context,
    plan_narrative_motion,
)

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "motion-extractor"
    / "semantic-slide.json"
)


class FakeResponses:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload))


class FakeClient:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.responses = FakeResponses(payload)


class SequenceResponses:
    def __init__(self, output_texts: list[str]) -> None:
        self.output_texts = output_texts
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=self.output_texts.pop(0))


class SequenceClient:
    def __init__(self, output_texts: list[str]) -> None:
        self.responses = SequenceResponses(output_texts)


def extraction_fixture():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return extract_motion_context(
        fixture["slide"],
        MotionPlanningContext.model_validate(fixture["planningContext"]),
    )


def valid_plan() -> dict[str, Any]:
    return {
        "schemaVersion": 2,
        "pattern": "hero-then-support",
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {"elementId": "el_title", "motionIntent": "introduce"}
                ],
            },
            {
                "beatId": "beat_click_1",
                "purpose": "emphasize",
                "trigger": "click",
                "relation": "sequence",
                "targets": [
                    {"elementId": "el_body", "motionIntent": "support"},
                    {"elementId": "el_focal", "motionIntent": "focus"},
                ],
            },
        ],
    }


def test_accepts_strict_semantic_plan_without_patch_fields() -> None:
    extraction = extraction_fixture()
    client = FakeClient(valid_plan())

    result = plan_narrative_motion(
        extraction, model="motion-snapshot", api_key=None, client=client
    )

    assert result.attempt_count == 1
    assert result.plan.pattern == "hero-then-support"
    assert "speakerNotes" in client.responses.calls[0]["input"]
    assert "durationMs" not in client.responses.calls[0]["instructions"]


@pytest.mark.parametrize(
    "mutation",
    [
        lambda plan: plan.update({"operations": []}),
        lambda plan: plan["beats"][0].update({"durationMs": 400}),
        lambda plan: plan["beats"][0]["targets"][0].update(
            {"elementId": "el_not_allowed"}
        ),
        lambda plan: plan.update(
            {
                "beats": [
                    {
                        "beatId": f"beat_click_{index}",
                        "purpose": "reveal",
                        "trigger": "click",
                        "relation": "sequence",
                        "targets": [
                            {
                                "elementId": f"el_{index}",
                                "motionIntent": "reveal",
                            }
                        ],
                    }
                    for index in range(7)
                ]
            }
        ),
    ],
)
def test_rejects_unknown_patch_timing_allowlist_and_cap_violations(mutation) -> None:
    extraction = extraction_fixture()
    payload = valid_plan()
    mutation(payload)

    client = FakeClient(payload)
    with pytest.raises(MotionPlannerError) as error:
        plan_narrative_motion(
            extraction,
            model="motion-snapshot",
            api_key=None,
            client=client,
        )

    assert error.value.code == "MOTION_AI_INVALID_PLAN"
    assert len(client.responses.calls) == 2


def test_missing_provider_fails_immediately_without_silent_fallback() -> None:
    extraction = extraction_fixture()

    with pytest.raises(MotionPlannerError) as error:
        plan_narrative_motion(extraction, model="motion-snapshot", api_key=None)

    assert error.value.code == "MOTION_AI_PROVIDER_UNAVAILABLE"
    assert error.value.retryable is False


def test_empty_first_response_retries_once_with_same_model() -> None:
    extraction = extraction_fixture()
    client = SequenceClient(["", json.dumps(valid_plan())])

    result = plan_narrative_motion(
        extraction,
        model="motion-snapshot",
        api_key=None,
        client=client,
    )

    assert result.attempt_count == 2
    assert [call["model"] for call in client.responses.calls] == [
        "motion-snapshot",
        "motion-snapshot",
    ]


def test_empty_second_response_returns_bounded_error_code() -> None:
    extraction = extraction_fixture()

    with pytest.raises(MotionPlannerError) as error:
        plan_narrative_motion(
            extraction,
            model="motion-snapshot",
            api_key=None,
            client=SequenceClient(["", ""]),
        )

    assert error.value.code == "MOTION_AI_EMPTY_RESPONSE"
    assert error.value.status_code == 503
