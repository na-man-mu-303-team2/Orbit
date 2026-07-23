from __future__ import annotations

from typing import Any

import pytest

from app.ai.composition_library import COMPOSITION_SPECS
from app.ai.design_program import CompositionId, PaletteRoles
from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from app.ai.slide_redesign.ornament import (
    MAX_ORNAMENTS,
    OrnamentCandidate,
    finalize_ornaments,
    generate_ornaments,
)
from app.ai.slide_redesign.palette import derive_palette


THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#2563EB",
}


def compile_case(
    composition_id: CompositionId,
    slide_type: str,
    items: list[str],
    *,
    message: str = "핵심 메시지",
) -> tuple[list[dict[str, Any]], PaletteRoles]:
    summary = {
        "title": "제목",
        "message": message,
        "slideType": slide_type,
        "contentItems": [
            {"contentItemId": f"item-{index}", "text": text}
            for index, text in enumerate(items, start=1)
        ],
    }
    candidate = CompositionCandidate(composition_id, "light")
    palette = derive_palette(THEME, "light")
    program = build_single_slide_program(THEME, palette, candidate)
    compiled = compile_redesign(summary, candidate, program)
    return compiled.elements, palette


def test_process_horizontal_generates_step_badges_and_connectors() -> None:
    elements, palette = compile_case(
        "process-horizontal",
        "process",
        ["준비", "실행", "검증", "출시"],
    )

    ornaments = generate_ornaments("process-horizontal", elements, palette)

    assert sum("step_badge" in item["elementId"] for item in ornaments) == 4
    assert sum("connector" in item["elementId"] for item in ornaments) == 3
    assert {item["type"] for item in ornaments} == {"ellipse", "line"}


def test_statement_poster_generates_one_accent_bar() -> None:
    elements, palette = compile_case(
        "statement-poster",
        "summary",
        ["한 문장"],
    )

    ornaments = generate_ornaments("statement-poster", elements, palette)

    assert [item["elementId"] for item in ornaments] == ["el_orn_accent_bar_1"]
    assert ornaments[0]["type"] == "polygon"


def test_metric_poster_ring_is_centered_on_metric_text() -> None:
    elements, palette = compile_case(
        "metric-poster",
        "data",
        ["전환율 42%"],
        message="42%",
    )
    metric = next(item for item in elements if item["elementId"].endswith("_metric"))

    ornaments = generate_ornaments("metric-poster", elements, palette)

    assert len(ornaments) == 1
    ring = ornaments[0]
    assert ring["type"] == "ellipse"
    assert ring["x"] + ring["width"] / 2 == metric["x"] + metric["width"] / 2
    assert ring["y"] + ring["height"] / 2 == metric["y"] + metric["height"] / 2


def shape_candidate(
    index: int,
    *,
    x: float,
    y: float,
    width: float = 24,
    height: float = 24,
) -> OrnamentCandidate:
    return OrnamentCandidate(
        {
            "elementId": f"el_orn_test_{index}",
            "type": "ellipse",
            "role": "decoration",
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 0,
            "locked": False,
            "visible": True,
            "props": {
                "fill": "transparent",
                "stroke": "#2563EB",
                "strokeWidth": 2,
                "borderRadius": 12,
            },
        }
    )


def test_unapproved_text_overlap_drops_only_the_ornament() -> None:
    text = {
        "elementId": "el_body",
        "type": "text",
        "x": 200,
        "y": 200,
        "width": 300,
        "height": 100,
        "zIndex": 5,
        "visible": True,
    }

    ornaments = finalize_ornaments(
        [shape_candidate(1, x=220, y=220, width=80, height=60)],
        [text],
    )

    assert ornaments == []
    assert text["x"] == 200
    assert text["y"] == 200


def test_ornament_count_is_capped_at_twelve() -> None:
    candidates = [
        shape_candidate(
            index,
            x=130 + (index % 10) * 100,
            y=100 + (index // 10) * 100,
        )
        for index in range(20)
    ]

    ornaments = finalize_ornaments(candidates, [])

    assert len(ornaments) == MAX_ORNAMENTS == 12


@pytest.mark.parametrize(
    ("composition_id", "slide_type", "items", "message"),
    [
        ("process-horizontal", "process", ["준비", "실행", "검증", "출시"], "진행"),
        ("statement-poster", "summary", ["한 문장"], "한 문장"),
        ("metric-poster", "data", ["전환율 42%"], "42%"),
    ],
)
def test_all_generated_ornaments_obey_frame_role_id_and_z_index_invariants(
    composition_id: CompositionId,
    slide_type: str,
    items: list[str],
    message: str,
) -> None:
    elements, palette = compile_case(
        composition_id,
        slide_type,
        items,
        message=message,
    )
    content_max_z = max(int(element["zIndex"]) for element in elements)

    ornaments = generate_ornaments(composition_id, elements, palette)

    assert ornaments
    for ornament in ornaments:
        assert ornament["x"] >= 120
        assert ornament["y"] >= 88
        assert ornament["x"] + ornament["width"] <= 1800
        assert ornament["y"] + ornament["height"] <= 992
        assert ornament["role"] == "decoration"
        assert ornament["elementId"].startswith("el_orn_")
        assert ornament["zIndex"] > content_max_z


@pytest.mark.parametrize("composition_id", list(COMPOSITION_SPECS))
def test_every_composition_ornament_smoke_stays_inside_canvas(
    composition_id: CompositionId,
) -> None:
    palette = derive_palette(THEME, "light")
    content = [
        {
            "elementId": "el_1_program_v2_title",
            "type": "text",
            "role": "title",
            "x": 120,
            "y": 100,
            "width": 1200,
            "height": 120,
            "zIndex": 5,
            "visible": True,
        }
    ]

    ornaments = generate_ornaments(composition_id, content, palette)

    assert len(ornaments) <= MAX_ORNAMENTS
    assert all(
        ornament["x"] >= 0
        and ornament["y"] >= 0
        and ornament["x"] + ornament["width"] <= 1920
        and ornament["y"] + ornament["height"] <= 1080
        for ornament in ornaments
    )
