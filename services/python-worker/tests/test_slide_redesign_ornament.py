from __future__ import annotations

from typing import Any

from app.ai.slide_redesign.composer import (
    CompositionCandidate,
    build_single_slide_program,
    compile_redesign,
)
from app.ai.slide_redesign.ornament import generate_ornaments
from app.ai.slide_redesign.palette import derive_palette


THEME = {
    "fontFamily": "Pretendard",
    "backgroundColor": "#FFFFFF",
    "textColor": "#111827",
    "accentColor": "#2563EB",
}


def compile_case(
    composition_id: str,
    slide_type: str,
    items: list[str],
    *,
    message: str = "핵심 메시지",
) -> tuple[list[dict[str, Any]], Any]:
    summary = {
        "title": "제목",
        "message": message,
        "slideType": slide_type,
        "contentItems": [
            {"contentItemId": f"item-{index}", "text": text}
            for index, text in enumerate(items, start=1)
        ],
    }
    candidate = CompositionCandidate(composition_id, "light")  # type: ignore[arg-type]
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
