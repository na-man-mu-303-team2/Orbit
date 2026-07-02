from __future__ import annotations

import base64
from dataclasses import dataclass
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


class ImportedElementBlueprint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    element_id: str = Field(alias="elementId")
    type: str
    role: str
    x: int
    y: int
    width: int
    height: int
    rotation: float = 0
    opacity: float = 1
    z_index: int = Field(alias="zIndex")
    locked: bool = False
    visible: bool = True
    props: dict[str, Any] = Field(default_factory=dict)


class ImportedSlideBlueprint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_file_id: str = Field(default="", alias="sourceFileId")
    source_slide_index: int = Field(default=1, alias="sourceSlideIndex")
    style: dict[str, Any]
    elements: list[ImportedElementBlueprint]


class ImportedDesignBlueprint(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    source_file_id: str = Field(default="", alias="sourceFileId")
    canvas: dict[str, int] = Field(
        default_factory=lambda: {"width": CANVAS_WIDTH, "height": CANVAS_HEIGHT}
    )
    theme: dict[str, Any]
    slides: list[ImportedSlideBlueprint]
    warnings: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class ShapeTransform:
    scale_x: float = 1
    scale_y: float = 1
    translate_x: float = 0
    translate_y: float = 0

    def rect(self, x: int, y: int, width: int, height: int) -> tuple[float, float, float, float]:
        return (
            self.scale_x * x + self.translate_x,
            self.scale_y * y + self.translate_y,
            self.scale_x * width,
            self.scale_y * height,
        )

    def for_group(self, group_shape: Any) -> ShapeTransform:
        off_x, off_y, ext_x, ext_y, child_x, child_y, child_width, child_height = (
            group_transform_values(group_shape)
        )
        ratio_x = ext_x / max(1, child_width)
        ratio_y = ext_y / max(1, child_height)
        local = ShapeTransform(
            scale_x=ratio_x,
            scale_y=ratio_y,
            translate_x=off_x - child_x * ratio_x,
            translate_y=off_y - child_y * ratio_y,
        )
        return ShapeTransform(
            scale_x=self.scale_x * local.scale_x,
            scale_y=self.scale_y * local.scale_y,
            translate_x=self.scale_x * local.translate_x + self.translate_x,
            translate_y=self.scale_y * local.translate_y + self.translate_y,
        )


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
        z_cursor = [1]
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

        for source_name, source_shapes in inherited_decoration_sources(slide):
            append_shape_collection(
                source_shapes,
                slide_index=slide_index,
                path_prefix=source_name,
                elements=elements,
                assets=assets,
                warnings=warnings,
                scale_x=scale_x,
                scale_y=scale_y,
                z_cursor=z_cursor,
                transform=ShapeTransform(),
                decoration_only=True,
            )

        z_cursor[0] = max(z_cursor[0], 100)
        append_shape_collection(
            slide.shapes,
            slide_index=slide_index,
            path_prefix="slide",
            elements=elements,
            assets=assets,
            warnings=warnings,
            scale_x=scale_x,
            scale_y=scale_y,
            z_cursor=z_cursor,
            transform=ShapeTransform(),
            decoration_only=False,
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

    blueprint = ImportedDesignBlueprint.model_validate(
        {
            "sourceFileId": file_id,
            "canvas": {
                "width": CANVAS_WIDTH,
                "height": CANVAS_HEIGHT,
            },
            "theme": imported_theme(slides),
            "slides": slides,
            "warnings": warnings,
        }
    )
    return PptxDesignImportResult(
        blueprint=blueprint.model_dump(by_alias=True),
        assets=assets,
        warnings=warnings,
    )


def append_shape_collection(
    shapes: Any,
    *,
    slide_index: int,
    path_prefix: str,
    elements: list[dict[str, Any]],
    assets: list[ImportedDesignAsset],
    warnings: list[str],
    scale_x: float,
    scale_y: float,
    z_cursor: list[int],
    transform: ShapeTransform,
    decoration_only: bool,
) -> None:
    for shape_index, shape in enumerate(shapes, start=1):
        append_shape_elements(
            shape,
            slide_index=slide_index,
            element_path=f"{path_prefix}_{shape_index}",
            elements=elements,
            assets=assets,
            warnings=warnings,
            scale_x=scale_x,
            scale_y=scale_y,
            z_cursor=z_cursor,
            transform=transform,
            decoration_only=decoration_only,
        )


def append_shape_elements(
    shape: Any,
    *,
    slide_index: int,
    element_path: str,
    elements: list[dict[str, Any]],
    assets: list[ImportedDesignAsset],
    warnings: list[str],
    scale_x: float,
    scale_y: float,
    z_cursor: list[int],
    transform: ShapeTransform,
    decoration_only: bool,
) -> None:
    if decoration_only and bool(getattr(shape, "is_placeholder", False)):
        return

    shape_type = getattr(shape, "shape_type", None)
    if shape_type == MSO_SHAPE_TYPE.GROUP:
        append_shape_collection(
            getattr(shape, "shapes", []),
            slide_index=slide_index,
            path_prefix=element_path,
            elements=elements,
            assets=assets,
            warnings=warnings,
            scale_x=scale_x,
            scale_y=scale_y,
            z_cursor=z_cursor,
            transform=transform.for_group(shape),
            decoration_only=decoration_only,
        )
        return

    frame = normalized_frame(shape, scale_x, scale_y, transform)
    element_id = f"el_imported_{slide_index}_{element_path}"
    locked = decoration_only
    role = "decoration" if decoration_only else "media"

    if shape_type == MSO_SHAPE_TYPE.PICTURE:
        asset_id = f"image_{len(assets) + 1}"
        assets.append(image_asset(shape, asset_id))
        elements.append(
            {
                **element_base(
                    element_id=f"{element_id}_image",
                    role=role,
                    frame=frame,
                    z_index=next_z(z_cursor),
                    locked=locked,
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
        return

    if shape_type == MSO_SHAPE_TYPE.TABLE and not decoration_only:
        elements.extend(table_elements(shape, element_id, frame, z_cursor))
        return

    fill = shape_fill_color(shape)
    stroke = shape_line_color(shape)
    if shape_type == MSO_SHAPE_TYPE.FREEFORM:
        custom_shape = freeform_element(
            shape,
            element_id=f"{element_id}_custom",
            frame=frame,
            z_index=next_z(z_cursor),
            fill=fill or "transparent",
            stroke=stroke or "transparent",
            locked=locked,
        )
        if custom_shape is not None:
            elements.append(custom_shape)
        else:
            warnings.append(
                f"Unsupported PPTX freeform path on slide {slide_index}: {getattr(shape, 'name', 'freeform')}"
            )
            append_fallback_shape(elements, element_id, frame, z_cursor, fill, stroke, locked)
    elif fill or stroke:
        append_fallback_shape(elements, element_id, frame, z_cursor, fill, stroke, locked)

    text = "" if decoration_only else shape_text(shape)
    if text:
        elements.append(
            {
                **element_base(
                    element_id=f"{element_id}_text",
                    role="body",
                    frame=frame,
                    z_index=next_z(z_cursor),
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
        warnings.append(f"Unsupported PPTX shape on slide {slide_index}: {shape_type}")


def append_fallback_shape(
    elements: list[dict[str, Any]],
    element_id: str,
    frame: dict[str, int],
    z_cursor: list[int],
    fill: str | None,
    stroke: str | None,
    locked: bool,
) -> None:
    elements.append(
        shape_element(
            element_id=f"{element_id}_shape",
            role="decoration",
            x=frame["x"],
            y=frame["y"],
            width=frame["width"],
            height=frame["height"],
            z_index=next_z(z_cursor),
            fill=fill or "transparent",
            stroke=stroke or "transparent",
            locked=locked,
        )
    )


def next_z(z_cursor: list[int]) -> int:
    z_index = z_cursor[0]
    z_cursor[0] += 1
    return z_index


def normalized_frame(
    shape: Any,
    scale_x: float,
    scale_y: float,
    transform: ShapeTransform | None = None,
) -> dict[str, int]:
    transformer = transform or ShapeTransform()
    raw_x, raw_y, raw_width, raw_height = transformer.rect(
        int(getattr(shape, "left", 0)),
        int(getattr(shape, "top", 0)),
        int(getattr(shape, "width", 1)),
        int(getattr(shape, "height", 1)),
    )
    x = max(0, round(raw_x * scale_x))
    y = max(0, round(raw_y * scale_y))
    width = max(1, round(raw_width * scale_x))
    height = max(1, round(raw_height * scale_y))
    return {
        "x": min(x, CANVAS_WIDTH - 1),
        "y": min(y, CANVAS_HEIGHT - 1),
        "width": min(width, CANVAS_WIDTH - min(x, CANVAS_WIDTH - 1)),
        "height": min(height, CANVAS_HEIGHT - min(y, CANVAS_HEIGHT - 1)),
    }


def group_transform_values(group_shape: Any) -> tuple[int, int, int, int, int, int, int, int]:
    fallback_x = int(getattr(group_shape, "left", 0))
    fallback_y = int(getattr(group_shape, "top", 0))
    fallback_width = max(1, int(getattr(group_shape, "width", 1)))
    fallback_height = max(1, int(getattr(group_shape, "height", 1)))
    xfrm = first_descendant(group_shape._element, "xfrm")
    if xfrm is None:
        return (
            fallback_x,
            fallback_y,
            fallback_width,
            fallback_height,
            fallback_x,
            fallback_y,
            fallback_width,
            fallback_height,
        )

    off = first_child(xfrm, "off")
    ext = first_child(xfrm, "ext")
    child_off = first_child(xfrm, "chOff")
    child_ext = first_child(xfrm, "chExt")
    return (
        int_attr(off, "x", fallback_x),
        int_attr(off, "y", fallback_y),
        int_attr(ext, "cx", fallback_width),
        int_attr(ext, "cy", fallback_height),
        int_attr(child_off, "x", fallback_x),
        int_attr(child_off, "y", fallback_y),
        int_attr(child_ext, "cx", fallback_width),
        int_attr(child_ext, "cy", fallback_height),
    )


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


def table_elements(
    shape: Any,
    element_id: str,
    frame: dict[str, int],
    z_cursor: list[int],
) -> list[dict[str, Any]]:
    table = shape.table
    column_widths = [max(1, int(column.width)) for column in table.columns]
    row_heights = [max(1, int(row.height)) for row in table.rows]
    total_width = max(1, sum(column_widths))
    total_height = max(1, sum(row_heights))
    elements: list[dict[str, Any]] = []

    y = frame["y"]
    for row_index, row in enumerate(table.rows):
        row_height = max(1, round(frame["height"] * row_heights[row_index] / total_height))
        x = frame["x"]
        for column_index, cell in enumerate(row.cells):
            column_width = max(
                1,
                round(frame["width"] * column_widths[column_index] / total_width),
            )
            if not bool(getattr(cell, "is_spanned", False)):
                cell_frame = {
                    "x": min(x, CANVAS_WIDTH - 1),
                    "y": min(y, CANVAS_HEIGHT - 1),
                    "width": min(column_width, CANVAS_WIDTH - min(x, CANVAS_WIDTH - 1)),
                    "height": min(row_height, CANVAS_HEIGHT - min(y, CANVAS_HEIGHT - 1)),
                }
                fill = cell_fill_color(cell) or "#ffffff"
                elements.append(
                    shape_element(
                        element_id=f"{element_id}_cell_{row_index + 1}_{column_index + 1}",
                        role="decoration",
                        x=cell_frame["x"],
                        y=cell_frame["y"],
                        width=cell_frame["width"],
                        height=cell_frame["height"],
                        z_index=next_z(z_cursor),
                        fill=fill,
                        stroke="#d1d5db",
                        locked=True,
                    )
                )
                text = text_frame_text(cell.text_frame)
                if text:
                    elements.append(
                        {
                            **element_base(
                                element_id=f"{element_id}_cell_{row_index + 1}_{column_index + 1}_text",
                                role="body",
                                frame={
                                    "x": cell_frame["x"] + 8,
                                    "y": cell_frame["y"] + 6,
                                    "width": max(1, cell_frame["width"] - 16),
                                    "height": max(1, cell_frame["height"] - 12),
                                },
                                z_index=next_z(z_cursor),
                                locked=False,
                            ),
                            "type": "text",
                            "props": {
                                "text": text,
                                **text_frame_text_props(cell.text_frame),
                            },
                        }
                    )
            x += column_width
        y += row_height
    return elements


def freeform_element(
    shape: Any,
    *,
    element_id: str,
    frame: dict[str, int],
    z_index: int,
    fill: str,
    stroke: str,
    locked: bool,
) -> dict[str, Any] | None:
    path = custom_geometry_path(shape)
    if path is None:
        return None
    path_data, view_box_width, view_box_height, nodes = path
    return {
        **element_base(
            element_id=element_id,
            role="decoration",
            frame=frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": "customShape",
        "props": {
            "pathData": path_data,
            "viewBoxWidth": view_box_width,
            "viewBoxHeight": view_box_height,
            "fill": fill,
            "stroke": stroke,
            "strokeWidth": 1 if stroke != "transparent" else 0,
            "closed": path_data.rstrip().endswith("Z"),
            "nodes": nodes,
        },
    }


def custom_geometry_path(shape: Any) -> tuple[str, int, int, list[dict[str, Any]]] | None:
    custom_geometry = first_descendant(shape._element, "custGeom")
    if custom_geometry is None:
        return None
    path_list = first_descendant(custom_geometry, "pathLst")
    if path_list is None:
        return None

    segments: list[str] = []
    nodes: list[dict[str, Any]] = []
    view_box_width = 0
    view_box_height = 0
    uses_curves = False
    for path in direct_children(path_list, "path"):
        view_box_width = max(view_box_width, int_attr(path, "w", 0))
        view_box_height = max(view_box_height, int_attr(path, "h", 0))
        for command in list(path):
            name = local_name(command)
            points = [point_xy(point) for point in direct_children(command, "pt")]
            if name == "moveTo" and len(points) == 1:
                x, y = points[0]
                segments.append(f"M {x} {y}")
                if not uses_curves:
                    nodes.append({"x": x, "y": y, "mode": "corner"})
            elif name == "lnTo" and len(points) == 1:
                x, y = points[0]
                segments.append(f"L {x} {y}")
                if not uses_curves:
                    nodes.append({"x": x, "y": y, "mode": "corner"})
            elif name == "quadBezTo" and len(points) == 2:
                uses_curves = True
                (x1, y1), (x, y) = points
                segments.append(f"Q {x1} {y1} {x} {y}")
            elif name == "cubicBezTo" and len(points) == 3:
                uses_curves = True
                (x1, y1), (x2, y2), (x, y) = points
                segments.append(f"C {x1} {y1} {x2} {y2} {x} {y}")
            elif name == "close":
                segments.append("Z")
            else:
                return None

    path_data = " ".join(segments).strip()
    if not path_data:
        return None
    if uses_curves:
        nodes = []
    return (
        path_data,
        max(1, view_box_width or int(getattr(shape, "width", 1))),
        max(1, view_box_height or int(getattr(shape, "height", 1))),
        nodes,
    )


def inherited_decoration_sources(slide: Any) -> list[tuple[str, Any]]:
    sources: list[tuple[str, Any]] = []
    layout = getattr(slide, "slide_layout", None)
    master = getattr(layout, "slide_master", None) if layout is not None else None
    if master is not None:
        sources.append(("master", master.shapes))
    if layout is not None:
        sources.append(("layout", layout.shapes))
    return sources


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


def cell_fill_color(cell: Any) -> str | None:
    try:
        return color_to_hex(cell.fill.fore_color)
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
    return text_frame_text(shape.text_frame)


def text_frame_text(text_frame: Any) -> str:
    return "\n".join(
        paragraph.text.strip()
        for paragraph in text_frame.paragraphs
        if paragraph.text.strip()
    )


def shape_text_props(shape: Any) -> dict[str, Any]:
    font = first_font(shape.text_frame if bool(getattr(shape, "has_text_frame", False)) else None)
    return text_props_for_font(font)


def text_frame_text_props(text_frame: Any) -> dict[str, Any]:
    return text_props_for_font(first_font(text_frame))


def text_props_for_font(font: Any) -> dict[str, Any]:
    return {
        "fontFamily": str(getattr(font, "name", None) or "Inter"),
        "fontSize": font_size(font),
        "fontWeight": "bold" if bool(getattr(font, "bold", False)) else "normal",
        "color": font_color(font) or "#111827",
        "align": "left",
        "verticalAlign": "top",
        "lineHeight": 1.15,
    }


def first_font(text_frame: Any) -> Any:
    if text_frame is None:
        return None
    for paragraph in text_frame.paragraphs:
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
    unsupported = {MSO_SHAPE_TYPE.CHART}
    diagram = getattr(MSO_SHAPE_TYPE, "DIAGRAM", None)
    if diagram is not None:
        unsupported.add(diagram)
    return shape_type in unsupported


def first_descendant(element: Any, name: str) -> Any | None:
    for candidate in element.iter():
        if local_name(candidate) == name:
            return candidate
    return None


def first_child(element: Any, name: str) -> Any | None:
    for candidate in list(element):
        if local_name(candidate) == name:
            return candidate
    return None


def direct_children(element: Any, name: str) -> list[Any]:
    return [candidate for candidate in list(element) if local_name(candidate) == name]


def local_name(element: Any) -> str:
    tag = getattr(element, "tag", element)
    return str(tag).rsplit("}", maxsplit=1)[-1]


def int_attr(element: Any | None, name: str, fallback: int) -> int:
    if element is None:
        return fallback
    try:
        return int(element.get(name))
    except Exception:
        return fallback


def point_xy(point: Any) -> tuple[int, int]:
    return int_attr(point, "x", 0), int_attr(point, "y", 0)
