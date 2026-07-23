from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.motion_planner import (
    MotionPlanningContext,
    deterministic_fallback_plan,
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

    assert result.fallback_used is False
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

    result = plan_narrative_motion(
        extraction,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.fallback_used is True
    assert result.plan == deterministic_fallback_plan(extraction)


def test_fallback_is_deterministic_for_provider_failure() -> None:
    extraction = extraction_fixture()

    first = plan_narrative_motion(
        extraction, model="motion-snapshot", api_key=None
    )
    second = plan_narrative_motion(
        extraction, model="motion-snapshot", api_key=None
    )

    assert first.fallback_used is True
    assert first.plan.model_dump() == second.plan.model_dump()
