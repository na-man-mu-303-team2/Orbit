from __future__ import annotations

import base64
import math
from io import BytesIO
from typing import Any, Literal

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from pydantic import BaseModel, Field


DECK_UNITS_PER_INCH = 144
POINTS_PER_INCH = 72


class DeckPptxExportRequest(BaseModel):
    deck: dict[str, Any]
    format: Literal["pptx"] = "pptx"


class DeckPptxExportResponse(BaseModel):
    content_base64: str = Field(alias="contentBase64")
    warnings: list[str] = Field(default_factory=list)


def export_deck_pptx(request: DeckPptxExportRequest) -> DeckPptxExportResponse:
    deck = request.deck
    presentation = Presentation()
    presentation.slide_width = Inches(float(deck["canvas"]["width"]) / 144)
    presentation.slide_height = Inches(float(deck["canvas"]["height"]) / 144)
    blank_layout = presentation.slide_layouts[6]
    warnings: list[str] = []

    for slide_data in deck.get("slides", []):
        slide = presentation.slides.add_slide(blank_layout)
        apply_slide_background(slide, slide_data, deck)
        elements = sorted(
            slide_data.get("elements", []),
            key=lambda element: int(element.get("zIndex", 0)),
        )
        for element in elements:
            if not element.get("visible", True):
                continue
            add_element(slide, element, deck, warnings)
        add_speaker_notes(slide, slide_data, warnings)

    output = BytesIO()
    presentation.save(output)
    return DeckPptxExportResponse(
        contentBase64=base64.b64encode(output.getvalue()).decode("ascii"),
        warnings=dedupe(warnings),
    )


def add_speaker_notes(
    slide: Any,
    slide_data: dict[str, Any],
    warnings: list[str],
) -> None:
    speaker_notes = str(slide_data.get("speakerNotes", "")).strip()
    if not speaker_notes:
        return
    notes_text_frame = slide.notes_slide.notes_text_frame
    if notes_text_frame is None:
        warnings.append(
            f"Skipped speaker notes for slide {slide_data.get('order', '?')}: "
            "notes placeholder is unavailable."
        )
        return
    notes_text_frame.text = speaker_notes


def apply_slide_background(slide: Any, slide_data: dict[str, Any], deck: dict[str, Any]) -> None:
    color = (
        slide_data.get("style", {}).get("backgroundColor")
        or deck.get("theme", {}).get("backgroundColor")
        or "#FFFFFF"
    )
    if not is_hex_color(color):
        return
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = rgb(color)


def add_element(
    slide: Any,
    element: dict[str, Any],
    deck: dict[str, Any],
    warnings: list[str],
) -> None:
    element_type = element.get("type")
    if element_type == "text":
        add_text(slide, element, deck)
    elif element_type in {"rect", "ellipse"}:
        add_shape(slide, element, element_type)
    elif element_type in {"line", "arrow"}:
        add_line(slide, element)
        if element_type == "arrow":
            warnings.append("Arrowheads are exported as plain lines in phase 1.")
    elif element_type == "image":
        add_image(slide, element, warnings)
    elif element_type == "chart":
        add_chart(slide, element, warnings)
    elif element_type == "table":
        add_table(slide, element)
    else:
        warnings.append(f"Skipped unsupported element type: {element_type}")


def add_text(slide: Any, element: dict[str, Any], deck: dict[str, Any]) -> None:
    props = element.get("props", {})
    shape = slide.shapes.add_textbox(
        emu_x(element),
        emu_y(element),
        emu_width(element),
        emu_height(element),
    )
    text_frame = shape.text_frame
    text_frame.clear()
    text_frame.word_wrap = True
    inset = props.get("bodyInset") or {}
    text_frame.margin_left = Inches(float(inset.get("left", 0)) / 144)
    text_frame.margin_right = Inches(float(inset.get("right", 0)) / 144)
    text_frame.margin_top = Inches(float(inset.get("top", 0)) / 144)
    text_frame.margin_bottom = Inches(float(inset.get("bottom", 0)) / 144)
    text_frame.vertical_anchor = vertical_anchor(props.get("verticalAlign", "top"))

    paragraphs = props.get("paragraphs")
    if isinstance(paragraphs, list) and paragraphs:
        for index, paragraph_payload in enumerate(paragraphs):
            paragraph = text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
            apply_paragraph(paragraph, paragraph_payload, props, deck)
        return

    paragraph = text_frame.paragraphs[0]
    paragraph.text = str(props.get("text", ""))
    apply_paragraph_style(paragraph, props)
    apply_font(paragraph.font, props, deck)


