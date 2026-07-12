from collections import Counter
from typing import Any

import pytest

from app.ai.composition_library import (
    COMPOSITION_SPECS,
    compile_composition,
    content_supports_composition,
    design_program_snapshot,
    normalize_design_program,
)
from app.ai.design_program import DeckDesignProgram


def program(slides: list[dict[str, Any]]) -> DeckDesignProgram:
    backgrounds = [slide.get("backgroundMode", "light") for slide in slides]
    return DeckDesignProgram.model_validate(
        {
            "version": "program-v2",
            "visualConcept": "Energetic product reveal",
            "paletteRoles": {
                "dominant": "#FFFFFF",
                "surface": "#F3F4F6",
                "text": "#111827",
                "focal": "#6D28D9",
                "secondary": "#06B6D4",
            },
            "typography": {
                "headingFont": "Pretendard",
                "bodyFont": "Pretendard",
                "typeScale": {
                    "cover": 64,
                    "title": 40,
                    "body": 22,
                    "caption": 14,
                },
            },
            "backgroundSequence": backgrounds,
            "imageStyle": "Official evidence and bold atmosphere",
            "surfaceStyle": "Flat ink fields",
            "slides": slides,
        }
    )


def slide_payload(slide_type: str, item_count: int) -> dict[str, Any]:
    return {
        "title": f"{slide_type} title",
        "message": "하나의 명확한 핵심 메시지",
        "slideType": slide_type,
        "contentItems": [
            {"contentItemId": f"item-{index}", "text": f"근거 항목 {index}"}
            for index in range(1, item_count + 1)
        ],
        "mediaIntent": {"alt": "관련 공식 이미지"},
    }


@pytest.mark.parametrize("composition_id", list(COMPOSITION_SPECS))
def test_each_composition_compiles_editable_elements(composition_id: str) -> None:
    spec = COMPOSITION_SPECS[composition_id]
    item_count = spec.min_items
    slide_type = spec.purposes[0]
    variant = spec.variants[0]
    asset_role = "evidence" if spec.media_requirement == "required" else "none"
    direction = {
        "order": 1,
        "compositionId": composition_id,
        "variant": variant,
        "backgroundMode": variant,
        "focalType": spec.focal_rule,
        "assetRole": asset_role,
        "requiredAsset": spec.media_requirement == "required",
    }
    design_program = program([direction])

    compiled = compile_composition(
        design_program.slides[0],
        slide_payload(slide_type, item_count),
        design_program,
    )

    element_ids = {element["elementId"] for element in compiled.elements}
    assert compiled.primary_focal_element_id in element_ids
    assert all(element["width"] > 0 and element["height"] > 0 for element in compiled.elements)
    assert all(element["x"] + element["width"] <= 1920 for element in compiled.elements)
    assert all(element["y"] + element["height"] <= 1080 for element in compiled.elements)


def launch_slides() -> list[dict[str, Any]]:
    definitions = [
        ("cover", 2),
        ("problem", 2),
        ("solution", 3),
        ("feature-grid", 3),
        ("data", 2),
        ("process", 3),
        ("comparison", 2),
        ("data", 3),
        ("quote", 1),
        ("summary", 2),
    ]
    return [slide_payload(slide_type, count) for slide_type, count in definitions]


def repeated_program(slide_count: int) -> DeckDesignProgram:
    return program(
        [
            {
                "order": index,
                "compositionId": "statement-poster",
                "variant": "dark",
                "backgroundMode": "dark",
                "focalType": "statement",
                "assetRole": "none",
                "requiredAsset": False,
            }
            for index in range(1, slide_count + 1)
        ]
    )


def test_normalizer_enforces_composition_and_background_rhythm() -> None:
    slides = launch_slides()
    normalized = normalize_design_program(
        repeated_program(len(slides)),
        slides,
        media_policy="hybrid",
        media_budget=4,
    )
    silhouettes = [
        COMPOSITION_SPECS[slide.composition_id].silhouette
        for slide in normalized.slides
    ]
    usage = Counter(slide.composition_id for slide in normalized.slides)

    assert normalized.slides[-1].composition_id == "cta-closing"
    assert all(left != right for left, right in zip(silhouettes, silhouettes[1:]))
    assert max(usage.values()) <= 2
    assert len(set(normalized.background_sequence)) >= 2
    assert 3 <= sum(slide.asset_role != "none" for slide in normalized.slides) <= 5


