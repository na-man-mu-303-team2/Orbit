from __future__ import annotations

import base64
import math
import os
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from app.ai.pptx_design_importer import (
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    ImportedDesignAsset,
    ImportedDesignBlueprint,
    PptxDesignImportResult,
    assign_text_roles,
    average_image_color,
    build_quality_report,
    build_template_blueprint,
    imported_slide_style,
    imported_theme,
    import_pptx_design,
    preset_custom_shape_path,
)

PML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"

SLIDE_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
)
SLIDE_LAYOUT_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
)
SLIDE_MASTER_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
)
IMAGE_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
)
THEME_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
)
VECTOR_IMPORT_FLAG = "ORBIT_PPTX_OOXML_VECTOR_IMPORT"
DEFAULT_TEXT_BODY_HORIZONTAL_INSET_EMU = 91440
DEFAULT_TEXT_BODY_VERTICAL_INSET_EMU = 45720
DEFAULT_PPTX_FONT_FAMILY = "Aptos, Calibri, Arial, sans-serif"
FALLBACK_SCHEME_COLORS = {
    "bg1": "#FFFFFF",
    "tx1": "#111827",
    "bg2": "#FFFFFF",
    "tx2": "#111827",
    "accent1": "#2563EB",
    "accent2": "#7C3AED",
    "accent3": "#0EA5E9",
    "accent4": "#10B981",
    "accent5": "#F59E0B",
    "accent6": "#EF4444",
    "dk1": "#111827",
    "lt1": "#FFFFFF",
    "dk2": "#111827",
    "lt2": "#FFFFFF",
}
SCHEME_COLOR_ALIASES = {
    "bg1": "lt1",
    "tx1": "dk1",
    "bg2": "lt2",
    "tx2": "dk2",
}


def import_pptx_design_with_optional_ooxml_vector(
    path: Path,
    file_id: str,
    *,
    canvas_width: int = CANVAS_WIDTH,
    canvas_height: int = CANVAS_HEIGHT,
) -> PptxDesignImportResult:
    if ooxml_vector_import_disabled():
        return import_pptx_design(
            path,
            file_id,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )

    try:
        return import_pptx_ooxml_visual_tree(
            path,
            file_id,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )
    except Exception as error:
        fallback = import_pptx_design(
            path,
            file_id,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
        )
        warning = f"OOXML visual tree importer failed; python-pptx fallback used: {error}"
        fallback.warnings.insert(0, warning)
        fallback.blueprint.setdefault("warnings", fallback.warnings)
        if isinstance(fallback.blueprint["warnings"], list):
            fallback.blueprint["warnings"].insert(0, warning)
        return fallback


def ooxml_vector_import_disabled() -> bool:
    return os.getenv(VECTOR_IMPORT_FLAG, "true").strip().lower() in {
        "0",
        "false",
        "no",
        "off",
    }


@dataclass(frozen=True)
class OoxmlScale:
    canvas_width: int
    canvas_height: int
    slide_width_emu: int
    slide_height_emu: int

    @property
    def scale_x(self) -> float:
        return self.canvas_width / max(1, self.slide_width_emu)

    @property
    def scale_y(self) -> float:
        return self.canvas_height / max(1, self.slide_height_emu)

    @property
    def average_scale(self) -> float:
        return (self.scale_x + self.scale_y) / 2


@dataclass(frozen=True)
class OoxmlTransform:
    scale_x: float = 1
    scale_y: float = 1
    translate_x: float = 0
    translate_y: float = 0

    def rect(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
    ) -> tuple[float, float, float, float]:
        return (
            self.scale_x * x + self.translate_x,
            self.scale_y * y + self.translate_y,
            self.scale_x * width,
            self.scale_y * height,
        )

    def for_group(self, group: ET.Element[Any]) -> OoxmlTransform:
        xfrm = first_local_descendant(group, "xfrm")
        if xfrm is None:
            return self

        off = first_local_child(xfrm, "off")
        ext = first_local_child(xfrm, "ext")
        child_off = first_local_child(xfrm, "chOff")
        child_ext = first_local_child(xfrm, "chExt")
        off_x = int_attr(off, "x", 0)
        off_y = int_attr(off, "y", 0)
        ext_x = int_attr(ext, "cx", 1)
        ext_y = int_attr(ext, "cy", 1)
        child_x = int_attr(child_off, "x", 0)
        child_y = int_attr(child_off, "y", 0)
        child_width = int_attr(child_ext, "cx", ext_x)
        child_height = int_attr(child_ext, "cy", ext_y)
        ratio_x = ext_x / max(1, child_width)
        ratio_y = ext_y / max(1, child_height)
        local = OoxmlTransform(
            scale_x=ratio_x,
            scale_y=ratio_y,
            translate_x=off_x - child_x * ratio_x,
            translate_y=off_y - child_y * ratio_y,
        )
        return OoxmlTransform(
            scale_x=self.scale_x * local.scale_x,
            scale_y=self.scale_y * local.scale_y,
            translate_x=self.scale_x * local.translate_x + self.translate_x,
            translate_y=self.scale_y * local.translate_y + self.translate_y,
        )


@dataclass
class OoxmlImportState:
    assets: list[ImportedDesignAsset]
    asset_colors: dict[str, str]
    theme_colors: dict[str, str]
    warnings: list[str]
    z_cursor: int = 1

    def next_z(self) -> int:
        value = self.z_cursor
        self.z_cursor += 1
        return value


def import_pptx_ooxml_visual_tree(
    path: Path,
    file_id: str,
    *,
    canvas_width: int = CANVAS_WIDTH,
    canvas_height: int = CANVAS_HEIGHT,
) -> PptxDesignImportResult:
    canvas_width = max(1, int(canvas_width))
    canvas_height = max(1, int(canvas_height))

    with zipfile.ZipFile(path, "r") as package:
        slide_width, slide_height = presentation_size_emu(package)
        scale = OoxmlScale(
            canvas_width=canvas_width,
            canvas_height=canvas_height,
            slide_width_emu=slide_width,
            slide_height_emu=slide_height,
        )
        slide_parts = presentation_slide_parts(package)
        content_types = content_type_map(package)
        state = OoxmlImportState(
            assets=[],
            asset_colors={},
            theme_colors=theme_color_map(package),
            warnings=[],
        )
        slides: list[dict[str, Any]] = []
        slot_sources_by_slide: list[dict[str, dict[str, Any]]] = []

        for slide_index, slide_part in enumerate(slide_parts, start=1):
            slide = read_xml(package, slide_part)
            if slide is None:
                state.warnings.append(f"OOXML slide part missing: {slide_part}")
                continue
            slide_rels = relationships_for_part(package, slide_part)
            layout_part = relationship_target_by_type(
                slide_part,
                slide_rels,
                SLIDE_LAYOUT_REL_TYPE,
            )
            layout = read_xml(package, layout_part) if layout_part else None
            layout_rels = (
                relationships_for_part(package, layout_part) if layout_part else {}
            )
            master_part = (
                relationship_target_by_type(
                    layout_part,
                    layout_rels,
                    SLIDE_MASTER_REL_TYPE,
                )
                if layout_part
                else None
            )
            master = read_xml(package, master_part) if master_part else None
            placeholder_frames = placeholder_frame_map(layout, scale)
            elements: list[dict[str, Any]] = [
                background_element(slide_index, canvas_width, canvas_height)
            ]
            slot_sources: dict[str, dict[str, Any]] = {}

            for source_name, part, root in (
                ("master", master_part, master),
                ("layout", layout_part, layout),
                ("slide", slide_part, slide),
            ):
                if part is None or root is None:
                    continue
                if source_name == "master" and not slide_shows_master_shapes(slide):
                    continue
                append_visual_tree(
                    package=package,
                    content_types=content_types,
                    part_path=part,
                    root=root,
                    slide_index=slide_index,
                    source_name=source_name,
                    scale=scale,
                    transform=OoxmlTransform(),
                    state=state,
                    elements=elements,
                    slot_sources=slot_sources,
                    placeholder_frames=placeholder_frames,
                    locked=source_name != "slide",
                )

            assign_text_roles(elements)
            background = slide_background_color(slide, state.theme_colors) or "#FFFFFF"
            slides.append(
                {
                    "sourceFileId": file_id,
                    "sourceSlideIndex": slide_index,
                    "style": imported_slide_style(elements, background),
                    "elements": elements,
                }
            )
            slot_sources_by_slide.append(slot_sources)

        blueprint = ImportedDesignBlueprint.model_validate(
            {
                "sourceFileId": file_id,
                "canvas": {
                    "width": canvas_width,
                    "height": canvas_height,
                },
                "theme": imported_theme(slides),
                "slides": slides,
                "warnings": state.warnings,
            }
        )
        return PptxDesignImportResult(
            blueprint=blueprint.model_dump(by_alias=True),
            templateBlueprint=build_template_blueprint(
                file_id,
                slides,
                slot_sources_by_slide,
            ),
            qualityReport=build_quality_report(slides, state.warnings),
            assets=state.assets,
            warnings=state.warnings,
        )


