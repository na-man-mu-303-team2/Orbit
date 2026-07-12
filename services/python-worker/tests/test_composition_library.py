from collections import Counter
from typing import Any

import pytest

from app.ai.composition_library import (
    COMPOSITION_SPECS,
    compile_composition,
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
