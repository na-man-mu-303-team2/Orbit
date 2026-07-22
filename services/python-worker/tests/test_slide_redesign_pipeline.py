from __future__ import annotations

import logging
from typing import Any

import pytest

from app.ai.design_agent import DesignAgentRequest, generate_design_proposal
from app.ai.slide_redesign.pipeline import redesign_slide


def text_element(
    element_id: str,
    text: str,
    *,
    role: str = "body",
    y: int = 240,
) -> dict[str, Any]:
    return {
        "elementId": element_id,
        "type": "text",
        "role": role,
        "x": 120,
        "y": y,
        "width": 1200,
        "height": 160,
        "rotation": 0,
        "opacity": 1,
        "zIndex": 2,
        "locked": False,
        "visible": True,
        "props": {
            "text": text,
            "fontFamily": "Pretendard",
            "fontSize": 44 if role == "title" else 28,
            "fontWeight": "bold" if role == "title" else "normal",
            "color": "#111827",
            "align": "left",
            "verticalAlign": "top",
            "lineHeight": 1.2,
        },
    }


def request_for(
    elements: list[dict[str, Any]],
    *,
    question: str = "이 슬라이드를 예쁘게 재디자인해줘",
    intent_preset: str | None = "redesign-slide",
    width: int = 1920,
    height: int = 1080,
    animations: list[dict[str, Any]] | None = None,
) -> DesignAgentRequest:
    return DesignAgentRequest.model_validate(
        {
            "projectId": "project-1",
            "sessionId": "session-1",
            "question": question,
            "intentPreset": intent_preset,
            "context": {
                "deckId": "deck-1",
                "baseVersion": 1,
                "canvas": {"width": width, "height": height},
                "slide": {
                    "slideId": "slide-1",
                    "elements": elements,
                    "animations": animations or [],
                },
                "selectedElementIds": [],
                "theme": {
                    "fontFamily": "Pretendard",
                    "backgroundColor": "#FFFFFF",
                    "textColor": "#111827",
                    "accentColor": "#2563EB",
                },
            },
            "history": [],
            "availableSmartArtLayouts": [],
            "capabilities": {
                "version": "1",
                "operations": [
                    "add_element",
                    "update_element_frame",
                    "update_element_props",
                    "delete_element",
                    "update_slide_style",
                ],
                "addableElementTypes": ["text", "rect", "chart", "table"],
                "canEditTextContent": True,
                "canGenerateImages": False,
                "canModifyLockedElements": True,
            },
        }
    )


def standard_elements() -> list[dict[str, Any]]:
    return [
        text_element("el_title", "프로젝트 단계", role="title", y=100),
        text_element("el_step_1", "1. 준비", y=300),
        text_element("el_step_2", "2. 실행", y=500),
        text_element("el_step_3", "3. 검증", y=700),
    ]


def test_normal_text_slide_is_applicable() -> None:
    result = redesign_slide(
        request_for(standard_elements()),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "applicable"
    assert result.response is not None
    assert result.response.operations


def test_non_wide_canvas_allows_fallback() -> None:
    result = redesign_slide(
        request_for(standard_elements(), width=1024, height=768),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "fallback-allowed"
    assert result.reason == "unsupported-canvas"


def test_slide_without_text_allows_fallback() -> None:
    result = redesign_slide(
        request_for([]),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "fallback-allowed"
    assert result.reason == "no-visible-text"


@pytest.mark.parametrize("element_type", ["chart", "table"])
def test_unsupported_rich_element_refuses_whole_slide_redesign(
    element_type: str,
) -> None:
    elements = [
        *standard_elements(),
        {
            "elementId": f"el_{element_type}",
            "type": element_type,
            "visible": True,
            "locked": False,
        },
    ]

    result = redesign_slide(
        request_for(elements),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "refused-unsafe"
    assert result.response is None


def test_local_chart_edit_does_not_enter_redesign_pipeline() -> None:
    elements = [
        *standard_elements(),
        {"elementId": "el_chart", "type": "chart", "visible": True},
    ]

    result = redesign_slide(
        request_for(
            elements,
            question="차트 제목 색만 바꿔줘",
            intent_preset=None,
        ),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "fallback-allowed"
    assert result.reason == "request-not-broad"


def test_no_candidate_without_constraints_allows_fallback() -> None:
    elements = [text_element("el_title", "기능", role="title", y=100)]
    elements.extend(
        text_element(f"el_item_{index}", f"기능 {index}", y=200 + index * 50)
        for index in range(1, 11)
    )

    result = redesign_slide(
        request_for(elements),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "fallback-allowed"


def test_constraints_that_eliminate_all_candidates_refuse_redesign() -> None:
    elements = [
        text_element("el_title", "프로젝트 단계", role="title", y=100),
        text_element("el_body", "• 준비\n• 실행\n• 검증", y=300),
    ]
    result = redesign_slide(
        request_for(
            elements,
            animations=[
                {
                    "animationId": "anim-body",
                    "elementId": "el_body",
                    "type": "fade-in",
                    "order": 1,
                }
            ],
        ),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "refused-unsafe"
    assert result.response is None


def test_internal_compile_failure_never_propagates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail(*_: Any, **__: Any) -> list[Any]:
        raise RuntimeError("compile unavailable")

    monkeypatch.setattr(
        "app.ai.slide_redesign.pipeline.filter_safe_candidates",
        fail,
    )

    result = redesign_slide(
        request_for(standard_elements()),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "fallback-allowed"
    assert result.reason == "redesign-unavailable"


def test_applicable_pipeline_response_passes_design_agent_validation() -> None:
    response = generate_design_proposal(
        request_for(standard_elements()),
        model="test-model",
        api_key=None,
    )

    assert response.operations
    assert response.interpreted_intent.action == "redesign-slide"


def test_refused_pipeline_response_is_valid_with_empty_operations() -> None:
    response = generate_design_proposal(
        request_for(
            [
                *standard_elements(),
                {"elementId": "el_chart", "type": "chart", "visible": True},
            ]
        ),
        model="test-model",
        api_key=None,
    )

    assert response.operations == []
    assert response.affected_element_ids == []
    assert response.interpreted_intent.action == "refused"


def test_pipeline_logs_only_structured_diagnostics(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app.ai.slide_redesign.pipeline")
    sensitive_question = "이 슬라이드를 예쁘게 해줘 DO_NOT_LOG_THIS_TEXT"

    result = redesign_slide(
        request_for(standard_elements(), question=sensitive_question),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "applicable"
    record = next(
        record
        for record in caplog.records
        if getattr(record, "event", None) == "slide-redesign.completed"
    )
    assert record.outcome == "applicable"
    assert record.slide_type_source == "heuristic"
    assert record.candidate_count >= record.safe_candidate_count > 0
    assert record.chosen_composition_id
    assert record.operation_count > 0
    assert record.duration_ms["total"] >= 0
    assert sensitive_question not in caplog.text