def append_visual_tree(
    *,
    package: zipfile.ZipFile,
    content_types: dict[str, str],
    part_path: str,
    root: ET.Element[Any],
    slide_index: int,
    source_name: str,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    shape_tree = first_local_descendant(root, "spTree")
    if shape_tree is None:
        return
    rels = relationships_for_part(package, part_path)

    for child_index, child in enumerate(list(shape_tree), start=1):
        tag = local_name(child)
        if tag == "grpSp":
            append_group_shape(
                package=package,
                content_types=content_types,
                part_path=part_path,
                group=child,
                slide_index=slide_index,
                source_name=source_name,
                child_index=child_index,
                scale=scale,
                transform=transform,
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )
            continue
        if tag == "graphicFrame":
            if locked and placeholder_key(child) is not None:
                continue
            append_graphic_frame(
                package=package,
                part_path=part_path,
                frame_element=child,
                slide_index=slide_index,
                source_name=source_name,
                child_index=child_index,
                scale=scale,
                transform=transform,
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )
            continue
        if tag not in {"sp", "pic", "cxnSp"}:
            if tag not in {"nvGrpSpPr", "grpSpPr"}:
                state.warnings.append(
                    f"Unsupported OOXML shape tree item on slide {slide_index}: {tag}"
                )
            continue

        if locked and placeholder_key(child) is not None:
            continue

        append_shape(
            package=package,
            content_types=content_types,
            rels=rels,
            part_path=part_path,
            shape=child,
            slide_index=slide_index,
            source_name=source_name,
            child_index=child_index,
            scale=scale,
            transform=transform,
            state=state,
            elements=elements,
            slot_sources=slot_sources,
            placeholder_frames=placeholder_frames,
            locked=locked,
        )


def append_graphic_frame(
    *,
    package: zipfile.ZipFile,
    part_path: str,
    frame_element: ET.Element[Any],
    slide_index: int,
    source_name: str,
    child_index: int,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    shape_id = shape_identifier(frame_element, child_index)
    frame = shape_frame(frame_element, scale, transform, placeholder_frames)
    if frame is None:
        state.warnings.append(
            f"OOXML graphicFrame has no resolved transform on slide {slide_index}: {shape_id}"
        )
        return

    frame_kind = graphic_frame_kind(frame_element)
    source = shape_source(frame_element, part_path, shape_id, source_name, locked)
    if frame_kind == "table":
        element = table_element(
            frame_element=frame_element,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            scale=scale,
            z_index=state.next_z(),
            locked=locked,
            theme_colors=state.theme_colors,
        )
        if element:
            source["type"] = "table"
            elements.append(element)
            slot_sources[str(element["elementId"])] = source
            return
    if frame_kind == "chart":
        element = chart_element(
            package=package,
            part_path=part_path,
            frame_element=frame_element,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            z_index=state.next_z(),
            locked=locked,
        )
        if element:
            source["type"] = "chart"
            elements.append(element)
            slot_sources[str(element["elementId"])] = source
            return

    reason = f"unsupported {frame_kind} graphicFrame"
    source["type"] = "unknown"
    source["fallbackReason"] = reason
    fallback_element = shape_fallback_image_element(
        shape=frame_element,
        slide_index=slide_index,
        source_name=source_name,
        shape_id=shape_id,
        frame=frame,
        z_index=state.next_z(),
        locked=locked,
        reason=reason,
    )
    elements.append(fallback_element)
    slot_sources[str(fallback_element["elementId"])] = source
    state.warnings.append(
        f"OOXML graphicFrame rendered as image fallback on slide {slide_index}: {frame_kind}"
    )


def chart_element(
    *,
    package: zipfile.ZipFile,
    part_path: str,
    frame_element: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    z_index: int,
    locked: bool,
) -> dict[str, Any] | None:
    chart_ref = first_local_descendant(frame_element, "chart")
    relationship_id = attr_by_local_name(chart_ref, "id")
    if not relationship_id:
        return None
    rel = relationships_for_part(package, part_path).get(relationship_id)
    if not rel:
        return None
    chart_part = resolve_part_path(part_path, rel.get("Target", ""))
    chart = read_xml(package, chart_part)
    if chart is None:
        return None
    chart_type = chart_type_value(chart)
    data = chart_data(chart, chart_type)
    if not data:
        return None
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "chart"),
            role="chart",
            frame=frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": "chart",
        "props": {
            "type": chart_type,
            "title": chart_title(chart),
            "data": data,
            "style": {
                "colors": ["#4F81BD", "#C0504D", "#9BBB59", "#8064A2"],
                "showLegend": True,
                "legendPosition": "bottom",
                "showDataLabels": False,
                "showGrid": True,
                "xAxisTitle": "",
                "yAxisTitle": "",
                "unit": "",
            },
        },
    }


def chart_type_value(chart: ET.Element[Any]) -> str:
    if first_local_descendant(chart, "lineChart") is not None:
        return "line"
    if first_local_descendant(chart, "pieChart") is not None:
        return "pie"
    if first_local_descendant(chart, "doughnutChart") is not None:
        return "doughnut"
    return "bar"


def chart_title(chart: ET.Element[Any]) -> str:
    title = first_local_descendant(chart, "title")
    if title is None:
        return ""
    return "".join(node.text or "" for node in title.iter() if local_name(node) == "t")


def chart_data(chart: ET.Element[Any], chart_type: str) -> list[dict[str, Any]]:
    series = first_local_descendant(chart, "ser")
    if series is None:
        return []
    labels = chart_labels(series)
    values = chart_values(series)
    result: list[dict[str, Any]] = []
    for index, value in enumerate(values):
        label = labels[index] if index < len(labels) else f"Item {index + 1}"
        result.append({"label": label, "value": value})
    if chart_type in {"pie", "doughnut"}:
        return [{"label": item["label"], "value": max(0, item["value"])} for item in result]
    return result


def chart_labels(series: ET.Element[Any]) -> list[str]:
    category = first_local_child(series, "cat")
    cache = first_local_descendant(category, "strCache")
    if cache is None:
        cache = first_local_descendant(category, "numCache")
    return chart_cache_values(cache)


def chart_values(series: ET.Element[Any]) -> list[float]:
    values = first_local_child(series, "val")
    cache = first_local_descendant(values, "numCache")
    result: list[float] = []
    for value in chart_cache_values(cache):
        try:
            result.append(float(value))
        except ValueError:
            result.append(0)
    return result


def chart_cache_values(cache: ET.Element[Any] | None) -> list[str]:
    if cache is None:
        return []
    points = [
        point
        for point in direct_local_children(cache, "pt")
        if first_local_child(point, "v") is not None
    ]
    points.sort(key=lambda point: int_attr(point, "idx", 0))
    return [str(first_local_child(point, "v").text or "") for point in points]


def table_element(
    *,
    frame_element: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    scale: OoxmlScale,
    z_index: int,
    locked: bool,
    theme_colors: dict[str, str],
) -> dict[str, Any] | None:
    table = first_local_descendant(frame_element, "tbl")
    if table is None:
        return None
    rows = table_rows(table, scale, theme_colors)
    if not rows:
        return None
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "table"),
            role="table",
            frame=frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": "table",
        "props": {
            "rows": rows,
            "columnWidths": table_column_widths(table, scale),
            "rowHeights": table_row_heights(table, scale),
            "borderColor": "#CBD5E1",
            "borderWidth": 1,
        },
    }


