from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.design_agent import (
    DesignAgentGenerationError,
    DesignAgentRequest,
    design_agent_system_prompt,
    generate_design_proposal,
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


def request_payload(*, locked: bool = False) -> DesignAgentRequest:
    return DesignAgentRequest.model_validate(
        {
            "projectId": "project_1",
            "sessionId": "design_session_1",
            "question": "이미지를 오른쪽으로 옮겨줘",
            "context": {
                "deckId": "deck_1",
                "baseVersion": 3,
                "canvas": {"preset": "wide", "width": 1920, "height": 1080},
                "slide": {
                    "slideId": "slide_1",
                    "elements": [
                        {
                            "elementId": "el_image",
                            "type": "image",
                            "x": 100,
                            "y": 200,
                            "width": 600,
                            "height": 300,
                            "locked": locked,
                            "visible": True,
                        }
                    ],
                },
                "selectedElementIds": ["el_image"],
                "theme": {"name": "Business"},
            },
            "history": [],
        }
    )


def proposal_payload(*, x: float = 1200) -> dict[str, Any]:
    return {
        "message": "이미지를 오른쪽으로 옮기는 변경안을 준비했습니다.",
        "interpretedIntent": {
            "target": "selected-elements",
            "action": "이미지 우측 정렬",
            "alignment": "canvas-right",
        },
        "operations": [
            {
                "type": "update_element_frame",
                "slideId": "slide_1",
                "elementId": "el_image",
                "frame": {"x": x},
            }
        ],
        "affectedElementIds": ["el_image"],
        "warnings": [],
    }


def test_generates_and_validates_design_operations() -> None:
    client = FakeClient(proposal_payload())
    request = request_payload()

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert result.operations[0].type == "update_element_frame"
    assert client.responses.calls[0]["text"]["format"]["strict"] is True
    assert "untrusted presentation data" in client.responses.calls[0]["instructions"]


def test_rejects_operations_outside_canvas() -> None:
    with pytest.raises(DesignAgentGenerationError, match="outside the canvas"):
        generate_design_proposal(
            request_payload(),
            model="test-model",
            api_key=None,
            client=FakeClient(proposal_payload(x=1500)),
        )


def test_rejects_operations_targeting_locked_elements() -> None:
    with pytest.raises(DesignAgentGenerationError, match="locked or hidden"):
        generate_design_proposal(
            request_payload(locked=True),
            model="test-model",
            api_key=None,
            client=FakeClient(proposal_payload()),
        )


def test_prompt_uses_actual_canvas_dimensions() -> None:
    prompt = design_agent_system_prompt(request_payload().context.canvas)

    assert "1920.0 by 1080.0" in prompt
    assert "horizontal safe margins of 96.0" in prompt


def test_allows_an_unspecified_alignment() -> None:
    payload = proposal_payload()
    payload["interpretedIntent"]["alignment"] = None

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.interpreted_intent.alignment is None
