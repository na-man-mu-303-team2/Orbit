from __future__ import annotations

import base64
from pathlib import Path
from typing import Any

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pydantic import BaseModel, ConfigDict, Field


CANVAS_WIDTH = 1920
CANVAS_HEIGHT = 1080


class ImportedDesignAsset(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    asset_id: str = Field(alias="assetId")
    file_name: str = Field(alias="fileName")
    mime_type: str = Field(alias="mimeType")
    content_base64: str = Field(alias="contentBase64")


class PptxDesignImportResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    blueprint: dict[str, Any]
    assets: list[ImportedDesignAsset] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


def import_pptx_design(path: Path, file_id: str) -> PptxDesignImportResult:
    presentation = Presentation(str(path))
    source_width_value = presentation.slide_width
    source_height_value = presentation.slide_height
    source_width = max(
        1,
        int(source_width_value) if source_width_value is not None else CANVAS_WIDTH,
    )
    source_height = max(
        1,
        int(source_height_value) if source_height_value is not None else CANVAS_HEIGHT,
    )
    scale_x = CANVAS_WIDTH / source_width
    scale_y = CANVAS_HEIGHT / source_height
    assets: list[ImportedDesignAsset] = []
    warnings: list[str] = []
    slides: list[dict[str, Any]] = []

    for slide_index, slide in enumerate(presentation.slides, start=1):
        elements: list[dict[str, Any]] = []
        background_color = slide_background_color(slide) or "#ffffff"
        elements.append(
            shape_element(
                element_id=f"el_imported_{slide_index}_background",
                role="background",
                x=0,
                y=0,
                width=CANVAS_WIDTH,
                height=CANVAS_HEIGHT,
                z_index=0,
                fill=background_color,
                stroke="transparent",
                locked=True,
            )
        )

        for shape_index, shape in enumerate(slide.shapes, start=1):
            frame = normalized_frame(shape, scale_x, scale_y)
            element_id = f"el_imported_{slide_index}_{shape_index}"
            shape_type = getattr(shape, "shape_type", None)

            if shape_type == MSO_SHAPE_TYPE.PICTURE:
                asset_id = f"image_{len(assets) + 1}"
                assets.append(image_asset(shape, asset_id))
                elements.append(
                    {
                        **element_base(
                            element_id=f"{element_id}_image",
                            role="media",
                            frame=frame,
                            z_index=shape_index + 1,
                            locked=False,
                        ),
                        "type": "image",
                        "props": {
                            "src": f"asset:{asset_id}",
                            "alt": str(getattr(shape, "name", "Imported image")),
                            "fit": "contain",
                            "focusX": 0.5,
                            "focusY": 0.5,
                        },
                    }
                )
                continue

            fill = shape_fill_color(shape)
            stroke = shape_line_color(shape)
            if fill or stroke:
                elements.append(
                    shape_element(
                        element_id=f"{element_id}_shape",
                        role="decoration",
                        x=frame["x"],
                        y=frame["y"],
                        width=frame["width"],
                        height=frame["height"],
                        z_index=shape_index + 1,
                        fill=fill or "transparent",
                        stroke=stroke or "transparent",
                        locked=True,
                    )
                )

            text = shape_text(shape)
            if text:
                elements.append(
                    {
                        **element_base(
                            element_id=f"{element_id}_text",
                            role="body",
                            frame=frame,
                            z_index=shape_index + 2,
                            locked=False,
                        ),
                        "type": "text",
                        "props": {
                            "text": text,
                            **shape_text_props(shape),
                        },
                    }
                )
            elif is_unsupported_complex_shape(shape):
                warnings.append(
                    f"Unsupported PPTX shape on slide {slide_index}: {shape_type}"
                )

        assign_text_roles(elements)
        slides.append(
            {
                "sourceFileId": file_id,
                "sourceSlideIndex": slide_index,
                "style": {
                    "layout": "title-content",
                    "backgroundColor": background_color,
                },
                "elements": elements,
            }
        )

    return PptxDesignImportResult(
        blueprint={
            "sourceFileId": file_id,
            "canvas": {
                "width": CANVAS_WIDTH,
                "height": CANVAS_HEIGHT,
            },
            "theme": imported_theme(slides),
            "slides": slides,
            "warnings": warnings,
        },
        assets=assets,
        warnings=warnings,
    )


def normalized_frame(shape: Any, scale_x: float, scale_y: float) -> dict[str, int]:
    x = max(0, round(int(getattr(shape, "left", 0)) * scale_x))
    y = max(0, round(int(getattr(shape, "top", 0)) * scale_y))
    width = max(1, round(int(getattr(shape, "width", 1)) * scale_x))
    height = max(1, round(int(getattr(shape, "height", 1)) * scale_y))
    return {
        "x": min(x, CANVAS_WIDTH - 1),
        "y": min(y, CANVAS_HEIGHT - 1),
        "width": min(width, CANVAS_WIDTH - min(x, CANVAS_WIDTH - 1)),
        "height": min(height, CANVAS_HEIGHT - min(y, CANVAS_HEIGHT - 1)),
    }


def element_base(
    *,
    element_id: str,
    role: str,
    frame: dict[str, int],
    z_index: int,
    locked: bool,
) -> dict[str, Any]:
    return {
        "elementId": element_id,
        "role": role,
        "x": frame["x"],
        "y": frame["y"],
        "width": frame["width"],
        "height": frame["height"],
        "rotation": 0,
        "opacity": 1,
        "zIndex": z_index,
        "locked": locked,
        "visible": True,
    }


def shape_element(
    *,
    element_id: str,
    role: str,
    x: int,
    y: int,
    width: int,
    height: int,
    z_index: int,
    fill: str,
    stroke: str,
    locked: bool,
) -> dict[str, Any]:
    return {
        **element_base(
            element_id=element_id,
            role=role,
            frame={"x": x, "y": y, "width": width, "height": height},
            z_index=z_index,
            locked=locked,
        ),
        "type": "rect",
        "props": {
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": 1 if stroke != "transparent" else 0,
            "borderRadius": 0,
        },
    }


def image_asset(shape: Any, asset_id: str) -> ImportedDesignAsset:
    image = shape.image
    extension = str(getattr(image, "ext", "png") or "png")
    mime_type = str(getattr(image, "content_type", f"image/{extension}"))
    return ImportedDesignAsset(
        assetId=asset_id,
        fileName=f"{asset_id}.{extension}",
        mimeType=mime_type,
        contentBase64=base64.b64encode(image.blob).decode("ascii"),
    )


def slide_background_color(slide: Any) -> str | None:
    try:
        return color_to_hex(slide.background.fill.fore_color)
    except Exception:
        return None


def shape_fill_color(shape: Any) -> str | None:
    try:
        return color_to_hex(shape.fill.fore_color)
    except Exception:
        return None


def shape_line_color(shape: Any) -> str | None:
    try:
        return color_to_hex(shape.line.color)
    except Exception:
        return None


def color_to_hex(color: Any) -> str | None:
    try:
        rgb = color.rgb
    except Exception:
        return None
    if rgb is None:
        return None
    return f"#{rgb}"


def shape_text(shape: Any) -> str:
    if not bool(getattr(shape, "has_text_frame", False)):
        return ""
    return "\n".join(
        paragraph.text.strip()
        for paragraph in shape.text_frame.paragraphs
        if paragraph.text.strip()
    )


def shape_text_props(shape: Any) -> dict[str, Any]:
    font = first_font(shape)
    return {
        "fontFamily": str(getattr(font, "name", None) or "Inter"),
        "fontSize": font_size(font),
        "fontWeight": "bold" if bool(getattr(font, "bold", False)) else "normal",
        "color": font_color(font) or "#111827",
        "align": "left",
        "verticalAlign": "top",
        "lineHeight": 1.15,
    }


def first_font(shape: Any) -> Any:
    if not bool(getattr(shape, "has_text_frame", False)):
        return None
    for paragraph in shape.text_frame.paragraphs:
        for run in paragraph.runs:
            return run.font
        return paragraph.font
    return None


def font_size(font: Any) -> int:
    size = getattr(font, "size", None)
    if size is None:
        return 24
    try:
        return max(8, round(float(size.pt)))
    except Exception:
        return 24


def font_color(font: Any) -> str | None:
    try:
        return color_to_hex(font.color)
    except Exception:
        return None


def assign_text_roles(elements: list[dict[str, Any]]) -> None:
    text_elements = [element for element in elements if element.get("type") == "text"]
    if not text_elements:
        return

    title = max(
        text_elements,
        key=lambda element: (
            int(element.get("props", {}).get("fontSize", 0)),
            -int(element.get("y", 0)),
        ),
    )
    title["role"] = "title"
    for element in text_elements:
        if element is not title:
            element["role"] = "body"


def imported_theme(slides: list[dict[str, Any]]) -> dict[str, Any]:
    first_slide = slides[0] if slides else {}
    background = str(
        first_slide.get("style", {}).get("backgroundColor", "#ffffff")
        if isinstance(first_slide.get("style"), dict)
        else "#ffffff"
    )
    return {
        "name": "Imported PPTX",
        "fontFamily": "Inter",
        "backgroundColor": background,
        "textColor": "#111827",
        "accentColor": "#2563eb",
        "palette": {
            "primary": "#2563eb",
            "secondary": "#7c3aed",
            "surface": background,
            "muted": "#f3f4f6",
            "border": "#d1d5db",
        },
        "typography": {
            "headingFontFamily": "Inter",
            "bodyFontFamily": "Inter",
            "titleSize": 56,
            "headingSize": 40,
            "bodySize": 24,
            "captionSize": 16,
        },
        "effects": {"borderRadius": 8},
    }


def is_unsupported_complex_shape(shape: Any) -> bool:
    shape_type = getattr(shape, "shape_type", None)
    return shape_type in {
        MSO_SHAPE_TYPE.CHART,
        MSO_SHAPE_TYPE.GROUP,
        MSO_SHAPE_TYPE.TABLE,
    }
