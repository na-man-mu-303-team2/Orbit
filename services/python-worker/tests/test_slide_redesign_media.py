from __future__ import annotations

from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from app.ai.slide_redesign.media import find_media_slots
from app.ai.slide_redesign.palette import derive_palette


THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#2563EB",
}


def test_hero_full_bleed_compilation_exposes_one_media_slot() -> None:
    summary = {
        "title": "제품 출시",
        "message": "핵심 메시지",
        "slideType": "title",
        "contentItems": [
            {"contentItemId": "item-1", "text": "빠른 시작"},
        ],
    }
    candidate = CompositionCandidate(
        "hero-full-bleed",
        "image",
        "atmosphere",
    )
    program = build_single_slide_program(
        THEME,
        derive_palette(THEME, "dark"),
        candidate,
    )
    compiled = compile_redesign(summary, candidate, program)

    slots = find_media_slots(compiled)

    assert len(slots) == 1
    slot = slots[0]
    assert slot.placeholder_element_id.endswith("_media_placeholder")
    assert slot.caption_element_id is None
    assert slot.aspect_ratio == "landscape"
    assert (slot.x, slot.y, slot.width, slot.height) == (0, 0, 1920, 1080)
