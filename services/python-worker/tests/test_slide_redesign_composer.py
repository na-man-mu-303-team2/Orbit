from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.ai.color_options import contrast_ratio
from app.ai.composition_library import COMPOSITION_SPECS, CompositionCompileError
from app.ai.design_program import BackgroundMode, CompositionId
from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
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


def test_ordered_process_candidates_exclude_undated_timeline() -> None:
    candidates = eligible_candidates(
        summary("process", ["1. 준비", "2. 실행", "3. 확인", "4. 회고"])
    )

    composition_ids = {candidate.composition_id for candidate in candidates}
    assert {"process-horizontal", "process-vertical-rail"} <= composition_ids
    assert "timeline" not in composition_ids


def test_dated_process_candidates_include_timeline() -> None:
    candidates = eligible_candidates(
        summary(
            "process",
            ["2026.01 준비", "2026.02 실행", "2026.03 확인"],
        )
    )

    composition_ids = {candidate.composition_id for candidate in candidates}
    assert {"process-horizontal", "timeline"} <= composition_ids
    assert "process-vertical-rail" not in composition_ids


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


def test_media_enabled_candidates_include_required_and_image_variants() -> None:
    candidates = eligible_candidates(
        summary("title", ["핵심", "근거"]),
        media_enabled=True,
    )

    by_id = {candidate.composition_id: candidate for candidate in candidates}
    assert by_id["hero-full-bleed"].background_mode == "image"
    assert by_id["hero-full-bleed"].asset_role == "atmosphere"


def test_media_candidates_with_source_references_use_evidence_role() -> None:
    candidates = eligible_candidates(
        summary("title", ["핵심", "근거"]),
        media_enabled=True,
        has_source_refs=True,
    )

    by_id = {candidate.composition_id: candidate for candidate in candidates}
    assert by_id["hero-full-bleed"].asset_role == "evidence"


def test_optional_media_candidate_uses_slot_when_source_image_exists() -> None:
    candidates = eligible_candidates(
        summary("feature-grid", ["기능 A", "기능 B", "기능 C"]),
        media_enabled=True,
        source_image_count=1,
    )

    optional_candidates = [
        candidate
        for candidate in candidates
        if candidate.composition_id in {"hero-split", "editorial-split"}
    ]
    assert optional_candidates
    assert all(
        candidate.asset_role == "atmosphere" for candidate in optional_candidates
    )


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


def m1_compile_cases() -> list[tuple[CompositionId, BackgroundMode, int]]:
    cases: list[tuple[CompositionId, BackgroundMode, int]] = []
    for composition_id, spec in COMPOSITION_SPECS.items():
        if spec.media_requirement == "required":
            continue
        for mode in spec.variants:
            if mode == "image":
                continue
            for item_count in sorted({spec.min_items, spec.max_items}):
                cases.append((composition_id, mode, item_count))
    return cases


@pytest.mark.parametrize(
    ("composition_id", "background_mode", "item_count"),
    m1_compile_cases(),
)
def test_all_media_free_m1_compositions_compile_within_canvas(
    composition_id: CompositionId,
    background_mode: BackgroundMode,
    item_count: int,
) -> None:
    spec = COMPOSITION_SPECS[composition_id]
    slide_summary = summary(
        spec.purposes[0],
        [f"항목 {index}: {index * 10}%" for index in range(1, item_count + 1)],
    )
    candidate = CompositionCandidate(
        composition_id=composition_id,
        background_mode=background_mode,
    )
    theme = {
        "fontFamily": "Pretendard",
        "backgroundColor": "#FFFFFF",
        "textColor": "#111827",
        "accentColor": "#2563EB",
    }
    program = build_single_slide_program(
        theme,
        derive_palette(theme, background_mode),
        candidate,
    )

    compiled = compile_redesign(slide_summary, candidate, program)

    assert compiled.primary_focal_element_id
    for element in compiled.elements:
        assert element["x"] >= 0
        assert element["y"] >= 0
        assert element["x"] + element["width"] <= 1920
        assert element["y"] + element["height"] <= 1080
