import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.design_program import (
    ArtDirectorContext,
    DesignProgramError,
    art_director_prompt,
    create_design_program,
    design_program_response_format,
)


def context() -> ArtDirectorContext:
    return ArtDirectorContext(
        topic="Splatoon Raiders",
        presentationProfile="product-launch",
        brief={"presentationType": "제품 공개", "audience": "게임 팬"},
        palette={"background": "#FFFFFF", "primary": "#6D28D9"},
        typography={"headingFont": "Pretendard", "bodyFont": "Pretendard"},
        forbiddenStyles=["gradient", "pastel"],
        mediaPolicy="hybrid",
        mediaBudget=4,
    )


def slides() -> list[dict[str, Any]]:
    return [
        {
            "title": "새로운 모험",
            "message": "스플래툰 레이더스가 새로운 경험을 연다",
            "contentItems": [{"text": "공식 공개 정보"}],
            "slideType": "cover",
            "mediaIntent": {
                "kind": "generate",
                "prompt": "ink island adventure",
                "alt": "게임 세계",
                "required": True,
            },
            "speakerNotes": "프롬프트에 포함되면 안 되는 전체 발표 메모",
            "sourceRecords": ["프롬프트에 포함되면 안 되는 연구 원문"],
        },
        {
            "title": "지금 확인하세요",
            "message": "공식 채널에서 다음 소식을 확인한다",
            "contentItems": [{"text": "공식 사이트"}],
            "slideType": "summary",
            "mediaIntent": {"kind": "none", "required": False},
        },
    ]


def valid_program() -> dict[str, Any]:
    return {
        "version": "program-v2",
        "visualConcept": "Energetic ink expedition",
        "paletteRoles": {
            "dominant": "#FFFFFF",
            "surface": "#F3F4F6",
            "text": "#111827",
            "focal": "#6D28D9",
            "secondary": "#22D3EE",
        },
        "typography": {
            "headingFont": "Pretendard",
            "bodyFont": "Pretendard",
            "typeScale": {"cover": 64, "title": 40, "body": 22, "caption": 14},
        },
        "backgroundSequence": ["image", "dark"],
        "imageStyle": "Official key art with clean crops",
        "surfaceStyle": "Flat ink color fields",
        "slides": [
            {
                "order": 1,
                "compositionId": "hero-full-bleed",
                "variant": "image",
                "backgroundMode": "image",
                "focalType": "hero-image",
                "assetRole": "atmosphere",
                "requiredAsset": True,
            },
            {
                "order": 2,
                "compositionId": "cta-closing",
                "variant": "dark",
                "backgroundMode": "dark",
                "focalType": "cta",
                "assetRole": "none",
                "requiredAsset": False,
            },
        ],
    }


class FakeResponses:
    def __init__(self, payloads: list[dict[str, Any]]) -> None:
        self.payloads = payloads
        self.requests: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.requests.append(kwargs)
        payload = self.payloads[min(len(self.requests) - 1, len(self.payloads) - 1)]
        return SimpleNamespace(output_text=json.dumps(payload, ensure_ascii=False))


def test_art_director_prompt_uses_only_compact_slide_summaries() -> None:
    prompt = art_director_prompt(context(), slides())

    assert "프롬프트에 포함되면 안 되는 전체 발표 메모" not in prompt
    assert "프롬프트에 포함되면 안 되는 연구 원문" not in prompt
    assert "hero-split" in prompt
    assert "mediaBudget" in prompt


def test_response_format_requires_exact_slide_count() -> None:
    schema = design_program_response_format(10)["format"]["schema"]

    assert schema["properties"]["slides"]["minItems"] == 10
    assert schema["properties"]["slides"]["maxItems"] == 10
    assert schema["properties"]["backgroundSequence"]["minItems"] == 10


def test_create_design_program_retries_one_invalid_response() -> None:
    invalid = {**valid_program(), "backgroundSequence": ["image"]}
    responses = FakeResponses([invalid, valid_program()])
    client = SimpleNamespace(responses=responses)

    program = create_design_program(context(), slides(), client=client)

    assert program.visual_concept == "Energetic ink expedition"
    assert len(responses.requests) == 2


def test_create_design_program_fails_after_one_retry() -> None:
    invalid = {**valid_program(), "slides": []}
    responses = FakeResponses([invalid, invalid])

    with pytest.raises(DesignProgramError):
        create_design_program(
            context(),
            slides(),
            client=SimpleNamespace(responses=responses),
        )
