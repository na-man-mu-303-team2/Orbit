from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.ai.design_agent import (
    DESIGN_AGENT_RESPONSE_FORMAT,
    DesignAgentGenerationError,
    DesignAgentRequest,
    DesignAgentResponse,
    _build_deterministic_preset_proposal,
    design_agent_system_prompt,
    generate_design_proposal,
)
from app.ai.motion_planner import (
    MotionImportContext,
    MotionPlannerError,
    MotionPlanningContext,
    extract_motion_units,
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
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.payloads = payloads
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payloads.pop(0)))


class SequenceClient:
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.responses = SequenceResponses(payloads)


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
            "availableSmartArtLayouts": [
                {
                    "layoutId": f"smart_art_{layout_type}_{item_count}",
                    "layoutType": layout_type,
                    "name": f"{layout_type} {item_count}",
                    "itemCountMin": item_count,
                    "itemCountMax": item_count,
                }
                for layout_type, item_counts in {
                    "list": (3,),
                    "process": (2, 3, 4, 5),
                    "card_grid": (3, 4),
                    "comparison": (2,),
                    "classification_grid": (4,),
                    "timeline": (4,),
                    "metric_cards": (3,),
                }.items()
                for item_count in item_counts
            ],
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
                "frame": {
                    "role": None,
                    "x": x,
                    "y": None,
                    "width": None,
                    "height": None,
                    "rotation": None,
                    "opacity": None,
                    "zIndex": None,
                    "visible": None,
                    "locked": None,
                },
            }
        ],
        "affectedElementIds": ["el_image"],
        "warnings": [],
    }


def authored_motion_plan(
    request: DesignAgentRequest,
    *,
    pacing: str = "balanced",
    trigger: str = "entry",
    motion_intent: str = "focus",
) -> dict[str, Any]:
    assert request.motion_planning_context is not None
    extraction = extract_motion_units(
        request.context.slide,
        request.motion_planning_context,
    )
    assert len(extraction.context.units) == 1
    return {
        "schemaVersion": 3,
        "pacing": pacing,
        "beats": [
            {
                "beatId": "beat_focus",
                "purpose": "emphasize",
                "trigger": trigger,
                "relation": "together",
                "targets": [
                    {
                        "unitId": extraction.context.units[0].unit_id,
                        "motionIntent": motion_intent,
                    }
                ],
            }
        ],
    }


def add_element_proposal(
    *, element_type: str, role: str, font_weight: str | int = 600
) -> dict[str, Any]:
    payload = proposal_payload()
    props: dict[str, Any]
    if element_type == "text":
        props = {
            "text": "강조 문구",
            "fontFamily": None,
            "fontSize": 32,
            "fontWeight": font_weight,
            "color": "#111827",
            "align": "left",
            "verticalAlign": "middle",
            "lineHeight": 1.2,
        }
    elif element_type == "image":
        props = {
            "src": "https://example.com/image.png",
            "alt": "제품 이미지",
            "fit": "cover",
            "focusX": 0.5,
            "focusY": 0.5,
        }
    else:
        props = {
            "fill": "#E5E7EB",
            "stroke": "#CBD5E1",
            "strokeWidth": 1,
            "borderRadius": 16,
        }
        if element_type == "polygon":
            props["sides"] = 5
    payload["operations"] = [
        {
            "type": "add_element",
            "slideId": "slide_1",
            "element": {
                "elementId": f"el_{element_type}_alignment",
                "type": element_type,
                "role": role,
                "x": 120,
                "y": 160,
                "width": 720,
                "height": 240,
                "rotation": 0,
                "opacity": 1,
                "zIndex": 3,
                "locked": False,
                "visible": True,
                "props": props,
            },
        }
    ]
    payload["affectedElementIds"] = [f"el_{element_type}_alignment"]
    return payload


def test_accepts_highlight_text_role() -> None:
    result = DesignAgentResponse.model_validate(
        add_element_proposal(element_type="text", role="highlight")
    )

    assert result.operations[0].element.role == "highlight"


def test_accepts_media_rect_role() -> None:
    result = DesignAgentResponse.model_validate(
        add_element_proposal(element_type="rect", role="media")
    )

    assert result.operations[0].element.role == "media"


@pytest.mark.parametrize("field", ["fill", "stroke"])
def test_rejects_shape_paint_outside_shared_deck_contract(field: str) -> None:
    payload = add_element_proposal(element_type="rect", role="media")
    payload["operations"][0]["element"]["props"][field] = "rgba(15, 23, 42, 0.5)"

    with pytest.raises(ValidationError):
        DesignAgentResponse.model_validate(payload)