def apply_paragraph(
    paragraph: Any,
    paragraph_payload: dict[str, Any],
    fallback: dict[str, Any],
    deck: dict[str, Any],
) -> None:
    paragraph.text = ""
    apply_paragraph_style(paragraph, {**fallback, **paragraph_payload})
    runs = paragraph_payload.get("runs")
    if isinstance(runs, list) and runs:
        for run_payload in runs:
            run = paragraph.add_run()
            run.text = str(run_payload.get("text", ""))
            apply_font(run.font, {**fallback, **paragraph_payload, **run_payload}, deck)
        return
    run = paragraph.add_run()
    run.text = str(paragraph_payload.get("text", ""))
    apply_font(run.font, {**fallback, **paragraph_payload}, deck)


def apply_paragraph_style(paragraph: Any, props: dict[str, Any]) -> None:
    paragraph.alignment = paragraph_alignment(props.get("align", "left"))
    line_height = float(props.get("lineHeight", 1.2))
    paragraph.line_spacing = line_height
    bullet = props.get("bullet") or {}
    if bullet.get("enabled"):
        paragraph.text = f"{bullet.get('character', '•')} {paragraph.text}"


def apply_font(font: Any, props: dict[str, Any], deck: dict[str, Any]) -> None:
    theme = deck.get("theme", {})
    font.name = str(
        props.get("fontFamily")
        or theme.get("fontFamily")
        or theme.get("typography", {}).get("bodyFontFamily")
        or "Pretendard"
    )
    font.size = Pt(
        float(props.get("fontSize", 24))
        * POINTS_PER_INCH
        / DECK_UNITS_PER_INCH
    )
    font.bold = is_bold(props.get("fontWeight", "normal"))
    color = props.get("color") or theme.get("textColor") or "#111827"
    if is_hex_color(color):
        font.color.rgb = rgb(color)


def add_shape(slide: Any, element: dict[str, Any], element_type: str) -> None:
    shape_type = MSO_SHAPE.OVAL if element_type == "ellipse" else MSO_SHAPE.RECTANGLE
    shape = slide.shapes.add_shape(
        shape_type,
        emu_x(element),
        emu_y(element),
        emu_width(element),
        emu_height(element),
    )
    apply_fill(shape, element.get("props", {}).get("fill", "transparent"))
    apply_line(shape, element.get("props", {}))


def add_line(slide: Any, element: dict[str, Any]) -> None:
    shape = slide.shapes.add_connector(
        MSO_CONNECTOR.STRAIGHT,
        emu_x(element),
        emu_y(element),
        emu_x(element) + emu_width(element),
        emu_y(element) + emu_height(element),
    )
    apply_line(shape, element.get("props", {}))


def add_image(slide: Any, element: dict[str, Any], warnings: list[str]) -> None:
    props = element.get("props", {})
    crop = validated_image_crop(props.get("crop"))
    src = str(props.get("src", ""))
    if not src.startswith("data:image/") or ";base64," not in src:
        warnings.append("Skipped image without embedded data URL.")
        return
    _, encoded = src.split(";base64,", 1)
    picture = slide.shapes.add_picture(
        BytesIO(base64.b64decode(encoded)),
        emu_x(element),
        emu_y(element),
        width=emu_width(element),
        height=emu_height(element),
    )
    if crop is not None:
        picture.crop_left = crop["left"]
        picture.crop_top = crop["top"]
        picture.crop_right = crop["right"]
        picture.crop_bottom = crop["bottom"]


def validated_image_crop(value: Any) -> dict[str, float] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError("Invalid image crop: expected an object.")

    crop: dict[str, float] = {}
    for edge in ("left", "top", "right", "bottom"):
        raw_value = value.get(edge, 0)
        if (
            isinstance(raw_value, bool)
            or not isinstance(raw_value, (int, float))
            or not math.isfinite(raw_value)
            or raw_value < 0
            or raw_value > 1
        ):
            raise ValueError(f"Invalid image crop {edge} fraction.")
        crop[edge] = float(raw_value)

    if crop["left"] + crop["right"] >= 1:
        raise ValueError("Invalid image crop: left and right hide the full image.")
    if crop["top"] + crop["bottom"] >= 1:
        raise ValueError("Invalid image crop: top and bottom hide the full image.")
    units = image_crop_units(crop)
    return {
        "left": units["left"] / 100_000,
        "top": units["top"] / 100_000,
        "right": units["right"] / 100_000,
        "bottom": units["bottom"] / 100_000,
    }


