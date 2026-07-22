from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from app.ai.composition_library import (
    COMPOSITION_SPECS,
    CompiledComposition,
    CompositionCompileError,
    compile_composition,
    content_supports_composition,
)
from app.ai.design_program import CompositionId, DeckDesignProgram, PaletteRoles


@dataclass(frozen=True)
class CompositionCandidate:
    composition_id: CompositionId
    background_mode: Literal["light", "dark"]
    asset_role: Literal["none"] = "none"


def eligible_candidates(summary: dict[str, Any]) -> list[CompositionCandidate]:
    """Return media-free curated compositions supported by the slide content."""
    slide_type = str(summary.get("slideType", "summary"))
    content_items = summary.get("contentItems", [])
    item_count = len(content_items) if isinstance(content_items, list) else 0
    result: list[CompositionCandidate] = []
    for composition_id, spec in COMPOSITION_SPECS.items():
        if slide_type not in spec.purposes:
            continue
        if not spec.min_items <= item_count <= spec.max_items:
            continue
        if spec.media_requirement == "required":
            continue
        if not content_supports_composition(composition_id, summary):
            continue
        for mode in spec.variants:
            if mode == "image":
                continue
            result.append(
                CompositionCandidate(
                    composition_id=composition_id,
                    background_mode=mode,
                )
            )
    if not result:
        raise CompositionCompileError("No media-free composition supports the slide")
    return result


def build_single_slide_program(
    theme: dict[str, Any],
    roles: PaletteRoles,
    candidate: CompositionCandidate,
) -> DeckDesignProgram:
    """Build a validated program-v2 contract for one redesign candidate."""
    typography = theme.get("typography")
    typography_values = typography if isinstance(typography, dict) else {}
    heading_font = _string_value(
        typography_values.get("headingFont") or theme.get("fontFamily"), "Inter"
    )
    body_font = _string_value(
        typography_values.get("bodyFont") or theme.get("fontFamily"), heading_font
    )
    type_scale = typography_values.get("typeScale")
    scale_values = type_scale if isinstance(type_scale, dict) else {}
    spec = COMPOSITION_SPECS[candidate.composition_id]
    return DeckDesignProgram.model_validate(
        {
            "version": "program-v2",
            "visualConcept": "Current slide redesign",
            "paletteRoles": roles.model_dump(),
            "typography": {
                "headingFont": heading_font,
                "bodyFont": body_font,
                "typeScale": {
                    "cover": _integer_value(scale_values.get("cover"), 64),
                    "title": _integer_value(scale_values.get("title"), 44),
                    "body": _integer_value(scale_values.get("body"), 24),
                    "caption": _integer_value(scale_values.get("caption"), 16),
                },
            },
            "backgroundSequence": [candidate.background_mode],
            "imageStyle": "No generated media",
            "surfaceStyle": "Theme-aligned editable surfaces",
            "slides": [
                {
                    "order": 1,
                    "compositionId": candidate.composition_id,
                    "variant": candidate.background_mode,
                    "backgroundMode": candidate.background_mode,
                    "focalType": spec.focal_rule,
                    "assetRole": "none",
                    "requiredAsset": False,
                }
            ],
        }
    )


def compile_redesign(
    summary: dict[str, Any],
    candidate: CompositionCandidate,
    program: DeckDesignProgram,
) -> CompiledComposition:
    """Compile one candidate without weakening composition errors."""
    return compile_composition(program.slides[0], summary, program)


def _string_value(value: object, default: str) -> str:
    return value if isinstance(value, str) and value else default


def _integer_value(value: object, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default
