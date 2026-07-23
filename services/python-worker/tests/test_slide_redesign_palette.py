from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.ai.color_options import contrast_ratio
from app.ai.slide_redesign.palette import build_palette_options


THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#E11D48",
    "palette": {
        "surface": "#F8FAFC",
        "secondary": "#7C3AED",
    },
}
SUMMARY = {
    "title": "제품 출시",
    "message": "더 빠른 발표 준비",
    "slideType": "title",
    "contentItems": [],
}


class FailingResponses:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        raise RuntimeError("provider unavailable")


def test_palette_options_keep_current_theme_first() -> None:
    options = build_palette_options(
        THEME,
        SUMMARY,
        model="test-model",
        api_key=None,
    )

    assert len(options) == 3
    assert options[0].option_id == "current-theme"
    assert options[0].is_current_theme is True
    assert options[0].palette.focal == THEME["accentColor"]
    assert all(option.is_current_theme is False for option in options[1:])


def test_all_palette_options_have_accessible_dominant_text_contrast() -> None:
    options = build_palette_options(
        {
            **THEME,
            "textColor": "#E5E7EB",
            "backgroundColor": "#F5F5F5",
        },
        SUMMARY,
        model="test-model",
        api_key=None,
    )

    assert all(
        contrast_ratio(option.palette.text, option.palette.dominant) >= 4.5
        for option in options
    )


def test_palette_options_fall_back_when_provider_fails() -> None:
    responses = FailingResponses()

    options = build_palette_options(
        THEME,
        SUMMARY,
        model="test-model",
        api_key=None,
        client=SimpleNamespace(responses=responses),
    )

    assert len(responses.calls) == 1
    assert len(options) == 3
    assert options[0].is_current_theme is True
