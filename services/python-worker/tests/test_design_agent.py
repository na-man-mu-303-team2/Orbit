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


def test_allows_operations_targeting_legacy_locked_elements() -> None:
    result = generate_design_proposal(
        request_payload(locked=True),
        model="test-model",
        api_key=None,
        client=FakeClient(proposal_payload()),
    )

    assert result.operations[0].element_id == "el_image"


def test_prompt_uses_actual_canvas_dimensions() -> None:
    prompt = design_agent_system_prompt(request_payload().context.canvas)

    assert "1920.0 by 1080.0" in prompt
    assert "horizontal safe margins of 96.0" in prompt
    assert "current page, current slide, or a visible center text" in prompt
    assert "Explicit graph or chart requests take precedence over SmartArt" in prompt
    assert "Explicit table or tabular-format requests also take precedence" in prompt


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


def test_allows_smart_art_to_replace_selected_elements() -> None:
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutType": "process",
        "sourceElementIds": ["el_image"],
        "items": [
            {"title": "기획", "description": None},
            {"title": "개발", "description": None},
        ],
    }

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.smart_art_request is not None
    assert result.smart_art_request.source_element_ids == ["el_image"]


def test_rejects_unselected_smart_art_sources() -> None:
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutType": "list",
        "sourceElementIds": ["el_unselected"],
        "items": [{"title": "기획", "description": None}],
    }

    with pytest.raises(DesignAgentGenerationError, match="unselected elements"):
        generate_design_proposal(
            request_payload(),
            model="test-model",
            api_key=None,
            client=FakeClient(payload),
        )


def test_allows_visible_unselected_smart_art_sources_for_current_page_request() -> None:
    request = request_payload()
    request.question = "현재 페이지 가운데 텍스트를 스마트아트로 꾸며줘"
    request.context.selected_element_ids = []
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutType": "list",
        "sourceElementIds": ["el_image"],
        "items": [{"title": "중심 항목", "description": None}],
    }

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.smart_art_request is not None
    assert result.smart_art_request.source_element_ids == ["el_image"]


def test_allows_deleted_elements_in_affected_ids() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "delete_element",
            "slideId": "slide_1",
            "elementId": "el_image",
        }
    ]
    payload["affectedElementIds"] = ["el_image"]

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.affected_element_ids == ["el_image"]


def test_accepts_ppt_derived_smart_art_layout_types() -> None:
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutType": "timeline",
        "sourceElementIds": [],
        "items": [
            {"title": f"Step {index + 1}", "description": None}
            for index in range(4)
        ],
    }

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.smart_art_request is not None
    assert result.smart_art_request.layout_type == "timeline"


def test_allows_adding_a_line_chart_for_numeric_trend() -> None:
    payload = proposal_payload()
    payload["operations"] = [{
        "type": "add_element",
        "slideId": "slide_1",
        "element": {
            "elementId": "el_revenue_chart",
            "type": "chart",
            "role": "chart",
            "x": 180,
            "y": 160,
            "width": 1560,
            "height": 760,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 10,
            "locked": False,
            "visible": True,
            "props": {
                "type": "line",
                "title": "매출 추이",
                "data": [
                    {"label": "1기", "value": 42330},
                    {"label": "2기", "value": 67112},
                    {"label": "3기", "value": 90476},
                ],
                "style": {
                    "colors": ["#2563EB"],
                    "backgroundColor": "#FFFFFF",
                    "textColor": "#111827",
                    "fontFamily": None,
                    "titleFontSize": 28,
                    "axisLabelFontSize": 16,
                    "legendFontSize": 14,
                    "dataLabelFontSize": 16,
                    "showLegend": False,
                    "legendPosition": "bottom",
                    "showDataLabels": True,
                    "showGrid": True,
                    "xAxisTitle": "",
                    "yAxisTitle": "매출",
                    "unit": "천원",
                },
            },
        },
    }]
    payload["affectedElementIds"] = ["el_revenue_chart"]

    result = generate_design_proposal(
        request_payload(), model="test-model", api_key=None, client=FakeClient(payload)
    )

    assert result.operations[0].element.type == "chart"
    assert result.operations[0].element.props.type == "line"


def test_allows_adding_a_table_instead_of_smart_art() -> None:
    def cell(text: str, *, header: bool = False) -> dict[str, Any]:
        return {
            "text": text,
            "fill": "#EFF6FF" if header else "#FFFFFF",
            "textColor": "#111827",
            "fontFamily": None,
            "fontSize": 18,
            "fontWeight": "bold" if header else "normal",
            "align": "center",
            "verticalAlign": "middle",
            "borderColor": "#CBD5E1",
            "borderWidth": 1,
            "colSpan": 1,
            "rowSpan": 1,
        }

    payload = proposal_payload()
    payload["operations"] = [{
        "type": "add_element",
        "slideId": "slide_1",
        "element": {
            "elementId": "el_revenue_table",
            "type": "table",
            "role": "table",
            "x": 260,
            "y": 220,
            "width": 1400,
            "height": 600,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 10,
            "locked": False,
            "visible": True,
            "props": {
                "rows": [
                    [cell("구분", header=True), cell("매출(천원)", header=True)],
                    [cell("1기"), cell("42,330")],
                    [cell("2기"), cell("67,112")],
                    [cell("3기"), cell("90,476")],
                ],
                "columnWidths": [700, 700],
                "rowHeights": [120, 160, 160, 160],
                "borderColor": "#CBD5E1",
                "borderWidth": 1,
            },
        },
    }]
    payload["affectedElementIds"] = ["el_revenue_table"]
    payload["smartArtRequest"] = None

    result = generate_design_proposal(
        request_payload(), model="test-model", api_key=None, client=FakeClient(payload)
    )

    assert result.smart_art_request is None
    assert result.operations[0].element.type == "table"
    assert len(result.operations[0].element.props.rows) == 4


def test_allows_adding_a_rounded_card_and_text() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "add_element",
            "slideId": "slide_1",
            "element": {
                "elementId": "el_card_1",
                "type": "rect",
                "role": "decoration",
                "x": 100,
                "y": 600,
                "width": 500,
                "height": 240,
                "rotation": 0,
                "opacity": 1,
                "zIndex": 10,
                "locked": False,
                "visible": True,
                "props": {
                    "fill": "#FFFFFF",
                    "stroke": "#D0D5DD",
                    "strokeWidth": 1,
                    "borderRadius": 24,
                },
            },
        },
        {
            "type": "add_element",
            "slideId": "slide_1",
            "element": {
                "elementId": "el_card_text_1",
                "type": "text",
                "role": "body",
                "x": 140,
                "y": 640,
                "width": 420,
                "height": 160,
                "rotation": 0,
                "opacity": 1,
                "zIndex": 11,
                "locked": False,
                "visible": True,
                "props": {
                    "text": "핵심 내용을 간결하게 설명합니다.",
                    "fontFamily": None,
                    "fontSize": 28,
                    "fontWeight": 600,
                    "color": "#101828",
                    "align": "left",
                    "verticalAlign": "middle",
                    "lineHeight": 1.3,
                },
            },
        },
    ]
    payload["affectedElementIds"] = ["el_card_1", "el_card_text_1"]

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert [operation.type for operation in result.operations] == [
        "add_element",
        "add_element",
    ]