def test_normalizer_reserves_comparison_options_for_constrained_later_slides() -> None:
    definitions = [
        ("cover", 2, "minimal-cover"),
        ("comparison", 4, "feature-comparison"),
        ("feature-grid", 4, "editorial-split"),
        ("comparison", 3, "feature-comparison"),
        ("feature-grid", 4, "editorial-split"),
        ("data", 4, "kpi-strip-evidence"),
        ("comparison", 3, "feature-comparison"),
        ("summary", 2, "cta-closing"),
    ]
    slides = [slide_payload(slide_type, count) for slide_type, count, _ in definitions]
    data_items = [
        "탐험: 신비로운 섬 자유 탐험",
        "액션: 다양한 잉크 무기와 기계 장비 활용",
        "커스터마이즈: 외모와 장비 구성 자유",
        "협동: 온라인 및 로컬 3인 협동 지원",
    ]
    slides[5]["contentItems"] = [
        {"contentItemId": f"data-{index}", "text": value}
        for index, value in enumerate(data_items, start=1)
    ]
    slides[5]["message"] = "\n".join(data_items)
    design_program = program(
        [
            {
                "order": index,
                "compositionId": composition_id,
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "text",
                "assetRole": "none",
                "requiredAsset": False,
            }
            for index, (_, _, composition_id) in enumerate(definitions, start=1)
        ]
    )

    normalized = normalize_design_program(
        design_program,
        slides,
        media_policy="hybrid",
        media_budget=4,
    )
    composition_ids = [slide.composition_id for slide in normalized.slides]
    silhouettes = [COMPOSITION_SPECS[value].silhouette for value in composition_ids]

    assert max(Counter(composition_ids).values()) <= 2
    assert all(left != right for left, right in zip(silhouettes, silhouettes[1:]))
    assert composition_ids[4] in {"kpi-strip-evidence", "diagram-hub"}
    assert composition_ids[5] in {"metric-poster", "editorial-split"}

    compiled = compile_composition(normalized.slides[5], slides[5], normalized)
    visible_text = [
        element["props"]["text"]
        for element in compiled.elements
        if element.get("type") == "text"
    ]
    assert "\n".join(data_items) not in visible_text


def test_normalizer_meets_body_layout_diversity_gate() -> None:
    definitions = [
        ("cover", 2, "minimal-cover", "none"),
        ("feature-grid", 3, "feature-comparison", "none"),
        ("solution", 3, "editorial-split", "evidence"),
        ("feature-grid", 3, "feature-comparison", "none"),
        ("data", 3, "metric-poster", "none"),
        ("process", 3, "process-horizontal", "none"),
        ("solution", 2, "editorial-split", "evidence"),
        ("summary", 2, "cta-closing", "atmosphere"),
    ]
    slides = [
        slide_payload(slide_type, count)
        for slide_type, count, _, _ in definitions
    ]
    design_program = program(
        [
            {
                "order": index,
                "compositionId": composition_id,
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "text",
                "assetRole": asset_role,
                "requiredAsset": False,
            }
            for index, (_, _, composition_id, asset_role) in enumerate(
                definitions,
                start=1,
            )
        ]
    )

    normalized = normalize_design_program(
        design_program,
        slides,
        force_light=True,
        media_policy="hybrid",
    )
    body_compositions = [
        slide.composition_id for slide in normalized.slides[1:-1]
    ]
    body_silhouettes = [
        COMPOSITION_SPECS[value].silhouette for value in body_compositions
    ]

    assert len(set(body_compositions)) >= 5
    assert all(
        left != right
        for left, right in zip(body_silhouettes, body_silhouettes[1:])
    )