def test_accepts_capability_v2_image_element() -> None:
    result = DesignAgentResponse.model_validate(
        add_element_proposal(element_type="image", role="media")
    )

    operation = result.operations[0]
    assert operation.type == "add_element"
    assert operation.element.type == "image"
    assert operation.element.props.fit == "cover"


@pytest.mark.parametrize("element_type", ["ellipse", "line", "polygon"])
def test_accepts_capability_v2_shape_elements(element_type: str) -> None:
    result = DesignAgentResponse.model_validate(
        add_element_proposal(element_type=element_type, role="decoration")
    )

    operation = result.operations[0]
    assert operation.type == "add_element"
    assert operation.element.type == element_type


@pytest.mark.parametrize("font_weight", ["semibold", 600])
def test_accepts_shared_font_weights(font_weight: str | int) -> None:
    result = DesignAgentResponse.model_validate(
        add_element_proposal(
            element_type="text", role="highlight", font_weight=font_weight
        )
    )

    assert result.operations[0].element.props.font_weight == font_weight


def test_rejects_out_of_range_add_element_font_weight() -> None:
    with pytest.raises(ValidationError, match="fontWeight must be between"):
        DesignAgentResponse.model_validate(
            add_element_proposal(
                element_type="text", role="highlight", font_weight=950
            )
        )


def test_accepts_string_update_element_font_weight() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "update_element_props",
            "slideId": "slide_1",
            "elementId": "el_image",
            "props": {"fontWeight": "bold"},
        }
    ]

    result = DesignAgentResponse.model_validate(payload)

    assert result.operations[0].props.font_weight == "bold"


def test_rejects_out_of_range_update_element_font_weight() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "update_element_props",
            "slideId": "slide_1",
            "elementId": "el_image",
            "props": {"fontWeight": 950},
        }
    ]

    with pytest.raises(ValidationError, match="fontWeight must be between"):
        DesignAgentResponse.model_validate(payload)


def test_element_json_schema_exposes_aligned_roles_and_font_weights() -> None:
    schema_text = json.dumps(DESIGN_AGENT_RESPONSE_FORMAT, ensure_ascii=False)

    assert "highlight" in schema_text
    assert "media" in schema_text
    assert "semibold" in schema_text


def test_element_json_schema_restricts_shape_paint_to_shared_color_format() -> None:
    schema_text = json.dumps(DESIGN_AGENT_RESPONSE_FORMAT, ensure_ascii=False)

    assert r"^(?:#[0-9a-fA-F]{6}|transparent)$" in schema_text


def test_accepts_background_image_and_layout_slide_style_patch() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "update_slide_style",
            "slideId": "slide_1",
            "style": {
                "layout": "image-right",
                "backgroundImage": {
                    "src": "https://assets.example/background.png",
                    "alt": "추상적인 배경",
                    "fit": "cover",
                    "opacity": 0.7,
                },
            },
        }
    ]

    result = DesignAgentResponse.model_validate(payload)
    style = result.operations[0].style

    assert style.layout == "image-right"
    assert style.background_image is not None
    assert style.background_image.src.endswith("background.png")


def test_slide_style_json_schema_exposes_layout_and_background_image() -> None:
    schema_text = json.dumps(DESIGN_AGENT_RESPONSE_FORMAT, ensure_ascii=False)

    assert "backgroundImage" in schema_text
    assert "image-right" in schema_text


@pytest.mark.parametrize("element_type", ["ellipse", "line", "polygon"])
def test_design_agent_json_schema_exposes_capability_v2_shapes(
    element_type: str,
) -> None:
    schema_text = json.dumps(DESIGN_AGENT_RESPONSE_FORMAT, ensure_ascii=False)

    assert f'"const": "{element_type}"' in schema_text


def test_design_agent_json_schema_exposes_capability_v2_image() -> None:
    schema_text = json.dumps(DESIGN_AGENT_RESPONSE_FORMAT, ensure_ascii=False)

    assert '"const": "image"' in schema_text


def test_design_agent_capability_version_one_request_remains_supported() -> None:
    capabilities = request_payload().capabilities

    assert capabilities.version == "1"
    assert capabilities.addable_element_types == ["text", "rect", "chart", "table"]


@pytest.mark.parametrize("version", ["1", "2"])
def test_design_agent_capability_reads_and_writes_supported_versions(
    version: str,
) -> None:
    payload = request_payload().model_dump(by_alias=True)
    payload["capabilities"]["version"] = version

    request = DesignAgentRequest.model_validate(payload)

    assert request.capabilities.version == version
    assert request.model_dump(by_alias=True)["capabilities"]["version"] == version


