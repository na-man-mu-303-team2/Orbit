from __future__ import annotations

import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.main as api_module
from app.ai.design_agent import generate_design_proposal
from app.ai.slide_redesign.stage_models import (
    ComposeStageArtifact,
    InterpretStageArtifact,
)
from app.ai.slide_redesign.stages import (
    run_compose_stage,
    run_interpret_stage,
    run_verify_stage,
)
from test_slide_redesign_pipeline import request_for, standard_elements, text_element


def test_stage_pipeline_matches_synchronous_design_agent_result() -> None:
    request = request_for(
        standard_elements(),
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

    synchronous = generate_design_proposal(
        request,
        model="test-model",
        api_key=None,
    )
    interpreted = run_interpret_stage(
        request,
        model="test-model",
        api_key=None,
    )
    interpreted = InterpretStageArtifact.model_validate_json(
        interpreted.model_dump_json(by_alias=True)
    )
    composed = run_compose_stage(
        request,
        interpreted,
        model="test-model",
        api_key=None,
    )
    composed = ComposeStageArtifact.model_validate_json(
        composed.model_dump_json(by_alias=True)
    )
    verified = run_verify_stage(request, composed)

    assert verified.outcome == "applicable"
    assert verified.response is not None
    assert verified.response.model_dump(
        by_alias=True,
        exclude_none=True,
    ) == synchronous.model_dump(by_alias=True, exclude_none=True)
    assert composed.ornament_applied is True


def test_non_applicable_interpret_artifact_short_circuits_compose() -> None:
    request = request_for([], width=1024, height=768)

    interpreted = run_interpret_stage(
        request,
        model="test-model",
        api_key=None,
    )
    composed = run_compose_stage(
        request,
        interpreted,
        model="test-model",
        api_key=None,
    )

    assert interpreted.outcome == "fallback-allowed"
    assert interpreted.reason == "unsupported-canvas"
    assert composed.outcome == interpreted.outcome
    assert composed.reason == interpreted.reason
    assert composed.response is None


def test_compose_artifact_exposes_unfilled_media_request() -> None:
    request = request_for(
        [
            text_element("el_title", "제품 출시", role="title", y=100),
            text_element("el_body", "빠른 시작", y=340),
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
    )
    interpreted = run_interpret_stage(request, model="test-model", api_key=None)
    assert interpreted.summary is not None
    interpreted.summary.slide_type = "title"
    client = SimpleNamespace(
        responses=SimpleNamespace(
            create=lambda **_: SimpleNamespace(
                output_text=json.dumps({"compositionId": "hero-full-bleed"})
            )
        )
    )

    composed = run_compose_stage(
        request,
        interpreted,
        model="test-model",
        api_key=None,
        client=client,
    )

    assert composed.outcome == "applicable"
    assert len(composed.image_requests) == 1
    image_request = composed.image_requests[0]
    assert image_request.needs_generation is True
    assert image_request.asset_role == "atmosphere"
    assert image_request.placeholder_element_id.endswith("_media_placeholder")


def test_internal_stage_endpoint_round_trips_all_artifacts() -> None:
    request = request_for(standard_elements())
    request_payload = request.model_dump(by_alias=True, mode="json")
    api_module.app.state.config = SimpleNamespace(
        openai_model="test-model",
        openai_api_key=None,
    )
    client = TestClient(api_module.app)

    interpret_response = client.post(
        "/internal/slide-redesign/stage",
        json={"stage": "interpret", "request": request_payload},
    )
    assert interpret_response.status_code == 200
    interpreted = interpret_response.json()
    assert interpreted["stage"] == "interpret"
    assert interpreted["outcome"] == "applicable"

    compose_response = client.post(
        "/internal/slide-redesign/stage",
        json={
            "stage": "compose",
            "request": request_payload,
            "artifact": interpreted,
        },
    )
    assert compose_response.status_code == 200
    composed = compose_response.json()
    assert composed["stage"] == "compose"
    assert composed["response"]["operations"]

    verify_response = client.post(
        "/internal/slide-redesign/stage",
        json={
            "stage": "verify",
            "request": request_payload,
            "artifact": composed,
        },
    )
    assert verify_response.status_code == 200
    verified = verify_response.json()
    assert verified["stage"] == "verify"
    assert verified["response"]["operations"] == composed["response"]["operations"]


def test_internal_stage_endpoint_rejects_wrong_artifact_type() -> None:
    request = request_for(standard_elements())
    api_module.app.state.config = SimpleNamespace(
        openai_model="test-model",
        openai_api_key=None,
    )

    response = TestClient(api_module.app).post(
        "/internal/slide-redesign/stage",
        json={
            "stage": "verify",
            "request": request.model_dump(by_alias=True, mode="json"),
            "artifact": {
                "stage": "interpret",
                "outcome": "fallback-allowed",
                "reason": "wrong-stage",
            },
        },
    )

    assert response.status_code == 422
