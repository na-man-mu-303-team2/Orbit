from __future__ import annotations

import copy
import json
from types import SimpleNamespace
from typing import Any, Callable

import pytest

from app.ai.motion_planner import (
    ExtractedMotionContextV3,
    MotionPlannerError,
    MotionPromptInputV3,
    MotionUnit,
    plan_narrative_motion_v3,
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


class SequencedFakeResponses:
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.payloads = payloads
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        payload = self.payloads[len(self.calls) - 1]
        return SimpleNamespace(output_text=json.dumps(payload))


class SequencedFakeClient:
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.responses = SequencedFakeResponses(payloads)


def process_extraction() -> MotionPromptInputV3:
    units = [
        motion_unit("title", "title", 1),
        *(motion_unit(f"card_{index}", "card", index + 1) for index in range(1, 6)),
        motion_unit("conclusion", "focal", 7),
    ]
    return MotionPromptInputV3(
        context=ExtractedMotionContextV3(
            slideType="process",
            narrativeIntent="sequence",
            units=units,
            approvedCueCount=0,
            notesPresent=True,
            notesTruncated=False,
        ),
        target_labels={unit.unit_id: unit.unit_id for unit in units},
        speaker_notes="카드를 순서대로 설명하고 결론을 강조합니다.",
    )


def motion_unit(
    suffix: str, semantic_role: str, reading_order: int
) -> MotionUnit:
    return MotionUnit(
        unitId=f"motion_unit_{suffix}",
        kind="spatial-cluster" if semantic_role == "card" else "element",
        animationElementIds=[f"el_{suffix}"],
        memberElementIds=[f"el_{suffix}"],
        semanticRole=semantic_role,
        readingOrder=reading_order,
        emphasis="primary" if semantic_role in {"title", "focal"} else "secondary",
        geometryBucket="top" if semantic_role == "title" else "center",
    )


def valid_process_draft() -> dict[str, Any]:
    return {
        "schemaVersion": 3,
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {
                        "unitId": "motion_unit_title",
                        "motionIntent": "introduce",
                    }
                ],
            },
            *(
                {
                    "beatId": f"beat_click_{index}",
                    "purpose": "reveal",
                    "trigger": "click",
                    "relation": "sequence",
                    "targets": [
                        {
                            "unitId": f"motion_unit_card_{index}",
                            "motionIntent": "reveal",
                        },
                        *(
                            [
                                {
                                    "unitId": "motion_unit_conclusion",
                                    "motionIntent": "conclude",
                                }
                            ]
                            if index == 5
                            else []
                        ),
                    ],
                }
                for index in range(1, 6)
            ),
        ],
    }


def test_v3_hydrates_server_pattern_and_hides_member_ids_from_llm() -> None:
    extraction = process_extraction()
    client = FakeClient(valid_process_draft())

    result = plan_narrative_motion_v3(
        extraction, model="motion-snapshot", api_key=None, client=client
    )

    assert result.attempt_count == 1
    assert result.plan.pattern == "stepwise-process"
    assert len(
        [beat for beat in result.plan.beats if beat.trigger == "click"]
    ) == 5
    prompt_input = client.responses.calls[0]["input"]
    response_schema = client.responses.calls[0]["text"]["format"]["schema"]
    assert "animationElementIds" not in prompt_input
    assert "memberElementIds" not in prompt_input
    assert "elementId" not in prompt_input
    assert "pattern" not in response_schema["properties"]


def test_v3_retries_when_five_step_process_moves_first_card_to_entry() -> None:
    invalid = copy.deepcopy(valid_process_draft())
    first_card = invalid["beats"][1]["targets"][0]
    conclusion = invalid["beats"][-1]["targets"].pop()
    invalid["beats"][0]["targets"].append(first_card)
    for index in range(1, len(invalid["beats"]) - 1):
        invalid["beats"][index]["targets"] = invalid["beats"][index + 1]["targets"]
    invalid["beats"][-1]["targets"] = [conclusion]
    client = SequencedFakeClient([invalid, valid_process_draft()])

    result = plan_narrative_motion_v3(
        process_extraction(),
        model="motion-snapshot",
        api_key=None,
        client=client,
    )

    assert result.attempt_count == 2
    assert result.plan.beats[0].target_unit_ids == ["motion_unit_title"]
    assert result.plan.beats[-1].target_unit_ids == [
        "motion_unit_card_5",
        "motion_unit_conclusion",
    ]
    instructions = client.responses.calls[0]["instructions"]
    assert "MUST NOT contain a card" in instructions
    assert "Never create a separate click beat" in " ".join(instructions.split())