def test_design_agent_capability_rejects_unknown_version() -> None:
    payload = request_payload().model_dump(by_alias=True)
    payload["capabilities"]["version"] = "3"

    with pytest.raises(ValidationError):
        DesignAgentRequest.model_validate(payload)


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


@pytest.mark.parametrize(
    "intent_preset",
    [
        "tidy-layout",
        "emphasize-message",
    ],
)
def test_routes_known_intent_preset_separately_from_visible_question(
    intent_preset: str,
) -> None:
    request = request_payload()
    request.intent_preset = intent_preset
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    prompt = json.loads(client.responses.calls[0]["input"])
    assert result.operations
    assert prompt["question"] == "이미지를 오른쪽으로 옮겨줘"
    assert prompt["intentPreset"] == intent_preset
    assert intent_preset in client.responses.calls[0]["instructions"]


def test_refuses_whole_slide_chart_redesign_before_provider_call() -> None:
    request = request_payload()
    request.question = "이 슬라이드를 예쁘게 해줘"
    request.intent_preset = "redesign-slide"
    request.context.selected_element_ids = []
    request.context.slide["elements"] = [
        {
            "elementId": "el_chart",
            "type": "chart",
            "visible": True,
            "locked": False,
        }
    ]
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert result.operations == []
    assert result.interpreted_intent.action == "refused"
    assert client.responses.calls == []


def test_allows_local_chart_edit_through_existing_provider_path() -> None:
    request = request_payload()
    request.question = "차트 제목 색만 바꿔줘"
    request.intent_preset = None
    request.context.selected_element_ids = ["el_chart"]
    request.context.slide["elements"] = [
        {
            "elementId": "el_chart",
            "type": "chart",
            "visible": True,
            "locked": False,
        }
    ]
    payload = proposal_payload()
    payload["message"] = "차트 제목 색상 변경안을 준비했습니다."
    payload["interpretedIntent"] = {
        "target": "selected-elements",
        "action": "차트 제목 색상 변경",
        "alignment": None,
    }
    payload["operations"] = [
        {
            "type": "update_element_props",
            "slideId": "slide_1",
            "elementId": "el_chart",
            "props": {"color": "#2563EB"},
        }
    ]
    payload["affectedElementIds"] = ["el_chart"]
    client = FakeClient(payload)

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert result.operations[0].type == "update_element_props"
    assert client.responses.calls


def test_recommends_export_compatible_animation_timeline_without_llm() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.context.selected_element_ids = []
    request.capabilities.operations.append("add_animation")
    request.context.slide["elements"] = [
        {
            "elementId": "el_title",
            "type": "text",
            "role": "title",
            "x": 120,
            "y": 60,
            "width": 1200,
            "height": 100,
            "visible": True,
        },
        {
            "elementId": "el_body_1",
            "type": "text",
            "role": "body",
            "x": 160,
            "y": 240,
            "width": 600,
            "height": 160,
            "visible": True,
        },
        {
            "elementId": "el_body_2",
            "type": "text",
            "role": "body",
            "x": 160,
            "y": 440,
            "width": 600,
            "height": 160,
            "visible": True,
        },
        {
            "elementId": "el_image",
            "type": "image",
            "role": "media",
            "x": 920,
            "y": 700,
            "width": 720,
            "height": 300,
            "visible": True,
        },
        {
            "elementId": "el_group",
            "type": "group",
            "role": "body",
            "x": 120,
            "y": 200,
            "width": 680,
            "height": 440,
            "visible": True,
            "props": {"childElementIds": ["el_body_1", "el_body_2"]},
        },
        {
            "elementId": "el_footer",
            "type": "text",
            "role": "footer",
            "x": 120,
            "y": 1000,
            "width": 600,
            "height": 40,
            "visible": True,
        },
    ]
    request.context.slide["animations"] = []
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert client.responses.calls == []
    assert [operation.animation.start_mode for operation in result.operations] == [
        "on-slide-enter",
        "on-click",
        "with-previous",
        "after-previous",
    ]
    assert {operation.animation.type for operation in result.operations} <= {
        "appear",
        "fade-in",
        "zoom-in",
    }
    assert [operation.animation.type for operation in result.operations] == [
        "fade-in",
        "appear",
        "appear",
        "zoom-in",
    ]
    assert [operation.animation.order for operation in result.operations] == [1, 2, 3, 4]
    assert all(operation.animation.duration_ms == 500 for operation in result.operations)
    assert result.affected_element_ids == [
        "el_title",
        "el_body_1",
        "el_body_2",
        "el_image",
    ]