def image_crop_units(crop: dict[str, float]) -> dict[str, int]:
    units = {
        edge: max(0, min(99_999, round(value * 100_000)))
        for edge, value in crop.items()
    }
    for first, second in (("left", "right"), ("top", "bottom")):
        overflow = units[first] + units[second] - 99_999
        if overflow > 0:
            reduction = min(units[second], overflow)
            units[second] -= reduction
            units[first] -= overflow - reduction
    return units


def add_chart(slide: Any, element: dict[str, Any], warnings: list[str]) -> None:
    props = element.get("props", {})
    chart_type = props.get("type")
    if chart_type == "scatter":
        warnings.append("Skipped unsupported scatter chart.")
        return
    data = props.get("data", [])
    if not data:
        warnings.append("Skipped chart without data.")
        return

    chart_data = CategoryChartData()  # type: ignore[no-untyped-call]
    chart_data.categories = [str(item.get("label", "")) for item in data]
    chart_data.add_series(  # type: ignore[no-untyped-call]
        str(props.get("title") or "Series"),
        [float(item.get("value", 0)) for item in data],
    )
    chart_shape_type = {
        "bar": XL_CHART_TYPE.COLUMN_CLUSTERED,
        "line": XL_CHART_TYPE.LINE,
        "pie": XL_CHART_TYPE.PIE,
        "doughnut": XL_CHART_TYPE.DOUGHNUT,
    }.get(chart_type, XL_CHART_TYPE.COLUMN_CLUSTERED)
    slide.shapes.add_chart(
        chart_shape_type,
        emu_x(element),
        emu_y(element),
        emu_width(element),
        emu_height(element),
        chart_data,
    )


def add_table(slide: Any, element: dict[str, Any]) -> None:
    rows = element.get("props", {}).get("rows") or []
    if not rows:
        return
    row_count = len(rows)
    col_count = max(len(row) for row in rows)
    table_shape = slide.shapes.add_table(
        row_count,
        col_count,
        emu_x(element),
        emu_y(element),
        emu_width(element),
        emu_height(element),
    )
    table = table_shape.table
    for row_index, row in enumerate(rows):
        for col_index, cell_payload in enumerate(row):
            cell = table.cell(row_index, col_index)
            cell.text = str(cell_payload.get("text", ""))
            fill = cell_payload.get("fill")
            if is_hex_color(fill):
                cell.fill.solid()
                cell.fill.fore_color.rgb = rgb(fill)


def apply_fill(shape: Any, fill: Any) -> None:
    if fill == "transparent":
        shape.fill.background()
        return
    if is_hex_color(fill):
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)


def apply_line(shape: Any, props: dict[str, Any]) -> None:
    stroke = props.get("stroke", "transparent")
    width = float(props.get("strokeWidth", 0))
    if width <= 0 or stroke == "transparent":
        shape.line.fill.background()
        return
    if is_hex_color(stroke):
        shape.line.color.rgb = rgb(stroke)
        shape.line.width = Pt(width)


def emu_x(element: dict[str, Any]) -> Any:
    return Inches(float(element.get("x", 0)) / 144)


def emu_y(element: dict[str, Any]) -> Any:
    return Inches(float(element.get("y", 0)) / 144)


def emu_width(element: dict[str, Any]) -> Any:
    return Inches(float(element.get("width", 1)) / 144)


def emu_height(element: dict[str, Any]) -> Any:
    return Inches(float(element.get("height", 1)) / 144)


def paragraph_alignment(value: str) -> Any:
    return {
        "center": PP_ALIGN.CENTER,
        "right": PP_ALIGN.RIGHT,
        "justify": PP_ALIGN.JUSTIFY,
    }.get(value, PP_ALIGN.LEFT)


def vertical_anchor(value: str) -> Any:
    return {
        "middle": MSO_ANCHOR.MIDDLE,
        "bottom": MSO_ANCHOR.BOTTOM,
    }.get(value, MSO_ANCHOR.TOP)


def is_bold(value: Any) -> bool:
    return value in {"bold", "semibold"} or (isinstance(value, int) and value >= 600)


def is_hex_color(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 7 and value.startswith("#")


def rgb(value: str) -> RGBColor:
    return RGBColor(  # type: ignore[no-untyped-call]
        int(value[1:3], 16),
        int(value[3:5], 16),
        int(value[5:7], 16),
    )


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