def table_rows(
    table: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> list[list[dict[str, Any]]]:
    rows: list[list[dict[str, Any]]] = []
    for row_index, row in enumerate(direct_local_children(table, "tr")):
        cells = [
            table_cell(cell, row_index, scale, theme_colors)
            for cell in direct_local_children(row, "tc")
        ]
        if cells:
            rows.append(cells)
    return rows


def table_cell(
    cell: ET.Element[Any],
    row_index: int,
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> dict[str, Any]:
    body = first_local_child(cell, "txBody")
    runs = text_runs(body, scale, theme_colors) if body is not None else []
    text = "".join(str(run.get("text", "")) for run in runs)
    tc_pr = first_local_child(cell, "tcPr")
    border_color, border_width = table_cell_border(tc_pr, scale, theme_colors)
    explicit_fill = solid_color(first_local_child(tc_pr, "solidFill"), theme_colors)
    default_fill, default_text_color = default_table_cell_colors(row_index)
    props: dict[str, Any] = {
        "text": text,
        "fill": explicit_fill or default_fill,
        "textColor": default_text_color,
        "fontSize": 32,
        "fontWeight": "normal",
        "align": paragraph_align(body) if body is not None else "left",
        "verticalAlign": text_vertical_align(body) if body is not None else "middle",
        "borderColor": border_color,
        "borderWidth": border_width,
        "colSpan": max(1, int_attr(tc_pr, "gridSpan", 1)),
        "rowSpan": max(1, int_attr(tc_pr, "rowSpan", 1)),
    }
    first_run = next((run for run in runs if str(run.get("text", "")).strip()), None)
    if first_run:
        if first_run.get("fontFamily"):
            props["fontFamily"] = first_run["fontFamily"]
        if first_run.get("fontSize"):
            props["fontSize"] = first_run["fontSize"]
        if first_run.get("fontWeight"):
            props["fontWeight"] = first_run["fontWeight"]
        if first_run.get("color"):
            props["textColor"] = first_run["color"]
    return props


def default_table_cell_colors(row_index: int) -> tuple[str, str]:
    if row_index == 0:
        return "#4F81BD", "#FFFFFF"
    if row_index % 2 == 1:
        return "#D0D8E8", "#000000"
    return "#E9EDF5", "#000000"


def table_column_widths(table: ET.Element[Any], scale: OoxmlScale) -> list[int]:
    grid = first_local_child(table, "tblGrid")
    return [
        max(1, round(int_attr(column, "w", 1) * scale.scale_x))
        for column in direct_local_children(grid, "gridCol")
    ] if grid is not None else []


def table_row_heights(table: ET.Element[Any], scale: OoxmlScale) -> list[int]:
    return [
        max(1, round(int_attr(row, "h", 1) * scale.scale_y))
        for row in direct_local_children(table, "tr")
    ]


def table_cell_border(
    tc_pr: ET.Element[Any] | None,
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> tuple[str, float]:
    for border_name in ("lnL", "lnR", "lnT", "lnB"):
        border = first_local_child(tc_pr, border_name)
        if border is None:
            continue
        return (
            solid_color(first_local_child(border, "solidFill"), theme_colors)
            or "#CBD5E1",
            round(max(0, int_attr(border, "w", 12700) * scale.average_scale), 2),
        )
    return "#FFFFFF", 1


def append_group_shape(
    *,
    package: zipfile.ZipFile,
    content_types: dict[str, str],
    part_path: str,
    group: ET.Element[Any],
    slide_index: int,
    source_name: str,
    child_index: int,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    group_id = shape_identifier(group, child_index)
    group_transform = transform.for_group(group)
    group_frame = shape_frame(
        group,
        scale,
        transform,
        placeholder_frames,
    ) or group_visual_frame(
        group,
        scale,
        group_transform,
        state.theme_colors,
        placeholder_frames,
    )
    if group_frame is not None and group_has_visual_content(
        group,
        scale,
        group_transform,
        state.theme_colors,
        placeholder_frames,
    ):
        source = shape_source(group, part_path, group_id, source_name, locked)
        source["fallbackReason"] = "group visual fallback"
        fallback_element = shape_fallback_image_element(
            shape=group,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=group_id,
            frame=group_frame,
            z_index=state.next_z(),
            locked=locked,
            reason="group visual fallback",
        )
        elements.append(fallback_element)
        slot_sources[str(fallback_element["elementId"])] = source
        state.warnings.append(
            f"OOXML group rendered as image fallback on slide {slide_index}: {group_id}"
        )
        append_group_text_elements(
            part_path=part_path,
            group=group,
            slide_index=slide_index,
            source_name=source_name,
            scale=scale,
            transform=group_transform,
            state=state,
            elements=elements,
            slot_sources=slot_sources,
            placeholder_frames=placeholder_frames,
            locked=locked,
        )
        return

    rels = relationships_for_part(package, part_path)
    for child_index, child in enumerate(list(group), start=1):
        tag = local_name(child)
        if tag == "grpSp":
            append_group_shape(
                package=package,
                content_types=content_types,
                part_path=part_path,
                group=child,
                slide_index=slide_index,
                source_name=source_name,
                child_index=child_index,
                scale=scale,
                transform=group_transform,
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )
        elif tag in {"sp", "pic", "cxnSp"}:
            append_shape(
                package=package,
                content_types=content_types,
                rels=rels,
                part_path=part_path,
                shape=child,
                slide_index=slide_index,
                source_name=source_name,
                child_index=child_index,
                scale=scale,
                transform=group_transform,
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )


def append_group_text_elements(
    *,
    part_path: str,
    group: ET.Element[Any],
    slide_index: int,
    source_name: str,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    for child_index, child in enumerate(list(group), start=1):
        tag = local_name(child)
        if tag == "grpSp":
            append_group_text_elements(
                part_path=part_path,
                group=child,
                slide_index=slide_index,
                source_name=source_name,
                scale=scale,
                transform=transform.for_group(child),
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )
        elif tag in {"sp", "cxnSp"}:
            append_shape_text_only(
                part_path=part_path,
                shape=child,
                slide_index=slide_index,
                source_name=source_name,
                child_index=child_index,
                scale=scale,
                transform=transform,
                state=state,
                elements=elements,
                slot_sources=slot_sources,
                placeholder_frames=placeholder_frames,
                locked=locked,
            )


def append_shape_text_only(
    *,
    part_path: str,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    child_index: int,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    shape_id = shape_identifier(shape, child_index)
    frame = shape_frame(shape, scale, transform, placeholder_frames)
    if frame is None:
        return
    text_element_payload = text_element(
        shape=shape,
        slide_index=slide_index,
        source_name=source_name,
        shape_id=shape_id,
        frame=frame,
        scale=scale,
        z_index=state.next_z(),
        locked=locked,
        theme_colors=state.theme_colors,
    )
    if text_element_payload:
        elements.append(text_element_payload)
        slot_sources[str(text_element_payload["elementId"])] = shape_source(
            shape,
            part_path,
            shape_id,
            source_name,
            locked,
        )


def group_has_visual_content(
    group: ET.Element[Any],
    scale: OoxmlScale,
    transform: OoxmlTransform,
    theme_colors: dict[str, str],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
) -> bool:
    for child in list(group):
        tag = local_name(child)
        if tag == "grpSp":
            if group_has_visual_content(
                child,
                scale,
                transform.for_group(child),
                theme_colors,
                placeholder_frames,
            ):
                return True
        elif tag in {"sp", "pic", "cxnSp"} and shape_has_visual_content(
            child,
            scale,
            transform,
            theme_colors,
            placeholder_frames,
        ):
            return True
    return False


def group_visual_frame(
    group: ET.Element[Any],
    scale: OoxmlScale,
    transform: OoxmlTransform,
    theme_colors: dict[str, str],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
) -> dict[str, int] | None:
    frames: list[dict[str, int]] = []
    for child in list(group):
        tag = local_name(child)
        if tag == "grpSp":
            frame = group_visual_frame(
                child,
                scale,
                transform.for_group(child),
                theme_colors,
                placeholder_frames,
            )
        elif tag in {"sp", "pic", "cxnSp"} and shape_has_visual_content(
            child,
            scale,
            transform,
            theme_colors,
            placeholder_frames,
        ):
            frame = shape_frame(child, scale, transform, placeholder_frames)
        else:
            frame = None
        if frame is not None:
            frames.append(frame)

    if not frames:
        return None
    left = min(frame["x"] for frame in frames)
    top = min(frame["y"] for frame in frames)
    right = max(frame["x"] + frame["width"] for frame in frames)
    bottom = max(frame["y"] + frame["height"] for frame in frames)
    return {
        "x": left,
        "y": top,
        "width": max(1, right - left),
        "height": max(1, bottom - top),
        "rotation": 0,
    }


def shape_has_visual_content(
    shape: ET.Element[Any],
    scale: OoxmlScale,
    transform: OoxmlTransform,
    theme_colors: dict[str, str],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
) -> bool:
    if shape_frame(shape, scale, transform, placeholder_frames) is None:
        return False
    if local_name(shape) in {"pic", "cxnSp"}:
        return True
    if unsupported_geometry_reason(shape) or unsupported_effect_reason(shape):
        return True
    fill = shape_fill(shape, theme_colors)
    stroke, _, _ = shape_stroke(shape, scale, theme_colors)
    return bool(
        fill != "transparent"
        or stroke != "transparent"
        or shape_uses_default_visual_style(shape)
    )


def shape_uses_default_visual_style(shape: ET.Element[Any]) -> bool:
    body = first_local_child(shape, "txBody")
    return (
        local_name(shape) == "sp"
        and first_local_descendant(shape, "prstGeom") is not None
        and (body is None or not text_body_plain_text(body).strip())
    )


def text_body_plain_text(body: ET.Element[Any]) -> str:
    return "".join(node.text or "" for node in body.iter() if local_name(node) == "t")


def append_shape(
    *,
    package: zipfile.ZipFile,
    content_types: dict[str, str],
    rels: dict[str, dict[str, str]],
    part_path: str,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    child_index: int,
    scale: OoxmlScale,
    transform: OoxmlTransform,
    state: OoxmlImportState,
    elements: list[dict[str, Any]],
    slot_sources: dict[str, dict[str, Any]],
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
    locked: bool,
) -> None:
    shape_id = shape_identifier(shape, child_index)
    frame = shape_frame(shape, scale, transform, placeholder_frames)
    if frame is None:
        state.warnings.append(
            f"OOXML shape has no resolved transform on slide {slide_index}: {shape_id}"
        )
        return

    source = shape_source(shape, part_path, shape_id, source_name, locked)
    fallback_reason = shape_image_fallback_reason(shape)
    if fallback_reason:
        source["fallbackReason"] = fallback_reason
        fallback_element = shape_fallback_image_element(
            shape=shape,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            z_index=state.next_z(),
            locked=locked,
            reason=fallback_reason,
        )
        elements.append(fallback_element)
        slot_sources[str(fallback_element["elementId"])] = source
        state.warnings.append(
            f"OOXML shape rendered as image fallback on slide {slide_index}: "
            f"{fallback_reason}"
        )
        text_element_payload = text_element(
            shape=shape,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            scale=scale,
            z_index=state.next_z(),
            locked=locked,
            theme_colors=state.theme_colors,
        )
        if text_element_payload:
            elements.append(text_element_payload)
            slot_sources[str(text_element_payload["elementId"])] = shape_source(
                shape,
                part_path,
                shape_id,
                source_name,
                locked,
            )
        return

    if local_name(shape) == "pic":
        element = image_element(
            package=package,
            content_types=content_types,
            rels=rels,
            part_path=part_path,
            shape=shape,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            scale=scale,
            z_index=state.next_z(),
            locked=locked,
            state=state,
        )
        if element:
            elements.append(element)
            slot_sources[str(element["elementId"])] = source
        return

    fill = shape_fill(shape, state.theme_colors)
    stroke, stroke_width, stroke_extras = shape_stroke(
        shape,
        scale,
        state.theme_colors,
    )
    shadow = shape_shadow(shape, scale, state.theme_colors)
    if fill != "transparent" or stroke != "transparent":
        shape_element_payload = visual_shape_element(
            shape=shape,
            slide_index=slide_index,
            source_name=source_name,
            shape_id=shape_id,
            frame=frame,
            z_index=state.next_z(),
            locked=locked,
            fill=fill,
            stroke=stroke,
            stroke_width=stroke_width,
            stroke_extras=stroke_extras,
            shadow=shadow,
            warnings=state.warnings,
        )
        elements.append(shape_element_payload)
        slot_sources[str(shape_element_payload["elementId"])] = source

    text_element_payload = text_element(
        shape=shape,
        slide_index=slide_index,
        source_name=source_name,
        shape_id=shape_id,
        frame=frame,
        scale=scale,
        z_index=state.next_z(),
        locked=locked,
        theme_colors=state.theme_colors,
    )
    if text_element_payload:
        elements.append(text_element_payload)
        slot_sources[str(text_element_payload["elementId"])] = source


def image_element(
    *,
    package: zipfile.ZipFile,
    content_types: dict[str, str],
    rels: dict[str, dict[str, str]],
    part_path: str,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    scale: OoxmlScale,
    z_index: int,
    locked: bool,
    state: OoxmlImportState,
) -> dict[str, Any] | None:
    blip = first_local_descendant(shape, "blip")
    relationship_id = attr_by_local_name(blip, "embed")
    if not relationship_id:
        state.warnings.append(
            f"OOXML image has no relationship on slide {slide_index}: {shape_id}"
        )
        return None
    rel = rels.get(relationship_id)
    if not rel:
        state.warnings.append(
            f"OOXML image relationship missing on slide {slide_index}: {relationship_id}"
        )
        return None
    image_part = resolve_part_path(part_path, rel.get("Target", ""))
    if image_part not in package.namelist():
        state.warnings.append(
            f"OOXML image part missing on slide {slide_index}: {image_part}"
        )
        return None
    blob = package.read(image_part)
    asset_id = f"image_{len(state.assets) + 1}"
    mime_type = mime_type_for_part(content_types, image_part)
    state.assets.append(
        ImportedDesignAsset(
            assetId=asset_id,
            fileName=f"{asset_id}.{extension_for_mime_type(mime_type)}",
            mimeType=mime_type,
            contentBase64=base64.b64encode(blob).decode("ascii"),
        )
    )
    color = average_image_color(blob)
    if color:
        state.asset_colors[asset_id] = color

    props: dict[str, Any] = {
        "src": f"asset:{asset_id}",
        "alt": shape_name(shape) or "Imported image",
        "fit": "stretch",
        "focusX": 0.5,
        "focusY": 0.5,
    }
    crop = image_crop(shape)
    if crop:
        props["crop"] = crop
    role = "background" if is_full_canvas_frame(frame, scale) else "media"
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "image"),
            role=role,
            frame=frame,
            z_index=z_index,
            locked=locked or role == "background",
        ),
        "type": "image",
        "props": props,
    }


def shape_fallback_image_element(
    *,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    z_index: int,
    locked: bool,
    reason: str,
) -> dict[str, Any]:
    asset_id = shape_fallback_asset_id(slide_index, source_name, shape_id)
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "fallback_image"),
            role="decoration",
            frame=frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": "image",
        "props": {
            "src": f"asset:{asset_id}",
            "alt": shape_name(shape) or reason,
            "fit": "stretch",
            "focusX": 0.5,
            "focusY": 0.5,
        },
    }


def shape_fallback_asset_id(slide_index: int, source_name: str, shape_id: str) -> str:
    return f"shape_render_{slide_index}_{safe_id(source_name)}_{safe_id(shape_id)}"


def shape_image_fallback_reason(shape: ET.Element[Any]) -> str | None:
    if local_name(shape) == "pic":
        return None

    geometry_reason = unsupported_geometry_reason(shape)
    if geometry_reason:
        return geometry_reason

    effect_reason = unsupported_effect_reason(shape)
    if effect_reason:
        return effect_reason

    return None


def unsupported_geometry_reason(shape: ET.Element[Any]) -> str | None:
    sp_pr = first_local_child(shape, "spPr")
    if sp_pr is None:
        return None
    if first_local_child(sp_pr, "custGeom") is not None:
        return "unsupported custom geometry"
    if first_local_child(sp_pr, "pattFill") is not None:
        return "unsupported pattern fill"
    if first_local_child(sp_pr, "blipFill") is not None:
        return "unsupported shape image fill"

    token = preset_token(shape)
    if supported_preset_token(token, local_name(shape)):
        return None
    return f"unsupported preset {token}"


def supported_preset_token(token: str, tag: str) -> bool:
    return (
        tag == "cxnSp"
        or token in {"rect", "roundRect", "line", "straightConnector1", "ellipse", "oval"}
        or "donut" in token
        or "star" in token
        or preset_custom_shape_path(token) is not None
    )


def unsupported_effect_reason(shape: ET.Element[Any]) -> str | None:
    if first_local_descendant(shape, "effectDag") is not None:
        return "unsupported effect graph"
    if first_local_descendant(shape, "scene3d") is not None:
        return "unsupported 3D scene"
    if first_local_descendant(shape, "sp3d") is not None:
        return "unsupported 3D shape"

    effect_list = first_local_descendant(shape, "effectLst")
    if effect_list is None:
        return None
    unsupported = [
        local_name(child)
        for child in list(effect_list)
        if local_name(child) != "outerShdw"
    ]
    if unsupported:
        return f"unsupported effect {unsupported[0]}"
    return None


def unsupported_text_reason(body: ET.Element[Any]) -> str | None:
    body_pr = first_local_child(body, "bodyPr")
    text_direction = str(body_pr.get("vert", "")) if body_pr is not None else ""
    if text_direction and text_direction != "horz":
        return "unsupported vertical text"
    if first_local_descendant(body, "fld") is not None:
        return "unsupported text field"

    paragraphs = [
        paragraph
        for paragraph in direct_local_children(body, "p")
        if paragraph_plain_text(paragraph).strip()
    ]
    if len(paragraphs) > 1:
        return "multi-paragraph text layout"
    return None


def paragraph_plain_text(paragraph: ET.Element[Any]) -> str:
    return "".join(
        node.text or "" for node in paragraph.iter() if local_name(node) == "t"
    )


def visual_shape_element(
    *,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    z_index: int,
    locked: bool,
    fill: Any,
    stroke: Any,
    stroke_width: float,
    stroke_extras: dict[str, Any],
    shadow: dict[str, Any] | None,
    warnings: list[str],
) -> dict[str, Any]:
    token = preset_token(shape)
    element_type = shape_type_for_preset(token, local_name(shape))
    props: dict[str, Any] = {
        "fill": fill,
        "stroke": stroke,
        "strokeWidth": stroke_width,
        "borderRadius": 0,
        **stroke_extras,
    }
    if shadow:
        props["shadow"] = shadow
    if element_type == "customShape":
        custom_path = preset_custom_shape_path(token)
        if custom_path:
            path_data, closed = custom_path
        else:
            warnings.append(
                f"Unsupported OOXML preset converted to rect on slide {slide_index}: {token}"
            )
            element_type = "rect"
            path_data, closed = "", True
        if element_type == "customShape":
            return {
                **element_base(
                    element_id=element_id(slide_index, source_name, shape_id, "shape"),
                    role="decoration",
                    frame=frame,
                    z_index=z_index,
                    locked=locked,
                ),
                "type": "customShape",
                "props": {
                    "pathData": path_data,
                    "viewBoxWidth": 100,
                    "viewBoxHeight": 100,
                    "fill": fill,
                    "stroke": stroke,
                    "strokeWidth": stroke_width,
                    "closed": closed,
                    "nodes": [],
                    **stroke_extras,
                    **({"shadow": shadow} if shadow else {}),
                },
            }
    if token == "roundRect":
        props["borderRadius"] = round(min(frame["width"], frame["height"]) * 0.16)
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "shape"),
            role="decoration",
            frame=frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": element_type,
        "props": props,
    }