@pytest.mark.parametrize(
    ("slide_patch", "expected_message"),
    [
        (
            {
                "ooxmlOrigin": "imported",
                "importRenderMode": "editable",
            },
            "위치 정보",
        ),
        (
            {
                "ooxmlOrigin": "imported",
                "importRenderMode": "editable",
                "ooxmlSourceSlidePart": "ppt/slides/slide1.xml",
                "ooxmlMotionCapabilities": {
                    "importedMainSequenceCoverage": "partial",
                },
            },
            "완전하게 보존",
        ),
    ],
)
def test_animation_recommendation_fails_closed_for_unsafe_imported_slide(
    slide_patch: dict[str, Any],
    expected_message: str,
) -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.context.slide.update(slide_patch)
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert client.responses.calls == []
    assert result.operations == []
    assert expected_message in result.message


def test_animation_recommendation_allows_safe_imported_slide() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.context.slide.update({
        "ooxmlOrigin": "imported",
        "importRenderMode": "editable",
        "ooxmlSourceSlidePart": "ppt/slides/slide1.xml",
        "ooxmlMotionCapabilities": {
            "importedMainSequenceCoverage": "complete",
        },
    })
    request.motion_import_context = MotionImportContext.model_validate({
        "renderMode": "editable",
        "sourceSlidePartPresent": True,
        "importedMainSequenceCoverage": "complete",
        "stableTargetElementIds": ["el_image"],
    })

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(proposal_payload()),
    )

    assert len(result.operations) == 1
    assert result.operations[0].animation.type == "zoom-in"
    assert result.operations[0].animation.start_mode == "on-click"


def test_animation_recommendation_runs_semantic_planner_in_shadow_only() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "MOTION_TRANSIENT_NOTE",
        "notesPresent": True,
        "notesTruncated": False,
    })
    client = FakeClient(authored_motion_plan(request))

    result = generate_design_proposal(
        request,
        model="design-model",
        motion_planner_model="motion-snapshot",
        motion_planner_mode="shadow",
        api_key=None,
        client=client,
    )

    assert len(client.responses.calls) == 1
    assert client.responses.calls[0]["model"] == "motion-snapshot"
    assert "MOTION_TRANSIENT_NOTE" in client.responses.calls[0]["input"]
    assert len(result.operations) == 1
    assert result.operations[0].animation.type == "zoom-in"


def test_animation_recommendation_compiles_semantic_plan_in_on_mode() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "",
        "notesPresent": False,
        "notesTruncated": False,
    })
    plan = authored_motion_plan(request)

    first = generate_design_proposal(
        request,
        model="design-model",
        motion_planner_model="motion-snapshot",
        motion_planner_mode="on",
        api_key=None,
        client=FakeClient(plan),
    )
    second = generate_design_proposal(
        request,
        model="design-model",
        motion_planner_model="motion-snapshot",
        motion_planner_mode="on",
        api_key=None,
        client=FakeClient(plan),
    )

    assert first.model_dump(by_alias=True) == second.model_dump(by_alias=True)
    assert [operation.type for operation in first.operations] == ["add_animation"]
    animation = first.operations[0].animation
    assert animation.type == "fade-in"
    assert animation.duration_ms == 400
    assert animation.start_mode == "on-slide-enter"
    assert animation.animation_id.startswith("anim_motion_")
    assert first.motion_plan is not None
    assert first.motion_plan.source == "llm"
    assert first.motion_plan.model == "motion-snapshot"
    assert first.motion_plan.attempt_count == 1
    assert first.motion_plan.compiler_version == "motion-compiler-v3"


def test_animation_recommendation_allows_safe_existing_animation_update() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.extend(["add_animation", "update_animation"])
    request.context.slide["animations"] = [
        {
            "animationId": "anim_existing",
            "elementId": "el_image",
            "type": "fade-in",
            "order": 1,
            "startMode": "on-slide-enter",
            "durationMs": 300,
            "delayMs": 0,
            "easing": "ease-out",
        }
    ]
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "",
        "notesPresent": False,
        "notesTruncated": False,
    })
    result = generate_design_proposal(
        request,
        model="design-model",
        motion_planner_model="motion-snapshot",
        motion_planner_mode="on",
        api_key=None,
        client=FakeClient(
            authored_motion_plan(request, motion_intent="introduce")
        ),
    )

    assert len(result.operations) == 1
    update = result.operations[0]
    assert update.type == "update_animation"
    assert update.animation_id == "anim_existing"
    assert update.animation.type == "fade-in"
    assert update.animation.duration_ms == 400