def test_v3_six_step_process_places_first_card_on_entry() -> None:
    extraction = process_extraction()
    sixth_card = motion_unit("card_6", "card", 7)
    extraction = MotionPromptInputV3(
        context=ExtractedMotionContextV3(
            slideType="process",
            narrativeIntent="sequence",
            units=[*extraction.context.units[:-1], sixth_card],
            approvedCueCount=0,
            notesPresent=False,
            notesTruncated=False,
        ),
        target_labels={},
        speaker_notes="",
    )
    payload = valid_process_draft()
    payload["beats"][0]["targets"].append(
        {"unitId": "motion_unit_card_1", "motionIntent": "reveal"}
    )
    for index, beat in enumerate(payload["beats"][1:], start=2):
        beat["targets"] = [
            {
                "unitId": f"motion_unit_card_{index}",
                "motionIntent": "reveal",
            }
        ]

    result = plan_narrative_motion_v3(
        extraction,
        model="motion-snapshot",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.plan.beats[0].target_unit_ids == [
        "motion_unit_title",
        "motion_unit_card_1",
    ]
    assert [
        beat.target_unit_ids[0] for beat in result.plan.beats[1:]
    ] == [f"motion_unit_card_{index}" for index in range(2, 7)]


@pytest.mark.parametrize(
    "mutation",
    [
        lambda plan: plan.update({"pattern": "paired-comparison"}),
        lambda plan: plan["beats"][1]["targets"].clear(),
        lambda plan: plan["beats"][2]["targets"][0].update(
            {"unitId": "motion_unit_card_3"}
        ),
        lambda plan: plan["beats"][1]["targets"][0].update(
            {"unitId": "motion_unit_number_only"}
        ),
        lambda plan: plan["beats"][-1]["targets"].pop(),
        lambda plan: plan["beats"].append(
            {
                "beatId": "beat_click_6",
                "purpose": "conclude",
                "trigger": "click",
                "relation": "sequence",
                "targets": [
                    {
                        "unitId": "motion_unit_extra",
                        "motionIntent": "conclude",
                    }
                ],
            }
        ),
    ],
    ids=[
        "pattern-selection",
        "skipped-card",
        "out-of-order-card",
        "unknown-partial-target",
        "missing-conclusion",
        "six-clicks",
    ],
)
def test_v3_retries_then_rejects_invalid_process_drafts(
    mutation: Callable[[dict[str, Any]], None],
) -> None:
    extraction = process_extraction()
    payload = copy.deepcopy(valid_process_draft())
    mutation(payload)
    client = FakeClient(payload)

    with pytest.raises(MotionPlannerError) as error:
        plan_narrative_motion_v3(
            extraction,
            model="motion-snapshot",
            api_key=None,
            client=client,
        )

    assert error.value.code == "MOTION_AI_INVALID_PLAN"
    assert len(client.responses.calls) == 2


def test_v3_structured_composition_requires_every_unit_in_order() -> None:
    units = [
        motion_unit("title", "title", 1),
        motion_unit("comparison_1", "card", 2),
        motion_unit("comparison_2", "card", 3),
    ]
    extraction = MotionPromptInputV3(
        context=ExtractedMotionContextV3(
            slideType="comparison",
            narrativeIntent="contrast",
            structureFamily="feature-comparison",
            units=units,
            approvedCueCount=0,
            notesPresent=False,
            notesTruncated=False,
        ),
        target_labels={unit.unit_id: unit.unit_id for unit in units},
        speaker_notes="",
    )
    invalid = {
        "schemaVersion": 3,
        "pacing": "balanced",
        "beats": [
            {
                "beatId": "beat_entry",
                "purpose": "orient",
                "trigger": "entry",
                "relation": "together",
                "targets": [
                    {
                        "unitId": "motion_unit_title",
                        "motionIntent": "introduce",
                    }
                ],
            },
            {
                "beatId": "beat_click_1",
                "purpose": "contrast",
                "trigger": "click",
                "relation": "sequence",
                "targets": [
                    {
                        "unitId": "motion_unit_comparison_2",
                        "motionIntent": "compare",
                    },
                    {
                        "unitId": "motion_unit_comparison_1",
                        "motionIntent": "compare",
                    },
                ],
            },
        ],
    }
    client = FakeClient(invalid)

    with pytest.raises(MotionPlannerError) as error:
        plan_narrative_motion_v3(
            extraction,
            model="motion-snapshot",
            api_key=None,
            client=client,
        )

    assert error.value.code == "MOTION_AI_INVALID_PLAN"
    assert len(client.responses.calls) == 2
    prompt_input = client.responses.calls[0]["input"]
    instructions = client.responses.calls[0]["instructions"]
    assert '"structureFamily": "feature-comparison"' in prompt_input
    assert "include every supplied unit exactly once" in instructions