def text_element(
    *,
    shape: ET.Element[Any],
    slide_index: int,
    source_name: str,
    shape_id: str,
    frame: dict[str, int],
    scale: OoxmlScale,
    z_index: int,
    locked: bool,
    theme_colors: dict[str, str],
) -> dict[str, Any] | None:
    body = first_local_child(shape, "txBody")
    if body is None:
        return None
    paragraphs = text_paragraphs(body, scale, theme_colors)
    runs = flatten_paragraph_runs(paragraphs)
    text = "".join(str(run.get("text", "")) for run in runs)
    if not text.strip():
        return None
    first_run = next((run for run in runs if str(run.get("text", "")).strip()), runs[0])
    text_frame = text_content_frame(body, frame, scale)
    props: dict[str, Any] = {
        "text": text,
        "runs": runs,
        "paragraphs": paragraphs,
        "bodyInset": text_body_inset(body, scale),
        "fontFamily": first_run.get("fontFamily", DEFAULT_PPTX_FONT_FAMILY),
        "fontSize": first_run.get("fontSize", 24),
        "fontWeight": first_run.get("fontWeight", "normal"),
        "color": first_run.get("color", "#111827"),
        "align": paragraph_align(body),
        "verticalAlign": text_vertical_align(body),
        "writingMode": text_writing_mode(body),
        "lineHeight": paragraph_line_height(body),
    }
    bullet = paragraph_bullet(body)
    if bullet:
        props["bullet"] = bullet
    return {
        **element_base(
            element_id=element_id(slide_index, source_name, shape_id, "text"),
            role="body",
            frame=text_frame,
            z_index=z_index,
            locked=locked,
        ),
        "type": "text",
        "props": props,
    }