def test_animation_recommendation_fails_closed_without_ai_provider() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "",
        "notesPresent": False,
        "notesTruncated": False,
    })

    with pytest.raises(MotionPlannerError) as error:
        generate_design_proposal(
            request,
            model="design-model",
            motion_planner_model="motion-snapshot",
            motion_planner_mode="on",
            api_key=None,
        )

    assert error.value.code == "MOTION_AI_PROVIDER_UNAVAILABLE"


def test_animation_recommendation_persists_second_attempt_provenance() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.append("add_animation")
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "",
        "notesPresent": False,
        "notesTruncated": False,
    })
    valid = authored_motion_plan(
        request,
        pacing="brisk",
        trigger="click",
    )
    invalid = {**valid, "schemaVersion": 1}
    client = SequenceClient([invalid, valid])

    result = generate_design_proposal(
        request,
        model="design-model",
        motion_planner_model="motion-snapshot",
        motion_planner_mode="on",
        api_key=None,
        client=client,
    )

    assert len(client.responses.calls) == 2
    assert result.motion_plan is not None
    assert result.motion_plan.attempt_count == 2
    assert result.motion_plan.plan.pacing == "brisk"


def test_animation_recommendation_retries_compile_then_fails_closed() -> None:
    request = request_payload()
    request.intent_preset = "recommend-animation"
    request.capabilities.operations.extend(["add_animation", "update_animation"])
    request.motion_planning_context = MotionPlanningContext.model_validate({
        "allowedTargetElementIds": ["el_image"],
        "effectiveTypography": [],
        "speakerNotes": "",
        "notesPresent": False,
        "notesTruncated": False,
    })
    request.context.slide["animations"] = [
        {
            "animationId": f"anim_existing_{index}",
            "elementId": "el_image",
            "type": "fade-in",
            "order": index,
            "startMode": "on-click",
            "durationMs": 300,
            "delayMs": 0,
            "easing": "ease-out",
        }
        for index in (1, 2)
    ]
    valid = authored_motion_plan(request, trigger="click")
    client = SequenceClient([valid, valid])

    with pytest.raises(MotionPlannerError) as error:
        generate_design_proposal(
            request,
            model="design-model",
            motion_planner_model="motion-snapshot",
            motion_planner_mode="on",
            api_key=None,
            client=client,
        )

    assert len(client.responses.calls) == 2
    assert error.value.code == "MOTION_AI_COMPILE_UNSAFE"
    assert error.value.status_code == 422


def test_unknown_intent_preset_falls_back_to_question_interpretation() -> None:
    request = request_payload()
    request.intent_preset = "future-layout-mode"
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=client,
    )

    prompt = json.loads(client.responses.calls[0]["input"])
    assert result.operations
    assert prompt["question"] == request.question
    assert prompt["intentPreset"] is None
    assert "No recognized routing hint" in client.responses.calls[0]["instructions"]


def test_tidy_layout_rejects_text_content_mutation() -> None:
    request = request_payload()
    request.intent_preset = "tidy-layout"
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "update_element_props",
            "slideId": "slide_1",
            "elementId": "el_image",
            "props": {"text": "새로운 사실"},
        }
    ]

    with pytest.raises(DesignAgentGenerationError, match="preserve existing text"):
        generate_design_proposal(
            request,
            model="test-model",
            api_key=None,
            client=FakeClient(payload),
        )


@pytest.mark.parametrize("x", [-1, 1500])
def test_rejects_frame_update_result_outside_canvas(x: float) -> None:
    with pytest.raises(DesignAgentGenerationError, match="outside the canvas"):
        generate_design_proposal(
            request_payload(),
            model="test-model",
            api_key=None,
            client=FakeClient(proposal_payload(x=x)),
        )


def test_allows_off_canvas_element_as_frame_update_target() -> None:
    request = request_payload()
    request.context.slide["elements"][0]["x"] = -240

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(proposal_payload(x=80)),
    )

    assert result.operations[0].frame.x == 80


def test_allows_non_geometry_update_for_off_canvas_element() -> None:
    request = request_payload()
    request.context.slide["elements"][0]["x"] = -240
    payload = proposal_payload()
    payload["operations"][0]["frame"] = {"opacity": 0.5}

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.operations[0].frame.opacity == 0.5


