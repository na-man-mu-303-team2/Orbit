from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.ai.color_options import (
    DeckColorCustomizationRequest,
    customize_deck_color_palette,
)


BASE_PALETTE = {
    "primary": "#6846D8",
    "secondary": "#1F1D3D",
    "background": "#FFFFFF",
    "surface": "#FFFFFF",
    "muted": "#F1ECFF",
    "border": "#E6E6E6",
    "text": "#090909",
    "accentColor": "#C5B0F4",
}


class FakeResponses:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(output_text=json.dumps(self.payload))


def test_customization_returns_one_accessible_strict_palette() -> None:
    responses = FakeResponses(
        {
            "option": {
                "optionId": "ai-custom",
                "name": "따뜻한 라일락",
                "palette": {
                    **BASE_PALETTE,
                    "text": "#FFFFFF",
                    "accentColor": "#D97706",
                },
                "rationale": "포인트 색상만 따뜻하게 조정했습니다.",
            }
        }
    )
    request = DeckColorCustomizationRequest.model_validate(
        {
            "topic": "제품 전략",
            "instruction": "포인트 색상만 따뜻하게",
            "basePalette": BASE_PALETTE,
            "tone": "professional",
        }
    )

    result = customize_deck_color_palette(
        request,
        client=SimpleNamespace(responses=responses),
    )

    assert result.option.palette.accent_color == "#D97706"
    assert result.option.palette.text == "#111827"
    assert len(responses.calls) == 1
    assert "Base palette" in responses.calls[0]["input"]


def test_customization_rejects_unknown_request_fields() -> None:
    with pytest.raises(ValidationError):
        DeckColorCustomizationRequest.model_validate(
            {
                "topic": "제품 전략",
                "instruction": "파란색으로",
                "basePalette": BASE_PALETTE,
                "tone": "professional",
                "providerPrompt": "must not pass",
            }
        )

    with pytest.raises(ValidationError):
        DeckColorCustomizationRequest.model_validate(
            {
                "topic": "제품 전략",
                "instruction": "파란색으로",
                "basePalette": {**BASE_PALETTE, "providerColor": "#000000"},
                "tone": "professional",
            }
        )