def text_paragraphs(
    body: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> list[dict[str, Any]]:
    paragraphs: list[dict[str, Any]] = []
    for paragraph in direct_local_children(body, "p"):
        runs = paragraph_runs(paragraph, scale, theme_colors)
        text = "".join(str(run.get("text", "")) for run in runs)
        if not text:
            continue
        props: dict[str, Any] = {
            "text": text,
            "runs": runs,
            "align": paragraph_align_value(paragraph),
            "lineHeight": paragraph_line_height_value(paragraph),
            "spaceBefore": paragraph_spacing_px(paragraph, "spcBef", scale),
            "spaceAfter": paragraph_spacing_px(paragraph, "spcAft", scale),
            "indent": paragraph_indent_px(paragraph, scale),
        }
        bullet = paragraph_bullet_value(paragraph)
        if bullet:
            props["bullet"] = bullet
        first_run = next(
            (run for run in runs if str(run.get("text", "")).strip()),
            runs[0],
        )
        for key in ("fontFamily", "fontSize", "fontWeight", "color"):
            if key in first_run:
                props[key] = first_run[key]
        paragraphs.append(props)
    if paragraphs:
        return paragraphs

    plain = "".join(node.text or "" for node in body.iter() if local_name(node) == "t")
    return [{"text": plain, "runs": [{"text": plain, "baseline": "normal"}]}] if plain else []


def paragraph_runs(
    paragraph: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    for child in list(paragraph):
        name = local_name(child)
        if name == "r":
            text = "".join(node.text or "" for node in child.iter() if local_name(node) == "t")
            if text:
                runs.append({"text": text, **run_props(child, scale, theme_colors)})
        elif name == "br":
            runs.append({"text": "\n", "baseline": "normal"})
    return runs


def flatten_paragraph_runs(paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    for paragraph_index, paragraph in enumerate(paragraphs):
        if paragraph_index > 0 and runs:
            runs.append({"text": "\n", "baseline": "normal"})
        runs.extend(paragraph.get("runs", []))
    return runs


def text_runs(
    body: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> list[dict[str, Any]]:
    runs: list[dict[str, Any]] = []
    paragraphs = direct_local_children(body, "p")
    for paragraph_index, paragraph in enumerate(paragraphs):
        if paragraph_index > 0 and runs:
            runs.append({"text": "\n", "baseline": "normal"})
        for child in list(paragraph):
            name = local_name(child)
            if name == "r":
                text = "".join(node.text or "" for node in child.iter() if local_name(node) == "t")
                if text:
                    runs.append({"text": text, **run_props(child, scale, theme_colors)})
            elif name == "br":
                runs.append({"text": "\n", "baseline": "normal"})
    if not runs:
        plain = "".join(node.text or "" for node in body.iter() if local_name(node) == "t")
        if plain:
            runs.append({"text": plain, "baseline": "normal"})
    return runs


def run_props(
    run: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> dict[str, Any]:
    r_pr = first_local_child(run, "rPr")
    props: dict[str, Any] = {"baseline": "normal"}
    if r_pr is None:
        return props
    typeface = run_typeface(r_pr)
    if typeface:
        props["fontFamily"] = typeface
    size = int_attr(r_pr, "sz", 0)
    if size > 0:
        props["fontSize"] = font_size_to_canvas_px(size / 100, scale)
    if r_pr.get("b") in {"1", "true"}:
        props["fontWeight"] = "bold"
    color = solid_color(first_local_child(r_pr, "solidFill"), theme_colors)
    if color:
        props["color"] = color
    baseline = int_attr(r_pr, "baseline", 0)
    if baseline > 0:
        props["baseline"] = "superscript"
    elif baseline < 0:
        props["baseline"] = "subscript"
    return props


def font_size_to_canvas_px(size_pt: float, scale: OoxmlScale) -> int:
    return max(8, round(size_pt * 12700 * scale.average_scale))


def run_typeface(r_pr: ET.Element[Any]) -> str | None:
    for child_name in ("latin", "ea", "cs"):
        child = first_local_child(r_pr, child_name)
        if child is not None and child.get("typeface"):
            return str(child.get("typeface"))
    return None


def paragraph_align(body: ET.Element[Any]) -> str:
    first_paragraph = first_local_child(body, "p")
    return paragraph_align_value(first_paragraph) if first_paragraph is not None else "left"


def paragraph_align_value(paragraph: ET.Element[Any]) -> str:
    p_pr = first_local_child(paragraph, "pPr")
    align = str(p_pr.get("algn", "left")) if p_pr is not None else "left"
    return {
        "ctr": "center",
        "r": "right",
        "just": "justify",
    }.get(align, "left")


def text_vertical_align(body: ET.Element[Any]) -> str:
    body_pr = first_local_child(body, "bodyPr")
    anchor = str(body_pr.get("anchor", "t")) if body_pr is not None else "t"
    return {
        "mid": "middle",
        "b": "bottom",
    }.get(anchor, "top")


def text_writing_mode(body: ET.Element[Any]) -> str:
    body_pr = first_local_child(body, "bodyPr")
    vertical = str(body_pr.get("vert", "horz")) if body_pr is not None else "horz"
    return "vertical-270" if vertical == "vert270" else "horizontal"


def paragraph_line_height(body: ET.Element[Any]) -> float:
    first_paragraph = first_local_child(body, "p")
    return (
        paragraph_line_height_value(first_paragraph)
        if first_paragraph is not None
        else 1.15
    )


def paragraph_line_height_value(paragraph: ET.Element[Any]) -> float:
    p_pr = first_local_child(paragraph, "pPr")
    line_spacing = first_local_child(p_pr, "lnSpc") if p_pr is not None else None
    spacing_pct = first_local_child(line_spacing, "spcPct")
    if spacing_pct is None:
        return 1.15
    return max(0.5, min(4, int_attr(spacing_pct, "val", 115000) / 100000))


def text_content_frame(
    body: ET.Element[Any],
    frame: dict[str, int],
    scale: OoxmlScale,
) -> dict[str, int]:
    body_pr = first_local_child(body, "bodyPr")
    if body_pr is None:
        return frame

    inset = text_body_inset(body, scale)
    left = inset["left"]
    right = inset["right"]
    top = inset["top"]
    bottom = inset["bottom"]
    max_horizontal_inset = max(0, frame["width"] - 1)
    max_vertical_inset = max(0, frame["height"] - 1)
    horizontal_inset = min(left + right, max_horizontal_inset)
    vertical_inset = min(top + bottom, max_vertical_inset)
    return {
        **frame,
        "x": frame["x"] + min(left, horizontal_inset),
        "y": frame["y"] + min(top, vertical_inset),
        "width": max(1, frame["width"] - horizontal_inset),
        "height": max(1, frame["height"] - vertical_inset),
    }


def text_body_inset(body: ET.Element[Any], scale: OoxmlScale) -> dict[str, int]:
    body_pr = first_local_child(body, "bodyPr")
    if body_pr is None:
        return {"left": 0, "right": 0, "top": 0, "bottom": 0}
    return {
        "left": max(
            0,
            round(
                int_attr(body_pr, "lIns", DEFAULT_TEXT_BODY_HORIZONTAL_INSET_EMU)
                * scale.scale_x
            ),
        ),
        "right": max(
            0,
            round(
                int_attr(body_pr, "rIns", DEFAULT_TEXT_BODY_HORIZONTAL_INSET_EMU)
                * scale.scale_x
            ),
        ),
        "top": max(
            0,
            round(
                int_attr(body_pr, "tIns", DEFAULT_TEXT_BODY_VERTICAL_INSET_EMU)
                * scale.scale_y
            ),
        ),
        "bottom": max(
            0,
            round(
                int_attr(body_pr, "bIns", DEFAULT_TEXT_BODY_VERTICAL_INSET_EMU)
                * scale.scale_y
            ),
        ),
    }


def paragraph_bullet(body: ET.Element[Any]) -> dict[str, Any] | None:
    first_paragraph = first_local_child(body, "p")
    return paragraph_bullet_value(first_paragraph) if first_paragraph is not None else None


def paragraph_bullet_value(paragraph: ET.Element[Any]) -> dict[str, Any] | None:
    p_pr = first_local_child(paragraph, "pPr")
    if p_pr is None:
        return None
    bullet = first_local_child(p_pr, "buChar")
    if bullet is None:
        return None
    return {
        "enabled": True,
        "character": str(bullet.get("char", "\u2022")),
        "indent": max(0, round(int_attr(p_pr, "marL", 0) / 12700)),
    }


def paragraph_indent_px(paragraph: ET.Element[Any], scale: OoxmlScale) -> int:
    p_pr = first_local_child(paragraph, "pPr")
    return round(int_attr(p_pr, "marL", 0) * scale.scale_x) if p_pr is not None else 0


def paragraph_spacing_px(
    paragraph: ET.Element[Any],
    tag_name: str,
    scale: OoxmlScale,
) -> int:
    p_pr = first_local_child(paragraph, "pPr")
    spacing = first_local_child(p_pr, tag_name) if p_pr is not None else None
    points = first_local_child(spacing, "spcPts") if spacing is not None else None
    return round(int_attr(points, "val", 0) / 100 * 12700 * scale.average_scale)


def shape_fill(
    shape: ET.Element[Any],
    theme_colors: dict[str, str],
) -> Any:
    sp_pr = first_local_child(shape, "spPr")
    if sp_pr is None:
        return "transparent"
    if first_local_child(sp_pr, "noFill") is not None:
        return "transparent"
    grad = first_local_child(sp_pr, "gradFill")
    if grad is not None:
        paint = gradient_paint(grad, theme_colors)
        if paint:
            return paint
    solid = solid_color(first_local_child(sp_pr, "solidFill"), theme_colors)
    return solid or "transparent"


def shape_stroke(
    shape: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> tuple[Any, float, dict[str, Any]]:
    sp_pr = first_local_child(shape, "spPr")
    line = first_local_child(sp_pr, "ln") if sp_pr is not None else None
    if line is None or first_local_child(line, "noFill") is not None:
        return "transparent", 0, {}
    solid = solid_color(first_local_child(line, "solidFill"), theme_colors)
    grad = gradient_paint(first_local_child(line, "gradFill"), theme_colors)
    stroke: Any = grad or solid or "transparent"
    width = int_attr(line, "w", 12700 if stroke != "transparent" else 0)
    extras: dict[str, Any] = {}
    dash = line_dash(line)
    if dash:
        extras["dash"] = dash
    cap = line.get("cap")
    if cap:
        extras["lineCap"] = {"flat": "butt", "rnd": "round", "sq": "square"}.get(
            cap,
            "butt",
        )
    join = line_join(line)
    if join:
        extras["lineJoin"] = join
    return stroke, round(max(0, width * scale.average_scale), 2), extras


def line_dash(line: ET.Element[Any]) -> list[int] | None:
    preset = first_local_child(line, "prstDash")
    value = str(preset.get("val", "")) if preset is not None else ""
    return {
        "dash": [8, 4],
        "dashDot": [8, 4, 2, 4],
        "dot": [2, 4],
        "lgDash": [12, 6],
        "sysDash": [8, 4],
        "sysDot": [2, 4],
    }.get(value)


def line_join(line: ET.Element[Any]) -> str | None:
    if first_local_child(line, "round") is not None:
        return "round"
    if first_local_child(line, "bevel") is not None:
        return "bevel"
    if first_local_child(line, "miter") is not None:
        return "miter"
    return None


def gradient_paint(
    gradient: ET.Element[Any] | None,
    theme_colors: dict[str, str],
) -> dict[str, Any] | None:
    if gradient is None:
        return None
    stops = []
    stop_list = first_local_descendant(gradient, "gsLst")
    for stop in list(stop_list) if stop_list is not None else []:
        if local_name(stop) != "gs":
            continue
        color = solid_color(stop, theme_colors)
        if not color:
            continue
        alpha = first_local_descendant(stop, "alpha")
        stops.append(
            {
                "offset": max(0, min(1, int_attr(stop, "pos", 0) / 100000)),
                "color": color,
                "opacity": max(0, min(1, int_attr(alpha, "val", 100000) / 100000)),
            }
        )
    if len(stops) < 2:
        return None
    line = first_local_child(gradient, "lin")
    angle = round(int_attr(line, "ang", 0) / 60000) if line is not None else 0
    return {
        "type": "linear-gradient",
        "angle": angle,
        "stops": sorted(stops, key=lambda stop: float(stop["offset"])),
    }


def solid_color(
    container: ET.Element[Any] | None,
    theme_colors: dict[str, str],
) -> str | None:
    if container is None:
        return None
    srgb = first_local_descendant(container, "srgbClr")
    if srgb is not None and srgb.get("val"):
        return apply_color_transforms(f"#{str(srgb.get('val')).upper()}", srgb)
    sys = first_local_descendant(container, "sysClr")
    if sys is not None:
        last = sys.get("lastClr")
        if last:
            return apply_color_transforms(f"#{str(last).upper()}", sys)
    scheme = first_local_descendant(container, "schemeClr")
    if scheme is not None:
        color = scheme_color(str(scheme.get("val", "")), theme_colors)
        return apply_color_transforms(color, scheme) if color else None
    return None


def scheme_color(value: str, theme_colors: dict[str, str]) -> str | None:
    lookup = SCHEME_COLOR_ALIASES.get(value, value)
    return theme_colors.get(value) or theme_colors.get(lookup) or FALLBACK_SCHEME_COLORS.get(value)


def shape_shadow(
    shape: ET.Element[Any],
    scale: OoxmlScale,
    theme_colors: dict[str, str],
) -> dict[str, Any] | None:
    shadow = first_local_descendant(shape, "outerShdw")
    if shadow is None:
        return None
    color = solid_color(shadow, theme_colors) or "#000000"
    blur = round(int_attr(shadow, "blurRad", 0) * scale.average_scale, 2)
    distance = int_attr(shadow, "dist", 0) * scale.average_scale
    direction = math.radians(int_attr(shadow, "dir", 0) / 60000)
    alpha = first_local_descendant(shadow, "alpha")
    return {
        "color": color,
        "blur": blur,
        "offsetX": round(math.cos(direction) * distance, 2),
        "offsetY": round(math.sin(direction) * distance, 2),
        "opacity": max(0, min(1, int_attr(alpha, "val", 25000) / 100000)),
    }


def image_crop(shape: ET.Element[Any]) -> dict[str, float] | None:
    src_rect = first_local_descendant(shape, "srcRect")
    if src_rect is None:
        return None
    crop = {
        "left": pct_attr(src_rect, "l"),
        "top": pct_attr(src_rect, "t"),
        "right": pct_attr(src_rect, "r"),
        "bottom": pct_attr(src_rect, "b"),
    }
    return crop if any(value > 0 for value in crop.values()) else None


def pct_attr(element: ET.Element[Any], name: str) -> float:
    return max(0, min(0.99, int_attr(element, name, 0) / 100000))


def shape_frame(
    shape: ET.Element[Any],
    scale: OoxmlScale,
    transform: OoxmlTransform,
    placeholder_frames: dict[tuple[str, str], dict[str, int]],
) -> dict[str, int] | None:
    xfrm = first_local_descendant(shape, "xfrm")
    if xfrm is None or first_local_child(xfrm, "off") is None:
        key = placeholder_key(shape)
        if key is not None:
            fallback = placeholder_frames.get(key) or placeholder_frames.get((key[0], ""))
            if fallback is not None:
                return fallback
        return None
    off = first_local_child(xfrm, "off")
    ext = first_local_child(xfrm, "ext")
    raw_x, raw_y, raw_width, raw_height = transform.rect(
        int_attr(off, "x", 0),
        int_attr(off, "y", 0),
        max(1, int_attr(ext, "cx", 1)),
        max(1, int_attr(ext, "cy", 1)),
    )
    x = max(0, round(raw_x * scale.scale_x))
    y = max(0, round(raw_y * scale.scale_y))
    width = max(1, round(raw_width * scale.scale_x))
    height = max(1, round(raw_height * scale.scale_y))
    rotation = round(int_attr(xfrm, "rot", 0) / 60000)
    return {
        "x": min(x, scale.canvas_width - 1),
        "y": min(y, scale.canvas_height - 1),
        "width": min(width, scale.canvas_width - min(x, scale.canvas_width - 1)),
        "height": min(height, scale.canvas_height - min(y, scale.canvas_height - 1)),
        "rotation": rotation,
    }


def placeholder_frame_map(
    root: ET.Element[Any] | None,
    scale: OoxmlScale,
) -> dict[tuple[str, str], dict[str, int]]:
    if root is None:
        return {}
    frames: dict[tuple[str, str], dict[str, int]] = {}
    for shape in root.iter():
        key = placeholder_key(shape)
        if key is None:
            continue
        frame = shape_frame(shape, scale, OoxmlTransform(), {})
        if frame is not None:
            frames[key] = frame
            if key[0] and (key[0], "") not in frames:
                frames[(key[0], "")] = frame
    return frames


def placeholder_key(shape: ET.Element[Any]) -> tuple[str, str] | None:
    ph = first_local_descendant(shape, "ph")
    if ph is None:
        return None
    return str(ph.get("type", "")), str(ph.get("idx", ""))


def shape_source(
    shape: ET.Element[Any],
    part_path: str,
    shape_id: str,
    source_name: str,
    locked: bool,
) -> dict[str, Any]:
    ph_key = placeholder_key(shape)
    source_type = "placeholder" if ph_key is not None and source_name == "slide" else source_name
    source = {
        "type": source_type,
        "name": shape_name(shape) or "shape",
        "slidePart": part_path,
        "shapeId": shape_id,
        "writable": not locked and source_name == "slide",
    }
    if ph_key is not None and ph_key[0]:
        source["placeholderType"] = ph_key[0]
    relationship_id = attr_by_local_name(first_local_descendant(shape, "blip"), "embed")
    if relationship_id:
        source["relationshipId"] = relationship_id
    return source


def background_element(
    slide_index: int,
    canvas_width: int,
    canvas_height: int,
) -> dict[str, Any]:
    return {
        **element_base(
            element_id=f"el_ooxml_{slide_index}_background",
            role="background",
            frame={"x": 0, "y": 0, "width": canvas_width, "height": canvas_height},
            z_index=0,
            locked=True,
        ),
        "type": "rect",
        "props": {
            "fill": "#FFFFFF",
            "stroke": "transparent",
            "strokeWidth": 0,
            "borderRadius": 0,
        },
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
        "rotation": frame.get("rotation", 0),
        "opacity": 1,
        "zIndex": z_index,
        "locked": locked,
        "visible": True,
    }


def shape_type_for_preset(token: str, tag: str) -> str:
    if tag == "cxnSp" or token in {"line", "straightConnector1"}:
        return "line"
    if token in {"ellipse", "oval"}:
        return "ellipse"
    if "donut" in token:
        return "ring"
    if "star" in token:
        return "star"
    if preset_custom_shape_path(token):
        return "customShape"
    return "rect"


def preset_token(shape: ET.Element[Any]) -> str:
    preset = first_local_descendant(shape, "prstGeom")
    return str(preset.get("prst", "rect")) if preset is not None else "rect"


def shape_identifier(shape: ET.Element[Any], fallback_index: int) -> str:
    c_nv_pr = first_local_descendant(shape, "cNvPr")
    return safe_id(str(c_nv_pr.get("id", ""))) if c_nv_pr is not None else str(fallback_index)


def shape_name(shape: ET.Element[Any]) -> str:
    c_nv_pr = first_local_descendant(shape, "cNvPr")
    return str(c_nv_pr.get("descr") or c_nv_pr.get("name") or "") if c_nv_pr is not None else ""


def graphic_frame_kind(frame_element: ET.Element[Any]) -> str:
    if first_local_descendant(frame_element, "tbl") is not None:
        return "table"
    if first_local_descendant(frame_element, "chart") is not None:
        return "chart"
    return "graphic"


def element_id(
    slide_index: int,
    source_name: str,
    shape_id: str,
    kind: str,
) -> str:
    return f"el_ooxml_{slide_index}_{safe_id(source_name)}_{safe_id(shape_id)}_{kind}"


def presentation_slide_parts(package: zipfile.ZipFile) -> list[str]:
    presentation = read_xml(package, "ppt/presentation.xml")
    if presentation is None:
        raise ValueError("PPTX presentation.xml is missing.")
    rels = relationships_for_part(package, "ppt/presentation.xml")
    slide_parts: list[str] = []
    for slide_id in presentation.iter():
        if local_name(slide_id) != "sldId":
            continue
        rel_id = slide_id.get(f"{{{REL_NS}}}id")
        if not rel_id:
            continue
        rel = rels.get(rel_id)
        if rel and rel.get("Type") == SLIDE_REL_TYPE:
            slide_parts.append(resolve_part_path("ppt/presentation.xml", rel.get("Target", "")))
    return slide_parts


def presentation_size_emu(package: zipfile.ZipFile) -> tuple[int, int]:
    presentation = read_xml(package, "ppt/presentation.xml")
    size = first_local_descendant(presentation, "sldSz")
    return (
        max(1, int_attr(size, "cx", 12192000)),
        max(1, int_attr(size, "cy", 6858000)),
    )


def slide_shows_master_shapes(slide: ET.Element[Any]) -> bool:
    common_slide_data = first_local_child(slide, "cSld")
    return common_slide_data is None or common_slide_data.get("showMasterSp") != "0"


def theme_color_map(package: zipfile.ZipFile) -> dict[str, str]:
    theme_part = presentation_theme_part(package) or first_theme_part(package)
    theme = read_xml(package, theme_part)
    color_scheme = first_local_descendant(theme, "clrScheme") if theme is not None else None
    if color_scheme is None:
        return FALLBACK_SCHEME_COLORS

    colors: dict[str, str] = {}
    for item in list(color_scheme):
        key = local_name(item)
        color = theme_color_value(item)
        if color:
            colors[key] = color
    for alias, target in SCHEME_COLOR_ALIASES.items():
        if target in colors:
            colors[alias] = colors[target]
    return {**FALLBACK_SCHEME_COLORS, **colors}


def presentation_theme_part(package: zipfile.ZipFile) -> str | None:
    rels = relationships_for_part(package, "ppt/presentation.xml")
    return relationship_target_by_type("ppt/presentation.xml", rels, THEME_REL_TYPE)


def first_theme_part(package: zipfile.ZipFile) -> str | None:
    return next(
        (
            name
            for name in package.namelist()
            if name.startswith("ppt/theme/theme") and name.endswith(".xml")
        ),
        None,
    )


def theme_color_value(item: ET.Element[Any]) -> str | None:
    srgb = first_local_child(item, "srgbClr")
    if srgb is not None and srgb.get("val"):
        return f"#{str(srgb.get('val')).upper()}"
    sys = first_local_child(item, "sysClr")
    if sys is not None and sys.get("lastClr"):
        return f"#{str(sys.get('lastClr')).upper()}"
    scheme = first_local_child(item, "schemeClr")
    if scheme is not None:
        return FALLBACK_SCHEME_COLORS.get(str(scheme.get("val", "")))
    return None


def apply_color_transforms(color: str, color_node: ET.Element[Any]) -> str:
    red = int(color[1:3], 16)
    green = int(color[3:5], 16)
    blue = int(color[5:7], 16)

    for transform in list(color_node):
        name = local_name(transform)
        value = int_attr(transform, "val", 100000) / 100000
        if name == "lumMod":
            red, green, blue = (
                round(red * value),
                round(green * value),
                round(blue * value),
            )
        elif name == "lumOff":
            red, green, blue = (
                round(red + 255 * value),
                round(green + 255 * value),
                round(blue + 255 * value),
            )
        elif name == "tint":
            red, green, blue = (
                round(red + (255 - red) * value),
                round(green + (255 - green) * value),
                round(blue + (255 - blue) * value),
            )
        elif name == "shade":
            red, green, blue = (
                round(red * value),
                round(green * value),
                round(blue * value),
            )

    return f"#{clamp_rgb(red):02X}{clamp_rgb(green):02X}{clamp_rgb(blue):02X}"


def clamp_rgb(value: int) -> int:
    return max(0, min(255, value))


def slide_background_color(
    slide: ET.Element[Any],
    theme_colors: dict[str, str],
) -> str | None:
    background = first_local_descendant(slide, "bgPr")
    return (
        solid_color(first_local_child(background, "solidFill"), theme_colors)
        if background is not None
        else None
    )


def relationships_for_part(
    package: zipfile.ZipFile,
    part_path: str | None,
) -> dict[str, dict[str, str]]:
    if not part_path:
        return {}
    rels_path = rels_path_for_part(part_path)
    if rels_path not in package.namelist():
        return {}
    root = ET.fromstring(package.read(rels_path))
    return {
        str(relationship.get("Id")): {
            key: str(value) for key, value in relationship.attrib.items()
        }
        for relationship in root
        if local_name(relationship) == "Relationship" and relationship.get("Id")
    }


def relationship_target_by_type(
    part_path: str | None,
    rels: dict[str, dict[str, str]],
    rel_type: str,
) -> str | None:
    if not part_path:
        return None
    for rel in rels.values():
        if rel.get("Type") == rel_type and rel.get("Target"):
            return resolve_part_path(part_path, rel["Target"])
    return None


def rels_path_for_part(part_path: str) -> str:
    directory, _, filename = part_path.rpartition("/")
    return f"{directory}/_rels/{filename}.rels" if directory else f"_rels/{filename}.rels"


def resolve_part_path(part_path: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    base_parts = part_path.split("/")[:-1]
    for piece in target.split("/"):
        if piece in {"", "."}:
            continue
        if piece == "..":
            if base_parts:
                base_parts.pop()
        else:
            base_parts.append(piece)
    return "/".join(base_parts)


def read_xml(package: zipfile.ZipFile, part_path: str | None) -> ET.Element[Any] | None:
    if not part_path or part_path not in package.namelist():
        return None
    return ET.fromstring(package.read(part_path))


def content_type_map(package: zipfile.ZipFile) -> dict[str, str]:
    if "[Content_Types].xml" not in package.namelist():
        return {}
    root = ET.fromstring(package.read("[Content_Types].xml"))
    mapping: dict[str, str] = {}
    for item in root:
        name = local_name(item)
        if name == "Default" and item.get("Extension") and item.get("ContentType"):
            mapping[f".{str(item.get('Extension')).lower()}"] = str(item.get("ContentType"))
        elif name == "Override" and item.get("PartName") and item.get("ContentType"):
            mapping[str(item.get("PartName")).lstrip("/")] = str(item.get("ContentType"))
    return mapping


def mime_type_for_part(content_types: dict[str, str], part_path: str) -> str:
    if part_path in content_types:
        return content_types[part_path]
    suffix = f".{part_path.rsplit('.', maxsplit=1)[-1].lower()}"
    return content_types.get(suffix, "image/png")


def extension_for_mime_type(mime_type: str) -> str:
    subtype = mime_type.rsplit("/", maxsplit=1)[-1].lower()
    if subtype == "jpeg":
        return "jpg"
    return subtype if subtype in {"png", "jpg", "gif", "webp"} else "png"


def is_full_canvas_frame(frame: dict[str, int], scale: OoxmlScale) -> bool:
    return (
        frame["x"] <= 4
        and frame["y"] <= 4
        and frame["width"] >= scale.canvas_width - 8
        and frame["height"] >= scale.canvas_height - 8
    )


def first_local_descendant(
    element: ET.Element[Any] | None,
    name: str,
) -> ET.Element[Any] | None:
    if element is None:
        return None
    for candidate in element.iter():
        if local_name(candidate) == name:
            return candidate
    return None


def first_local_child(
    element: ET.Element[Any] | None,
    name: str,
) -> ET.Element[Any] | None:
    if element is None:
        return None
    for candidate in list(element):
        if local_name(candidate) == name:
            return candidate
    return None


def direct_local_children(
    element: ET.Element[Any],
    name: str,
) -> list[ET.Element[Any]]:
    return [child for child in list(element) if local_name(child) == name]


def local_name(element: ET.Element[Any] | str) -> str:
    tag = element.tag if isinstance(element, ET.Element) else element
    return str(tag).rsplit("}", maxsplit=1)[-1]


def int_attr(element: ET.Element[Any] | None, name: str, fallback: int) -> int:
    if element is None:
        return fallback
    try:
        return int(str(element.get(name)))
    except Exception:
        return fallback


def attr_by_local_name(element: ET.Element[Any] | None, name: str) -> str | None:
    if element is None:
        return None
    for key, value in element.attrib.items():
        if local_name(key) == name:
            return str(value)
    return None


def safe_id(value: str) -> str:
    return (
        "".join(
            char if char.isascii() and (char.isalnum() or char in "_-") else "_"
            for char in value
        )
        or "ooxml"
    )
