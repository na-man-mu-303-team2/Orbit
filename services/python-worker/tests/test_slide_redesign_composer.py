from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.color_options import contrast_ratio
from app.ai.composition_library import CompositionCompileError
from app.ai.slide_redesign.composer import (
    build_single_slide_program,
    eligible_candidates,
    select_composition,
)
from app.ai.slide_redesign.palette import derive_palette


def summary(slide_type: str, items: list[str]) -> dict[str, object]:
    return {
        "title": "제목",
        "message": "핵심 메시지",
        "slideType": slide_type,
        "contentItems": [
            {"contentItemId": f"item-{index}", "text": text}
            for index, text in enumerate(items, start=1)
        ],
    }


def test_derive_palette_repairs_low_text_contrast() -> None:
    roles = derive_palette(
        {
            "backgroundColor": "#F5F5F5",
            "textColor": "#E5E7EB",
            "accentColor": "#7C3AED",
        },
        "light",
    )

    assert contrast_ratio(roles.text, roles.dominant) >= 4.5


def test_derive_palette_preserves_theme_focal_color() -> None:
    roles = derive_palette(
        {
            "backgroundColor": "#FFFFFF",
            "textColor": "#111827",
            "accentColor": "#E11D48",
        },
        "dark",
    )

    assert roles.focal == "#E11D48"


def test_process_candidates_include_process_and_timeline() -> None:
    candidates = eligible_candidates(
        summary("process", ["1. 준비", "2. 실행", "3. 확인", "4. 회고"])
    )

    composition_ids = {candidate.composition_id for candidate in candidates}
    assert {"process-horizontal", "timeline"} <= composition_ids


def test_required_media_compositions_are_excluded() -> None:
    candidates = eligible_candidates(summary("title", ["핵심", "근거"]))

    composition_ids = {candidate.composition_id for candidate in candidates}
    assert "hero-full-bleed" not in composition_ids
    assert "image-evidence" not in composition_ids


def test_optional_media_compositions_remain_eligible_without_assets() -> None:
    feature_ids = {
        candidate.composition_id
        for candidate in eligible_candidates(
            summary("feature-grid", ["기능 A", "기능 B", "기능 C"])
        )
    }
    closing_ids = {
        candidate.composition_id
        for candidate in eligible_candidates(summary("summary", ["다음 단계"]))
    }

    assert {"hero-split", "editorial-split"} <= feature_ids
    assert "cta-closing" in closing_ids


def test_unsupported_item_count_raises_compile_error() -> None:
    with pytest.raises(CompositionCompileError, match="No media-free composition"):
        eligible_candidates(summary("feature-grid", [f"항목 {index}" for index in range(10)]))


def test_numeric_compositions_require_numeric_content() -> None:
    candidates = eligible_candidates(summary("data", ["빠른 성장", "안정적 운영"]))

    composition_ids = {candidate.composition_id for candidate in candidates}
    assert "metric-poster" not in composition_ids
    assert "kpi-strip-evidence" not in composition_ids


def test_build_single_slide_program_passes_program_validator() -> None:
    theme = {
        "fontFamily": "Pretendard",
        "backgroundColor": "#FFFFFF",
        "textColor": "#111827",
        "accentColor": "#2563EB",
    }
    roles = derive_palette(theme, "light")
    candidate = eligible_candidates(summary("summary", ["다음 단계"]))[0]

    program = build_single_slide_program(theme, roles, candidate)

    assert program.version == "program-v2"
    assert program.slides[0].composition_id == candidate.composition_id
    assert program.slides[0].asset_role == "none"


class FakeResponses:
    def __init__(self, output: object = None, *, error: Exception | None = None) -> None:
        self.output = output
        self.error = error

    def create(self, **_: Any) -> SimpleNamespace:
        if self.error is not None:
            raise self.error
        return SimpleNamespace(output_text=json.dumps(self.output, ensure_ascii=False))


class FakeClient:
    def __init__(self, output: object = None, *, error: Exception | None = None) -> None:
        self.responses = FakeResponses(output, error=error)


def test_select_composition_falls_back_for_out_of_list_id() -> None:
    slide_summary = summary("process", ["1. 준비", "2. 실행", "3. 확인"])
    candidates = eligible_candidates(slide_summary)

    selected = select_composition(
        slide_summary,
        candidates,
        "더 명확하게 재배치해줘",
        model="test-model",
        api_key=None,
        client=FakeClient(
            {"compositionId": "invented-layout", "rationale": "outside enum"}
        ),
    )

    assert selected == candidates[0]


def test_select_composition_falls_back_when_provider_raises() -> None:
    slide_summary = summary("process", ["1. 준비", "2. 실행", "3. 확인"])
    candidates = eligible_candidates(slide_summary)

    selected = select_composition(
        slide_summary,
        candidates,
        "더 명확하게 재배치해줘",
        model="test-model",
        api_key=None,
        client=FakeClient(error=RuntimeError("provider unavailable")),
    )

    assert selected == candidates[0]