def test_validates_off_canvas_target_after_all_frame_updates() -> None:
    request = request_payload()
    request.context.slide["elements"][0]["x"] = -240
    payload = proposal_payload(x=80)
    payload["operations"] = [
        {
            "type": "update_element_frame",
            "slideId": "slide_1",
            "elementId": "el_image",
            "frame": {"y": 220},
        },
        payload["operations"][0],
    ]

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert len(result.operations) == 2


def test_rejects_frame_coordinates_outside_supported_range() -> None:
    with pytest.raises(DesignAgentGenerationError, match="generation failed"):
        generate_design_proposal(
            request_payload(),
            model="test-model",
            api_key=None,
            client=FakeClient(proposal_payload(x=1_000_001)),
        )


def test_fits_added_elements_inside_canvas() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "add_element",
            "slideId": "slide_1",
            "element": {
                "elementId": "el_explanation",
                "type": "rect",
                "role": "decoration",
                "x": 1850,
                "y": 1000,
                "width": 400,
                "height": 200,
                "rotation": 0,
                "opacity": 1,
                "zIndex": 2,
                "locked": False,
                "visible": True,
                "props": {
                    "fill": "#FFFFFF",
                    "stroke": "#CBD5E1",
                    "strokeWidth": 1,
                    "borderRadius": 12,
                },
            },
        }
    ]
    payload["affectedElementIds"] = ["el_explanation"]

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    operation = result.operations[0]
    assert operation.type == "add_element"
    assert operation.element.x == 1520
    assert operation.element.y == 880
    assert result.warnings == [
        "Added element frame was adjusted to fit inside the slide canvas."
    ]


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
    assert "Only use fade-in and fade-out effects" in prompt
    assert "open-speaker-notes-assistant" in prompt


def test_accepts_speaker_notes_assistant_ui_action() -> None:
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["uiAction"] = {
        "type": "open-speaker-notes-assistant",
        "mode": "naturalize",
    }

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.ui_action is not None
    assert result.ui_action.mode == "naturalize"


def test_allows_adding_fade_animation_to_visible_element() -> None:
    request = request_payload()
    request.capabilities.operations.append("add_animation")
    payload = proposal_payload()
    payload["interpretedIntent"]["target"] = "current-slide"
    payload["operations"] = [{
        "type": "add_animation",
        "slideId": "slide_1",
        "animation": {
            "animationId": "anim_ai_fade_in_1",
            "elementId": "el_image",
            "type": "fade-in",
            "order": 1,
            "durationMs": 600,
            "delayMs": 0,
            "easing": "ease-out",
        },
    }]

    result = generate_design_proposal(
        request, model="test-model", api_key=None, client=FakeClient(payload)
    )

    assert result.operations[0].type == "add_animation"
    assert result.operations[0].animation.type == "fade-in"


def test_rejects_animation_for_unknown_element() -> None:
    request = request_payload()
    request.capabilities.operations.append("add_animation")
    payload = proposal_payload()
    payload["operations"] = [{
        "type": "add_animation",
        "slideId": "slide_1",
        "animation": {
            "animationId": "anim_ai_fade_in_1",
            "elementId": "el_missing",
            "type": "fade-in",
            "order": 1,
            "durationMs": 600,
            "delayMs": 0,
            "easing": "ease-out",
        },
    }]

    with pytest.raises(DesignAgentGenerationError, match="elementId does not exist"):
        generate_design_proposal(
            request, model="test-model", api_key=None, client=FakeClient(payload)
        )


def test_resolves_unselected_center_table_for_fade_in_without_llm() -> None:
    request = request_payload()
    request.question = "가운데 표를 페이드인 애니메이션 적용해줘"
    request.context.selected_element_ids = []
    request.context.slide["elements"] = [{
        "elementId": "el_center_table",
        "type": "table",
        "role": "table",
        "x": 460,
        "y": 260,
        "width": 1000,
        "height": 560,
        "visible": True,
    }]
    request.context.slide["animations"] = []
    request.capabilities.operations.extend(
        ["add_animation", "update_animation", "delete_animation"]
    )
    client = FakeClient(proposal_payload())

    result = generate_design_proposal(
        request, model="test-model", api_key=None, client=client
    )

    assert client.responses.calls == []
    assert result.operations[0].type == "add_animation"
    assert result.operations[0].animation.element_id == "el_center_table"
    assert result.operations[0].animation.type == "fade-in"


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
        "layoutId": "smart_art_process_2",
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