def test_editorial_split_pair_uses_full_height_statement_panels() -> None:
    slide = slide_payload("solution", 2)
    slide["message"] = "\n".join(
        item["text"] for item in slide["contentItems"]
    )
    design_program = program(
        [
            {
                "order": 1,
                "compositionId": "editorial-split",
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "text",
                "assetRole": "none",
                "requiredAsset": False,
            }
        ]
    )

    compiled = compile_composition(
        design_program.slides[0],
        slide,
        design_program,
    )
    body_elements = [
        element for element in compiled.elements if element.get("role") == "body"
    ]

    assert len(body_elements) == 2
    assert all(element["height"] >= 392 for element in body_elements)
    assert all(element["props"]["fontSize"] >= 30 for element in body_elements)
    assert all(element["props"]["verticalAlign"] == "middle" for element in body_elements)


def test_metric_poster_requires_numeric_evidence() -> None:
    qualitative = slide_payload("data", 2)
    qualitative["contentItems"] = [
        {"contentItemId": "item-a", "text": "긴장감 있는 전투"},
        {"contentItemId": "item-b", "text": "다양한 적 구성"},
    ]
    numeric = slide_payload("data", 2)
    numeric["contentItems"][0]["text"] = "2026년 7월 23일 출시"

    assert content_supports_composition("metric-poster", qualitative) is False
    assert content_supports_composition("metric-poster", numeric) is True


def test_diagram_hub_uses_grid_width_for_korean_focal_copy() -> None:
    slide = slide_payload("feature-grid", 3)
    slide["title"] = "딥컷 아미보 피규어 출시 예고"
    slide["message"] = "\n".join(
        item["text"] for item in slide["contentItems"]
    )
    design_program = program(
        [
            {
                "order": 1,
                "compositionId": "diagram-hub",
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "diagram",
                "assetRole": "none",
                "requiredAsset": False,
            }
        ]
    )

    compiled = compile_composition(
        design_program.slides[0],
        slide,
        design_program,
    )
    hub = next(
        element for element in compiled.elements if element["elementId"].endswith("_hub")
    )

    assert hub["x"] == 712
    assert hub["width"] == 496
    assert hub["props"]["fontSize"] == 26


def test_cta_closing_duplicate_message_uses_single_full_height_focal() -> None:
    slide = slide_payload("summary", 1)
    slide["message"] = slide["contentItems"][0]["text"]
    design_program = program(
        [
            {
                "order": 1,
                "compositionId": "cta-closing",
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "cta",
                "assetRole": "none",
                "requiredAsset": False,
            }
        ]
    )

    compiled = compile_composition(
        design_program.slides[0],
        slide,
        design_program,
    )
    focal = next(
        element
        for element in compiled.elements
        if element["elementId"] == compiled.primary_focal_element_id
    )
    visible_matches = [
        element
        for element in compiled.elements
        if element.get("type") == "text"
        and element.get("props", {}).get("text") == slide["message"]
    ]

    assert focal["elementId"].endswith("_message")
    assert focal["role"] == "highlight"
    assert focal["height"] >= 376
    assert focal["props"]["verticalAlign"] == "middle"
    assert len(visible_matches) == 1


def test_white_canvas_forces_light_variants() -> None:
    slides = launch_slides()
    normalized = normalize_design_program(
        repeated_program(len(slides)),
        slides,
        force_light=True,
        media_policy="hybrid",
    )

    assert set(normalized.background_sequence) == {"light"}
    assert all(slide.variant == "light" for slide in normalized.slides)
    assert all(slide.composition_id != "hero-full-bleed" for slide in normalized.slides)


def test_snapshot_records_composition_sequence() -> None:
    design_program = program(
        [
            {
                "order": 1,
                "compositionId": "minimal-cover",
                "variant": "light",
                "backgroundMode": "light",
                "focalType": "title",
                "assetRole": "none",
                "requiredAsset": False,
            }
        ]
    )

    assert design_program_snapshot(design_program)["compositionIds"] == [
        "minimal-cover"
    ]
