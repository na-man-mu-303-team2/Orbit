from __future__ import annotations

from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from app.ai.slide_redesign.media import (
    MediaSlot,
    assign_media,
    build_media_operations,
    collect_source_images,
    find_media_slots,
)
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


def media_slot(
    slot_id: str = "el_1_program_v2_media_placeholder",
    *,
    width: float = 1200,
    height: float = 600,
) -> MediaSlot:
    return MediaSlot(
        placeholder_element_id=slot_id,
        caption_element_id=None,
        x=120,
        y=200,
        width=width,
        height=height,
        z_index=3,
        aspect_ratio=(
            "landscape"
            if width / height > 1.2
            else "portrait"
            if width / height < 0.8
            else "square"
        ),
    )


def source_image(
    element_id: str,
    *,
    width: float = 800,
    height: float = 600,
    element_type: str = "image",
) -> dict[str, object]:
    return {
        "elementId": element_id,
        "type": element_type,
        "x": 0,
        "y": 0,
        "width": width,
        "height": height,
    }


def test_one_source_is_assigned_to_one_slot() -> None:
    source = source_image("el_image_1")

    assignments = assign_media([media_slot()], [source])

    assert assignments is not None
    assert len(assignments) == 1
    assert assignments[0].source_element_id == "el_image_1"
    assert assignments[0].needs_generation is False


def test_more_sources_than_slots_is_unsafe() -> None:
    assignments = assign_media(
        [media_slot()],
        [source_image("el_image_1"), source_image("el_image_2")],
    )

    assert assignments is None


def test_empty_slot_is_marked_for_generation() -> None:
    assignments = assign_media([media_slot()], [])

    assert assignments is not None
    assert assignments[0].source_element_id is None
    assert assignments[0].needs_generation is True


def test_portrait_source_uses_cover_in_landscape_slot() -> None:
    assignments = assign_media(
        [media_slot(width=1200, height=600)],
        [source_image("el_portrait", width=400, height=900)],
    )

    assert assignments is not None
    assert assignments[0].fit == "cover"


def test_collect_source_images_includes_svg_and_sorts_by_area() -> None:
    slide = {
        "elements": [
            source_image("el_small", width=200, height=100),
            source_image("el_large", width=800, height=600, element_type="svg"),
            {"elementId": "el_text", "type": "text"},
        ]
    }

    sources = collect_source_images(slide)

    assert [source["elementId"] for source in sources] == ["el_large", "el_small"]


def test_media_relocation_uses_frame_and_props_updates_without_delete() -> None:
    assignments = assign_media(
        [media_slot()],
        [source_image("el_image_1")],
    )

    assert assignments is not None
    operations = build_media_operations("slide-1", assignments)

    assert [operation["type"] for operation in operations] == [
        "update_element_frame",
        "update_element_props",
    ]
    assert {operation["elementId"] for operation in operations} == {"el_image_1"}
    assert operations[0]["frame"] == {
        "role": "media",
        "x": 120,
        "y": 200,
        "width": 1200,
        "height": 600,
        "zIndex": 4,
    }
    assert operations[1]["props"] == {"fit": "contain"}
    assert all(operation["type"] != "delete_element" for operation in operations)


def test_unfilled_media_slot_emits_no_element_operation() -> None:
    assignments = assign_media([media_slot()], [])

    assert assignments is not None
    assert build_media_operations("slide-1", assignments) == []