def test_normalizes_smart_art_source_operations_and_unknown_affected_ids() -> None:
    payload = proposal_payload()
    payload["operations"] = [
        {
            "type": "update_element_frame",
            "slideId": "slide_1",
            "elementId": "el_image",
            "frame": {"x": 420},
        },
        {
            "type": "delete_element",
            "slideId": "slide_1",
            "elementId": "el_image",
        },
    ]
    payload["affectedElementIds"] = ["el_image", "el_smartart_future_group"]
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_process_2",
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

    assert result.operations == []
    assert result.affected_element_ids == ["el_image"]
    assert result.smart_art_request is not None


def test_routes_broad_beautify_request_to_metric_card_preset_without_llm() -> None:
    request = request_payload()
    request.question = "현재 페이지를 보기 좋게 꾸며줘"
    request.context.selected_element_ids = []
    request.context.slide["elements"] = [
        {
            "elementId": "el_years",
            "type": "text",
            "role": "body",
            "visible": True,
            "props": {"text": "2024\n2025\n2026"},
        },
        {
            "elementId": "el_people",
            "type": "text",
            "role": "body",
            "visible": True,
            "props": {"text": "100명\n300명\n1000명"},
        },
    ]
    client = FakeClient(proposal_payload())

    result = _build_deterministic_preset_proposal(request)
    assert result is not None

    assert client.responses.calls == []
    assert result.smart_art_request is not None
    assert result.smart_art_request.layout_type == "metric_cards"
    assert [item.title for item in result.smart_art_request.items] == ["2024", "2025", "2026"]
    assert [item.description for item in result.smart_art_request.items] == [
        "100명", "300명", "1000명"
    ]
    assert result.smart_art_request.source_element_ids == ["el_years", "el_people"]


def test_keeps_explicit_small_edit_out_of_preset_routing() -> None:
    request = request_payload()
    request.question = "글자 색상만 파란색으로 바꿔서 꾸며줘"
    client = FakeClient(proposal_payload())

    generate_design_proposal(request, model="test-model", api_key=None, client=client)

    assert len(client.responses.calls) == 1


def test_routes_reconfigure_wording_to_whole_slide_preset() -> None:
    request = request_payload()
    request.question = "현재 디자인 재구성좀 해줘"
    request.context.selected_element_ids = []
    request.context.slide["elements"] = [
        {
            "elementId": "el_years",
            "type": "text",
            "role": "body",
            "visible": True,
            "props": {"text": "2024\n2025\n2026"},
        },
        {
            "elementId": "el_values",
            "type": "text",
            "role": "body",
            "visible": True,
            "props": {"text": "100명\n300명\n1000명"},
        },
    ]
    client = FakeClient(proposal_payload())

    result = _build_deterministic_preset_proposal(request)
    assert result is not None

    assert client.responses.calls == []
    assert result.smart_art_request is not None
    assert result.smart_art_request.source_element_ids == ["el_years", "el_values"]


def test_replaces_existing_smart_art_with_a_different_preset() -> None:
    request = request_payload()
    request.question = "좀 다른 디자인 없어?"
    request.context.selected_element_ids = []
    request.context.slide["elements"] = [
        {
            "elementId": "el_smartart_old_oval_0",
            "type": "customShape",
            "visible": True,
            "zIndex": 100,
            "props": {},
        },
        *[
            {
                "elementId": f"el_smartart_old_title_{index}",
                "type": "text",
                "visible": True,
                "zIndex": 102 + index * 10,
                "props": {"text": year},
            }
            for index, year in enumerate(("2024", "2025", "2026"))
        ],
        *[
            {
                "elementId": f"el_smartart_old_desc_{index}",
                "type": "text",
                "visible": True,
                "zIndex": 103 + index * 10,
                "props": {"text": value},
            }
            for index, value in enumerate(("100명", "300명", "1000명"))
        ],
        {
            "elementId": "el_smartart_old_group",
            "type": "group",
            "visible": True,
            "zIndex": 200,
            "props": {"childElementIds": []},
        },
    ]
    client = FakeClient(proposal_payload())

    result = _build_deterministic_preset_proposal(request)
    assert result is not None

    assert client.responses.calls == []
    assert result.smart_art_request is not None
    assert result.smart_art_request.layout_type == "metric_cards"
    assert set(result.smart_art_request.source_element_ids) == {
        str(element["elementId"]) for element in request.context.slide["elements"]
    }
    assert [item.description for item in result.smart_art_request.items] == [
        "100명", "300명", "1000명"
    ]


