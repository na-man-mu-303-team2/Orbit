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


def image_element(
    element_id: str,
    *,
    width: int = 800,
    height: int = 600,
) -> dict[str, Any]:
    return {
        "elementId": element_id,
        "type": "image",
        "role": "media",
        "x": 1040,
        "y": 220,
        "width": width,
        "height": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": 2,
        "locked": False,
        "visible": True,
        "props": {
            "src": "https://example.com/product.png",
            "alt": "제품 이미지",
            "fit": "contain",
            "focusX": 0.5,
            "focusY": 0.5,
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
    capability_version: str = "1",
    addable_element_types: list[str] | None = None,
    request_palette_options: bool = False,
    selected_palette_option: dict[str, Any] | None = None,
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
                "version": capability_version,
                "operations": [
                    "add_element",
                    "update_element_frame",
                    "update_element_props",
                    "delete_element",
                    "update_slide_style",
                ],
                "addableElementTypes": addable_element_types
                or ["text", "rect", "chart", "table"],
                "canEditTextContent": True,
                "canGenerateImages": False,
                "canModifyLockedElements": True,
            },
            "requestPaletteOptions": request_palette_options,
            **(
                {"selectedPaletteOption": selected_palette_option}
                if selected_palette_option is not None
                else {}
            ),
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


def test_palette_option_request_returns_three_options_without_operations() -> None:
    response = generate_design_proposal(
        request_for(standard_elements(), request_palette_options=True),
        model="test-model",
        api_key=None,
    )

    assert response.operations == []
    assert response.palette_options is not None
    assert len(response.palette_options) == 3
    assert response.palette_options[0].is_current_theme is True
    assert all(
        option.is_current_theme is False for option in response.palette_options[1:]
    )


def test_selected_palette_is_used_for_final_proposal() -> None:
    selected = {
        "optionId": "selected-coral",
        "name": "선명한 코럴",
        "isCurrentTheme": False,
        "palette": {
            "dominant": "#FFF7ED",
            "surface": "#FFFFFF",
            "text": "#431407",
            "focal": "#EA580C",
            "secondary": "#DB2777",
        },
        "rationale": "강한 인상을 줍니다.",
    }

    response = generate_design_proposal(
        request_for(standard_elements(), selected_palette_option=selected),
        model="test-model",
        api_key=None,
    )

    style_operation = next(
        operation
        for operation in response.operations
        if operation.type == "update_slide_style"
    )
    assert style_operation.style.background_color == "#FFF7ED"
    assert response.palette_options is None


def test_current_theme_selection_keeps_theme_focal_color() -> None:
    selected = {
        "optionId": "current-theme",
        "name": "현재 테마 유지",
        "isCurrentTheme": True,
        "palette": {
            "dominant": "#FFFFFF",
            "surface": "#F8FAFC",
            "text": "#111827",
            "focal": "#2563EB",
            "secondary": "#2563EB",
        },
        "rationale": "현재 테마를 유지합니다.",
    }

    response = generate_design_proposal(
        request_for(standard_elements(), selected_palette_option=selected),
        model="test-model",
        api_key=None,
    )
    operations = response.model_dump(by_alias=True, exclude_none=True)["operations"]

    assert any(
        operation["type"] == "add_element"
        and operation["element"].get("props", {}).get("fill") == "#2563EB"
        for operation in operations
    )


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


def test_capability_v2_pipeline_adds_ornaments_before_deletes() -> None:
    response = generate_design_proposal(
        request_for(
            [
                *standard_elements(),
                text_element("el_step_4", "4. 출시", y=850),
            ],
            capability_version="2",
            addable_element_types=[
                "text",
                "rect",
                "ellipse",
                "line",
                "polygon",
                "chart",
                "table",
            ],
        ),
        model="test-model",
        api_key=None,
    )

    operation_types = [operation.type for operation in response.operations]
    ornament_operations = [
        operation
        for operation in response.operations
        if operation.type == "add_element"
        and operation.element.element_id.startswith("el_orn_")
    ]
    assert ornament_operations
    assert {operation.element.type for operation in ornament_operations} <= {
        "ellipse",
        "line",
        "polygon",
    }
    if "delete_element" in operation_types:
        first_delete = operation_types.index("delete_element")
        assert all(
            operation.type != "add_element"
            for operation in response.operations[first_delete:]
        )


def test_capability_v1_pipeline_does_not_emit_v2_shapes() -> None:
    response = generate_design_proposal(
        request_for(standard_elements()),
        model="test-model",
        api_key=None,
    )

    assert all(
        operation.type != "add_element"
        or operation.element.type not in {"ellipse", "line", "polygon"}
        for operation in response.operations
    )


def test_image_slide_is_applicable_without_replacing_source_element() -> None:
    result = redesign_slide(
        request_for(
            [
                text_element("el_title", "제품 출시", role="title", y=100),
                text_element("el_body", "빠른 시작", y=340),
                image_element("el_product"),
            ],
            capability_version="2",
            addable_element_types=[
                "text",
                "rect",
                "ellipse",
                "line",
                "polygon",
                "image",
                "chart",
                "table",
            ],
        ),
        model="test-model",
        api_key=None,
    )

    assert result.outcome == "applicable"
    assert result.response is not None
    image_operations = [
        operation
        for operation in result.response.operations
        if getattr(operation, "element_id", None) == "el_product"
    ]
    assert [operation.type for operation in image_operations] == [
        "update_element_frame",
        "update_element_props",
    ]
    assert all(operation.type != "delete_element" for operation in image_operations)


def test_animated_image_keeps_element_id_and_reference() -> None:
    animation = {
        "animationId": "anim-product",
        "elementId": "el_product",
        "type": "fade-in",
        "order": 1,
    }
    request = request_for(
        [
            text_element("el_title", "제품 출시", role="title", y=100),
            text_element("el_body", "빠른 시작", y=340),
            image_element("el_product"),
        ],
        animations=[animation],
        capability_version="2",
        addable_element_types=[
            "text",
            "rect",
            "ellipse",
            "line",
            "polygon",
            "image",
            "chart",
            "table",
        ],
    )

    result = redesign_slide(request, model="test-model", api_key=None)

    assert result.outcome == "applicable"
    assert result.response is not None
    assert request.context.slide["animations"] == [animation]
    assert any(
        operation.type == "update_element_frame"
        and operation.element_id == animation["elementId"]
        for operation in result.response.operations
    )
    assert all(
        operation.type != "delete_element"
        or operation.element_id != animation["elementId"]
        for operation in result.response.operations
    )

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