def test_alternative_design_recovers_individual_year_value_elements() -> None:
    request = request_payload()
    request.question = "another design"
    request.context.selected_element_ids = []
    years = ("2023", "2024", "2025", "2026")
    values = ("100명", "300명", "1000명")
    request.context.slide["elements"] = [
        *[
            {
                "elementId": f"el_oval_{index}",
                "type": "ellipse",
                "visible": True,
                "x": index * 200,
                "y": 100,
                "props": {},
            }
            for index in range(4)
        ],
        *[
            {
                "elementId": f"el_year_{index}",
                "type": "text",
                "role": "body",
                "visible": True,
                "x": index * 200,
                "y": 120,
                "props": {"text": year},
            }
            for index, year in enumerate(years)
        ],
        *[
            {
                "elementId": f"el_value_{index}",
                "type": "text",
                "role": "body",
                "visible": True,
                "x": index * 200,
                "y": 260,
                "props": {"text": value},
            }
            for index, value in enumerate(values)
        ],
    ]
    client = FakeClient(proposal_payload())

    result = _build_deterministic_preset_proposal(request)
    assert result is not None

    assert client.responses.calls == []
    assert result.smart_art_request is not None
    assert result.smart_art_request.layout_type == "timeline"
    assert [item.title for item in result.smart_art_request.items] == list(years)
    assert [item.description for item in result.smart_art_request.items] == [
        *values,
        None,
    ]
    assert set(result.smart_art_request.source_element_ids) == {
        str(element["elementId"]) for element in request.context.slide["elements"]
    }


def test_rejects_unselected_smart_art_sources() -> None:
    request = request_payload()
    request.context.selected_element_ids = []
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_list_3",
        "layoutType": "list",
        "sourceElementIds": ["el_image"],
        "items": [{"title": "기획", "description": None}],
    }

    with pytest.raises(DesignAgentGenerationError, match="unselected elements"):
        generate_design_proposal(
            request,
            model="test-model",
            api_key=None,
            client=FakeClient(payload),
        )


def test_rejects_unknown_smart_art_sources() -> None:
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_list_3",
        "layoutType": "list",
        "sourceElementIds": ["el_unknown"],
        "items": [{"title": "기획", "description": None}],
    }

    with pytest.raises(DesignAgentGenerationError, match="unknown elements"):
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
    payload["interpretedIntent"]["target"] = "current-slide"
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_list_3",
        "layoutType": "list",
        "sourceElementIds": ["el_image"],
        "items": [
            {"title": f"항목 {index + 1}", "description": None}
            for index in range(3)
        ],
    }

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.smart_art_request is not None
    assert result.smart_art_request.source_element_ids == ["el_image"]


def test_normalizes_sequence_diagram_sources_to_current_slide_without_selection() -> None:
    request = request_payload()
    request.question = "1, 2, 3, 4번을 순차 다이어그램 형태로 바꿔줘."
    request.context.selected_element_ids = []
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_process_4",
        "layoutType": "process",
        "sourceElementIds": ["el_image"],
        "items": [
            {"title": f"단계 {index + 1}", "description": None}
            for index in range(4)
        ],
    }

    result = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.interpreted_intent.target == "current-slide"
    assert result.smart_art_request is not None
    assert result.smart_art_request.source_element_ids == ["el_image"]


def test_does_not_expand_selection_specific_smart_art_request_to_current_slide() -> None:
    request = request_payload()
    request.question = "선택한 1, 2, 3, 4번을 순차 다이어그램 형태로 바꿔줘."
    request.context.selected_element_ids = []
    payload = proposal_payload()
    payload["operations"] = []
    payload["affectedElementIds"] = []
    payload["smartArtRequest"] = {
        "layoutId": "smart_art_process_4",
        "layoutType": "process",
        "sourceElementIds": ["el_image"],
        "items": [
            {"title": f"단계 {index + 1}", "description": None}
            for index in range(4)
        ],
    }

    with pytest.raises(DesignAgentGenerationError, match="unselected elements"):
        generate_design_proposal(
            request,
            model="test-model",
            api_key=None,
            client=FakeClient(payload),
        )


def test_filters_unknown_affected_element_metadata() -> None:
    payload = proposal_payload()
    payload["affectedElementIds"] = ["el_image", "el_unknown"]

    result = generate_design_proposal(
        request_payload(),
        model="test-model",
        api_key=None,
        client=FakeClient(payload),
    )

    assert result.affected_element_ids == ["el_image"]


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
        "layoutId": "smart_art_timeline_4",
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
