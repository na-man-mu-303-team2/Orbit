from __future__ import annotations

import base64
import binascii
import importlib
import json
import math
import posixpath
import shutil
import subprocess
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal, cast
from xml.etree import ElementTree as ET

from PIL import Image
from pptx import Presentation
from pydantic import BaseModel, ConfigDict, Field

from app.ai.pptx_design_importer import (
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    ImportedDesignAsset,
    build_quality_report,
)
from app.ai.pptx_ooxml_vector_importer import (
    import_pptx_design_with_optional_ooxml_vector,
)

PML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
ORBIT_OOXML_NS = "urn:orbit:deck:ooxml"
ORBIT_IMAGE_FIT_EXTENSION_URI = "urn:orbit:deck:ooxml:image-fit:v1"
IMAGE_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
)
P_SP = f"{{{PML_NS}}}sp"
P_PIC = f"{{{PML_NS}}}pic"
A_T = f"{{{DML_NS}}}t"
A_BLIP = f"{{{DML_NS}}}blip"

ET.register_namespace("p", PML_NS)
ET.register_namespace("a", DML_NS)
ET.register_namespace("r", REL_NS)
ET.register_namespace("orbit", ORBIT_OOXML_NS)


class PptxOoxmlGenerationError(RuntimeError):
    pass


class UnsupportedPptxAspectRatioError(PptxOoxmlGenerationError):
    pass


class PptxRenderUnavailableError(PptxOoxmlGenerationError):
    pass


class PptxOoxmlGenerationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    canvas: dict[str, Any]
    blueprint: dict[str, Any]
    template_blueprint: dict[str, Any] = Field(alias="templateBlueprint")
    quality_report: dict[str, Any] = Field(alias="qualityReport")
    assets: list[ImportedDesignAsset] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


PptxOoxmlSyncOperationType = Literal[
    "add_element",
    "update_element_frame",
    "update_element_props",
    "delete_element",
]

PptxOoxmlUnsupportedReasonCode = Literal[
    "ADD_ELEMENT_FAILED",
    "ADD_ELEMENT_TYPE_UNSUPPORTED",
    "FRAME_FIELDS_UNSUPPORTED",
    "GROUPED_FRAME_UNSUPPORTED",
    "IMAGE_CONTAIN_SOURCE_UNAVAILABLE",
    "MOTION_REFERENCE_COVERAGE_UNSAFE",
    "ELEMENT_TYPE_MISMATCH",
    "OPERATION_TYPE_UNSUPPORTED",
    "PROPS_FIELDS_UNSUPPORTED",
    "PROPS_UPDATE_FAILED",
    "RICH_TEXT_CAPABILITY_UNSAFE",
    "SHAPE_MISSING",
    "SLIDE_PART_MISSING",
    "SOURCE_MISSING",
    "SOURCE_NOT_WRITABLE",
    "SOURCE_PROVENANCE_UNSAFE",
    "SHARED_SHAPE_COHORT_UNSAFE",
    "SYNC_RESPONSE_INCOMPLETE",
]


class PptxOoxmlAppliedOperation(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    operation_type: PptxOoxmlSyncOperationType = Field(alias="operationType")
    slide_id: str | None = Field(default=None, alias="slideId")
    element_id: str | None = Field(default=None, alias="elementId")


class PptxOoxmlUnsupportedOperation(PptxOoxmlAppliedOperation):
    reason_code: PptxOoxmlUnsupportedReasonCode = Field(alias="reasonCode")


class PptxOoxmlSyncResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assets: list[ImportedDesignAsset] = Field(default_factory=list)
    element_sources: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="elementSources",
    )
    applied_operations: list[PptxOoxmlAppliedOperation] = Field(
        default_factory=list,
        max_length=500,
        alias="appliedOperations",
    )
    unsupported_operations: list[PptxOoxmlUnsupportedOperation] = Field(
        default_factory=list,
        max_length=500,
        alias="unsupportedOperations",
    )
    warnings: list[str] = Field(default_factory=list)


@dataclass(frozen=True)
class CanvasSpec:
    preset: str
    width: int
    height: int
    aspect_ratio: str

    def payload(self) -> dict[str, Any]:
        return {
            "preset": self.preset,
            "width": self.width,
            "height": self.height,
            "aspectRatio": self.aspect_ratio,
        }


@dataclass(frozen=True)
class PackageFrameScale:
    canvas_width: int
    canvas_height: int
    slide_width_emu: int
    slide_height_emu: int


def generate_pptx_ooxml(
    path: Path,
    file_id: str,
    *,
    render: bool = True,
) -> PptxOoxmlGenerationResult:
    canvas = detect_canvas(path)
    imported = import_pptx_design_with_optional_ooxml_vector(
        path,
        file_id,
        canvas_width=canvas.width,
        canvas_height=canvas.height,
    )
    template_blueprint = prepare_template_blueprint(
        imported.template_blueprint,
        canvas,
        source_file_id=file_id,
        source_canvas=imported.blueprint.get("canvas", {}),
    )
    warnings = list(imported.warnings)
    package_bytes = path.read_bytes()
    add_imported_ooxml_capabilities(
        imported.blueprint,
        template_blueprint,
        package_bytes,
    )

    assets = [
        package_asset("current_package", package_bytes, f"{safe_file_stem(path)}.pptx")
    ]
    assets.extend(imported.assets)
    if render:
        slide_render_assets = render_pptx_to_png_assets(package_bytes, canvas)
        assets.extend(slide_render_assets)
        fallback_render_assets = slide_render_assets
        if blueprint_has_shape_fallbacks(imported.blueprint):
            fallback_render_assets = render_pptx_to_png_assets(
                strip_text_from_pptx_package(package_bytes),
                canvas,
            )
        assets.extend(
            shape_fallback_assets(imported.blueprint, fallback_render_assets, warnings)
        )

    quality_report = dict(imported.quality_report)
    quality_report["notes"] = [
        note
        for note in quality_report.get("notes", [])
        if note != "pixel renderer unavailable"
    ]
    if render:
        metrics = dict(quality_report.get("metrics", {}))
        metrics["pixelSimilarity"] = None
        quality_report["metrics"] = metrics
        quality_report["notes"].append("OOXML package rendered to slide PNG")
    else:
        quality_report = build_quality_report(
            [{"elements": []} for _slide in template_blueprint["slides"]],
            warnings,
        )

    return PptxOoxmlGenerationResult(
        canvas=canvas.payload(),
        blueprint=imported.blueprint,
        templateBlueprint=template_blueprint,
        qualityReport=quality_report,
        assets=assets,
        warnings=warnings,
    )


def sync_pptx_ooxml(
    path: Path,
    *,
    template_blueprint: dict[str, Any],
    operations: list[dict[str, Any]],
    deck_canvas: dict[str, Any],
    synced_deck_version: int,
    render: bool = True,
) -> PptxOoxmlSyncResult:
    del synced_deck_version

    presentation = Presentation(str(path))
    scale = PackageFrameScale(
        canvas_width=int_value(deck_canvas.get("width"), CANVAS_WIDTH),
        canvas_height=int_value(deck_canvas.get("height"), CANVAS_HEIGHT),
        slide_width_emu=max(1, int(presentation.slide_width or 1)),
        slide_height_emu=max(1, int(presentation.slide_height or 1)),
    )
    (
        package_bytes,
        patch_warnings,
        updated_element_sources,
        applied_operations,
        unsupported_operations,
    ) = apply_patch_operations_to_package(
        path.read_bytes(),
        template_blueprint,
        operations,
        scale,
    )
    assets = [
        package_asset("current_package", package_bytes, f"{safe_file_stem(path)}.pptx")
    ]
    warnings: list[str] = patch_warnings

    if render:
        try:
            assets.extend(render_pptx_to_png_assets(package_bytes, detect_canvas(path)))
        except PptxRenderUnavailableError as error:
            warnings.append(str(error))

    return PptxOoxmlSyncResult(
        assets=assets,
        elementSources=updated_element_sources,
        appliedOperations=applied_operations,
        unsupportedOperations=unsupported_operations,
        warnings=warnings,
    )


def detect_canvas(path: Path) -> CanvasSpec:
    presentation = Presentation(str(path))
    width = max(1, int(presentation.slide_width or 1))
    height = max(1, int(presentation.slide_height or 1))
    ratio = width / height
    if abs(ratio - (16 / 9)) <= 0.02:
        return CanvasSpec("wide-16-9", 1920, 1080, "16:9")
    if abs(ratio - (4 / 3)) <= 0.02:
        return CanvasSpec("standard-4-3", 1024, 768, "4:3")
    raise UnsupportedPptxAspectRatioError(
        f"Unsupported PPTX aspect ratio {width}:{height}. Only 16:9 and 4:3 are supported."
    )


def prepare_template_blueprint(
    template_blueprint: dict[str, Any],
    canvas: CanvasSpec,
    *,
    source_file_id: str,
    source_canvas: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prepared = cast(dict[str, Any], json.loads(json.dumps(template_blueprint)))
    prepared["sourcePackageFileId"] = source_file_id
    prepared["currentPackageFileId"] = "asset:current_package"
    source_canvas = source_canvas or {}
    scale_x = canvas.width / int_value(source_canvas.get("width"), CANVAS_WIDTH)
    scale_y = canvas.height / int_value(source_canvas.get("height"), CANVAS_HEIGHT)

    for slide in prepared.get("slides", []):
        if not isinstance(slide, dict):
            continue
        slide_index = int_value(
            slide.get("sourceSlideIndex"),
            int_value(slide.get("slideIndex"), 1),
        )
        slide_part = source_slide_part(slide)
        if slide_part:
            slide["sourceSlidePart"] = slide_part
        slide["renderAssetFileId"] = f"asset:slide_render_{slide_index}"
        for slot_index, slot in enumerate(slide.get("slots", []), start=1):
            if not isinstance(slot, dict):
                continue
            scale_slot_bounds(slot, scale_x, scale_y)
            if slot.get("usage") == "media-slot":
                slot["replaceMode"] = "replace"
                slot["confidence"] = max(0.65, float(slot.get("confidence", 0)))
            source = slot.setdefault("source", {})
            if isinstance(source, dict) and slide_part:
                source.setdefault("slidePart", slide_part)
                source.setdefault("shapeId", str(slot_index))
    return prepared


def add_imported_ooxml_capabilities(
    blueprint: dict[str, Any],
    template_blueprint: dict[str, Any],
    package_bytes: bytes,
) -> None:
    blueprint_slides = {
        int_value(slide.get("sourceSlideIndex"), index + 1): slide
        for index, slide in enumerate(blueprint.get("slides", []))
        if isinstance(slide, dict)
    }

    try:
        package = zipfile.ZipFile(BytesIO(package_bytes), "r")
    except (OSError, zipfile.BadZipFile):
        package = None

    try:
        for index, slide in enumerate(template_blueprint.get("slides", [])):
            if not isinstance(slide, dict):
                continue
            source_slide_index = int_value(
                slide.get("sourceSlideIndex"),
                int_value(slide.get("slideIndex"), index + 1),
            )
            slide_part = source_slide_part(slide)
            if slide_part:
                slide["sourceSlidePart"] = slide_part
            slide["ooxmlOrigin"] = "imported"
            motion_coverage = imported_main_sequence_coverage(
                package,
                slide_part,
            )
            slide["ooxmlMotionCapabilities"] = {
                "transitionWritable": False,
                "importedMainSequenceCoverage": motion_coverage,
            }

            blueprint_slide = blueprint_slides.get(source_slide_index, {})
            element_types = {
                str(element.get("elementId", "")): str(element.get("type", ""))
                for element in blueprint_slide.get("elements", [])
                if isinstance(element, dict)
            }
            element_sources = [
                source
                for source in slide.get("elementSources", [])
                if isinstance(source, dict)
            ]
            shape_cohort_sizes: dict[tuple[str, str], int] = {}
            for source in element_sources:
                source_part = str(source.get("slidePart", ""))
                shape_id = str(source.get("shapeId", ""))
                if source_part and shape_id:
                    cohort_key = (source_part, shape_id)
                    shape_cohort_sizes[cohort_key] = (
                        shape_cohort_sizes.get(cohort_key, 0) + 1
                    )
            slide_root = imported_slide_root(package, slide_part)
            for source in element_sources:
                if not isinstance(source, dict):
                    continue
                element_type = element_types.get(str(source.get("elementId", "")), "")
                if element_type:
                    source["elementType"] = element_type
                source["ooxmlOrigin"] = "imported"
                source["ooxmlEditCapabilities"] = imported_element_capabilities(
                    element_type,
                    source,
                    slide_root,
                    shape_cohort_sizes.get(
                        (
                            str(source.get("slidePart", "")),
                            str(source.get("shapeId", "")),
                        ),
                        0,
                    ),
                    motion_coverage,
                )
    finally:
        if package is not None:
            package.close()


def imported_main_sequence_coverage(
    package: zipfile.ZipFile | None,
    slide_part: str,
) -> str:
    if package is None:
        return "unknown"
    root = imported_slide_root(package, slide_part)
    if root is None:
        return "unknown"
    if first_local_descendant(root, "timing") is None:
        return "absent"
    # F3 only proves that timing exists. C4 upgrades this provenance to complete
    # after its logical-effect parser models every main-sequence branch.
    return "partial"


def imported_slide_root(
    package: zipfile.ZipFile | None,
    slide_part: str,
) -> ET.Element[Any] | None:
    if package is None or not slide_part:
        return None
    try:
        return ET.fromstring(package.read(slide_part))
    except (KeyError, ET.ParseError, OSError):
        return None


def imported_element_capabilities(
    element_type: str,
    source: dict[str, Any],
    slide_root: ET.Element[Any] | None,
    shape_cohort_size: int,
    motion_coverage: str,
) -> dict[str, Any]:
    frame_writable = False
    image_source_writable = False
    if (
        slide_root is not None
        and bool(source.get("writable", False))
        and shape_cohort_size == 1
    ):
        shape, _parent = find_shape_by_id(
            slide_root,
            str(source.get("shapeId", "")),
        )
        frame_writable = shape is not None and not has_group_shape_ancestor(
            slide_root,
            shape,
        )
        image_source_writable = (
            element_type == "image"
            and shape is not None
            and shape.tag == P_PIC
            and bool(source.get("relationshipId"))
        )
    # The current targeted serializer only preserves plain text replacement,
    # frame geometry, and image source replacement. Advanced authoring remains
    # fail-closed until A7/B5/B8 upgrade the corresponding capability.
    return {
        "richText": "none",
        "crop": "none",
        "tableCellText": False,
        "frame": frame_writable,
        "delete": frame_writable and motion_coverage == "absent",
        "imageSource": image_source_writable,
    }


def apply_patch_operations_to_package(
    package_bytes: bytes,
    template_blueprint: dict[str, Any],
    operations: list[dict[str, Any]],
    scale: PackageFrameScale,
) -> tuple[
    bytes,
    list[str],
    list[dict[str, Any]],
    list[PptxOoxmlAppliedOperation],
    list[PptxOoxmlUnsupportedOperation],
]:
    sources = element_source_map(template_blueprint)
    operations = route_operations_to_source_parts(template_blueprint, operations)
    warnings: list[str] = []
    updated_sources: dict[tuple[str, str], dict[str, Any]] = {}
    applied_operations: list[PptxOoxmlAppliedOperation] = []
    unsupported_operations: list[PptxOoxmlUnsupportedOperation] = []

    motion_failure = motion_reference_failure(operations, template_blueprint)
    if motion_failure is not None:
        return package_bytes, warnings, [], [], [motion_failure]

    redundant_shape_operations, cohort_failure = shared_shape_operation_plan(
        operations,
        sources,
    )
    if cohort_failure is not None:
        return (
            package_bytes,
            warnings,
            [],
            [],
            [cohort_failure],
        )

    with zipfile.ZipFile(BytesIO(package_bytes), "r") as source:
        source_names = set(source.namelist())
        slide_parts = {
            source_slide_part(slide)
            for slide in template_blueprint.get("slides", [])
            if isinstance(slide, dict)
            and source_slide_part(slide)
        }
        slide_parts.update(
            str(item.get("slidePart", ""))
            for item in sources.values()
            if str(item.get("slidePart", ""))
        )
        package_entries = {
            slide_part: source.read(slide_part)
            for slide_part in slide_parts
            if slide_part in source_names
        }
        for slide_part in slide_parts:
            rels_part = rels_part_for_slide_part(slide_part)
            if rels_part in source_names:
                package_entries[rels_part] = source.read(rels_part)
        if "[Content_Types].xml" in source_names:
            package_entries["[Content_Types].xml"] = source.read("[Content_Types].xml")
        added_entries: dict[str, bytes] = {}

        for operation_index, operation in enumerate(operations):
            if operation_index in redundant_shape_operations:
                applied_operations.append(applied_operation(operation))
                continue
            reason_code = apply_sync_operation(
                operation,
                sources,
                package_entries,
                added_entries,
                updated_sources,
                scale,
                warnings,
                source,
            )
            if reason_code is None:
                applied_operations.append(applied_operation(operation))
            else:
                unsupported_operations.append(
                    unsupported_operation(operation, reason_code)
                )

        if unsupported_operations:
            return (
                package_bytes,
                warnings,
                [],
                [],
                unsupported_operations,
            )

        changed_entries = {
            part: content
            for part, content in package_entries.items()
            if part not in source_names or content != source.read(part)
        }
        if not changed_entries and not added_entries:
            return (
                package_bytes,
                warnings,
                list(updated_sources.values()),
                applied_operations,
                unsupported_operations,
            )
        return (
            rewrite_zip(source, changed_entries, added_entries),
            warnings,
            list(updated_sources.values()),
            applied_operations,
            unsupported_operations,
        )


def apply_sync_operation(
    operation: dict[str, Any],
    sources: dict[tuple[str, str], dict[str, Any]],
    package_entries: dict[str, bytes],
    added_entries: dict[str, bytes],
    updated_sources: dict[tuple[str, str], dict[str, Any]],
    scale: PackageFrameScale,
    warnings: list[str],
    source_package: zipfile.ZipFile,
) -> PptxOoxmlUnsupportedReasonCode | None:
    operation_type = str(operation.get("type", ""))
    element_id = operation_element_id(operation)
    operation_slide_part = slide_part_for_operation(operation)

    if operation_type == "add_element":
        element = operation.get("element")
        if not isinstance(element, dict):
            return "ADD_ELEMENT_FAILED"
        if not operation_slide_part or operation_slide_part not in package_entries:
            return "SLIDE_PART_MISSING"
        if str(element.get("type", "")) not in {"text", "rect", "image"}:
            return "ADD_ELEMENT_TYPE_UNSUPPORTED"
        if add_element_has_unsupported_advanced_props(element):
            return "PROPS_FIELDS_UNSUPPORTED"
        added_source = add_element_to_slide_xml(
            operation,
            element,
            package_entries,
            added_entries,
            scale,
            warnings,
        )
        if added_source is None:
            return "ADD_ELEMENT_FAILED"
        added_key = (
            str(added_source["slidePart"]),
            str(added_source["elementId"]),
        )
        sources[added_key] = added_source
        updated_sources[added_key] = added_source
        return None

    source_key = (operation_slide_part, element_id)
    source = sources.get(source_key)
    if not source:
        warnings.append(f"OOXML source missing for {element_id}.")
        return "SOURCE_MISSING"
    if not bool(source.get("writable", False)):
        warnings.append(f"OOXML source is locked for {element_id}.")
        return "SOURCE_NOT_WRITABLE"
    if source.get("ooxmlOrigin") not in {"imported", "authored"}:
        warnings.append(f"OOXML source provenance is unsafe for {element_id}.")
        return "SOURCE_PROVENANCE_UNSAFE"

    slide_part = str(source.get("slidePart", ""))
    slide_xml = package_entries.get(slide_part)
    if slide_xml is None:
        warnings.append(f"OOXML slide part missing for {element_id}.")
        return "SLIDE_PART_MISSING"

    root = ET.fromstring(slide_xml)
    shape, parent = find_shape_by_id(root, str(source.get("shapeId", "")))
    if shape is None:
        warnings.append(f"OOXML shape missing for {element_id}.")
        return "SHAPE_MISSING"

    shape_changed = False
    if operation_type == "update_element_props":
        props = operation.get("props")
        if not isinstance(props, dict) or not props:
            return "PROPS_FIELDS_UNSUPPORTED"
        props_reason = validate_source_props_update(source, shape, props)
        if props_reason is not None:
            return props_reason
        shape_changed = update_shape_props(
            shape,
            props,
            source,
            slide_part,
            package_entries,
            added_entries,
            updated_sources,
            source_key,
            warnings,
            element_id,
        )
        if not shape_changed:
            return "PROPS_UPDATE_FAILED"
    elif operation_type == "update_element_frame":
        frame = operation.get("frame")
        if not isinstance(frame, dict) or not frame:
            return "FRAME_FIELDS_UNSUPPORTED"
        unsupported_fields = set(frame) - {
            "x",
            "y",
            "width",
            "height",
            "rotation",
            "zIndex",
        }
        if unsupported_fields:
            return "FRAME_FIELDS_UNSUPPORTED"
        geometry_fields = set(frame) - {"zIndex"}
        if geometry_fields and not {"x", "y", "width", "height"}.issubset(frame):
            return "FRAME_FIELDS_UNSUPPORTED"
        if geometry_fields and has_group_shape_ancestor(root, shape):
            warnings.append(f"OOXML grouped frame sync skipped for {element_id}.")
            return "GROUPED_FRAME_UNSUPPORTED"
        if geometry_fields:
            update_shape_frame(shape, frame, scale)
            if source.get("elementType") == "image" and (
                source.get("ooxmlOrigin") == "authored"
                or picture_uses_contain_fit(shape)
            ):
                image_size = picture_source_image_dimensions(
                    shape,
                    slide_part,
                    package_entries,
                    added_entries,
                    source_package,
                )
                frame_size = picture_frame_size(shape)
                if image_size is None or frame_size is None:
                    warnings.append(
                        f"OOXML authored image contain layout unavailable for {element_id}."
                    )
                    return "IMAGE_CONTAIN_SOURCE_UNAVAILABLE"
                set_orbit_image_fit(shape, "contain")
                set_picture_contain_source_rect(shape, image_size, frame_size)
            shape_changed = True
        if "zIndex" in frame:
            if parent is None or not reorder_visual_shape(
                parent,
                shape,
                frame["zIndex"],
            ):
                return "FRAME_FIELDS_UNSUPPORTED"
            shape_changed = True
    elif operation_type == "delete_element":
        if parent is not None:
            parent.remove(shape)
            remove_shape_sources(
                sources,
                updated_sources,
                slide_part,
                str(source.get("shapeId", "")),
            )
            shape_changed = True
    else:
        return "OPERATION_TYPE_UNSUPPORTED"

    if shape_changed:
        package_entries[slide_part] = xml_bytes(root)
    return None


def remove_shape_sources(
    sources: dict[tuple[str, str], dict[str, Any]],
    updated_sources: dict[tuple[str, str], dict[str, Any]],
    slide_part: str,
    shape_id: str,
) -> None:
    removed_keys = [
        source_key
        for source_key, candidate in sources.items()
        if str(candidate.get("slidePart", "")) == slide_part
        and str(candidate.get("shapeId", "")) == shape_id
    ]
    for source_key in removed_keys:
        sources.pop(source_key, None)
        updated_sources.pop(source_key, None)


def add_element_has_unsupported_advanced_props(element: dict[str, Any]) -> bool:
    props = dict_value(element, "props")
    element_type = str(element.get("type", ""))
    if (
        float(element.get("opacity", 1)) != 1
        or bool(element.get("locked", False))
        or not bool(element.get("visible", True))
    ):
        return True
    if element_type == "text":
        supported_props = {
            "text",
            "bodyInset",
            "fontFamily",
            "fontSize",
            "fontWeight",
            "italic",
            "underline",
            "color",
            "align",
            "verticalAlign",
            "lineHeight",
        }
        weight = props.get("fontWeight", "normal")
        color = props.get("color")
        return (
            bool(set(props) - supported_props)
            or weight not in {"normal", "bold"}
            or color is not None
            and (not isinstance(color, str) or not valid_hex_color(color))
            or props.get("align", "left")
            not in {"left", "center", "right", "justify"}
            or props.get("verticalAlign", "top")
            not in {"top", "middle", "bottom"}
            or not valid_text_body_inset(props.get("bodyInset"))
        )
    if element_type == "rect":
        fill = props.get("fill", "transparent")
        return (
            not (fill == "transparent" or isinstance(fill, str) and valid_hex_color(fill))
            or props.get("stroke", "transparent") != "transparent"
            or float(props.get("strokeWidth", 0)) != 0
            or float(props.get("borderRadius", 0)) != 0
            or "dash" in props
            or "shadow" in props
        )
    if element_type == "image":
        return (
            "crop" in props
            or props.get("fit", "contain") != "contain"
            or float(props.get("focusX", 0.5)) != 0.5
            or float(props.get("focusY", 0.5)) != 0.5
        )
    return False


def validate_source_props_update(
    source: dict[str, Any],
    shape: ET.Element[Any],
    props: dict[str, Any],
) -> PptxOoxmlUnsupportedReasonCode | None:
    prop_names = set(props)
    element_type = str(source.get("elementType", ""))
    if prop_names == {"text"}:
        if element_type != "text" or shape.tag != P_SP:
            return "ELEMENT_TYPE_MISMATCH"
        if source.get("ooxmlOrigin") == "imported":
            capabilities = dict_value(source, "ooxmlEditCapabilities")
            if capabilities.get("richText") != "full":
                return "RICH_TEXT_CAPABILITY_UNSAFE"
        return None
    if prop_names and prop_names.issubset({"src", "alt"}):
        if element_type != "image" or shape.tag != P_PIC:
            return "ELEMENT_TYPE_MISMATCH"
        return None
    return "PROPS_FIELDS_UNSUPPORTED"


def valid_text_body_inset(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, dict):
        return False
    return set(value).issubset({"left", "right", "top", "bottom"}) and all(
        isinstance(item, (int, float)) and not isinstance(item, bool) and item >= 0
        for item in value.values()
    )


def operation_element_id(operation: dict[str, Any]) -> str:
    element_id = operation.get("elementId")
    if isinstance(element_id, str):
        return element_id
    element = operation.get("element")
    if isinstance(element, dict) and isinstance(element.get("elementId"), str):
        return str(element["elementId"])
    return ""


def applied_operation(operation: dict[str, Any]) -> PptxOoxmlAppliedOperation:
    return PptxOoxmlAppliedOperation(
        operationType=cast(PptxOoxmlSyncOperationType, operation.get("type")),
        slideId=str(operation.get("slideId", "")) or None,
        elementId=operation_element_id(operation) or None,
    )


def unsupported_operation(
    operation: dict[str, Any],
    reason_code: PptxOoxmlUnsupportedReasonCode,
) -> PptxOoxmlUnsupportedOperation:
    return PptxOoxmlUnsupportedOperation(
        operationType=cast(PptxOoxmlSyncOperationType, operation.get("type")),
        slideId=str(operation.get("slideId", "")) or None,
        elementId=operation_element_id(operation) or None,
        reasonCode=reason_code,
    )


def element_source_map(
    template_blueprint: dict[str, Any],
) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (
            str(source.get("slidePart", "")),
            str(source.get("elementId", "")),
        ): dict(source)
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict)
        for source in slide.get("elementSources", [])
        if isinstance(source, dict) and source.get("elementId")
    }


def shared_shape_operation_plan(
    operations: list[dict[str, Any]],
    sources: dict[tuple[str, str], dict[str, Any]],
) -> tuple[set[int], PptxOoxmlUnsupportedOperation | None]:
    cohorts: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for source in sources.values():
        slide_part = str(source.get("slidePart", ""))
        shape_id = str(source.get("shapeId", ""))
        element_id = str(source.get("elementId", ""))
        if not slide_part or not shape_id or not element_id:
            continue
        cohorts.setdefault((slide_part, shape_id), {})[element_id] = source

    shared_cohorts = {
        cohort_key: members
        for cohort_key, members in cohorts.items()
        if len(members) > 1
    }
    operations_by_cohort: dict[tuple[str, str], list[tuple[int, dict[str, Any]]]] = {}
    for operation_index, operation in enumerate(operations):
        if operation.get("type") not in {"delete_element", "update_element_frame"}:
            continue
        source_key = (
            slide_part_for_operation(operation),
            operation_element_id(operation),
        )
        source = sources.get(source_key)
        if source is None:
            continue
        cohort_key = (
            str(source.get("slidePart", "")),
            str(source.get("shapeId", "")),
        )
        if cohort_key in shared_cohorts:
            operations_by_cohort.setdefault(cohort_key, []).append(
                (operation_index, operation)
            )

    redundant_indexes: set[int] = set()
    for cohort_key, indexed_operations in operations_by_cohort.items():
        member_ids = set(shared_cohorts[cohort_key])
        representative = indexed_operations[0][1]
        member_count = len(member_ids)
        if len(indexed_operations) % member_count != 0:
            return (
                set(),
                unsupported_operation(
                    representative,
                    "SHARED_SHAPE_COHORT_UNSAFE",
                ),
            )
        for round_start in range(0, len(indexed_operations), member_count):
            operation_round = indexed_operations[
                round_start : round_start + member_count
            ]
            round_representative = operation_round[0][1]
            representative_type = round_representative.get("type")
            representative_frame = round_representative.get("frame")
            round_member_ids = {
                operation_element_id(operation)
                for _operation_index, operation in operation_round
            }
            unsafe = round_member_ids != member_ids or any(
                operation.get("type") != representative_type
                or (
                    representative_type == "update_element_frame"
                    and operation.get("frame") != representative_frame
                )
                for _operation_index, operation in operation_round[1:]
            )
            if unsafe:
                return (
                    set(),
                    unsupported_operation(
                        round_representative,
                        "SHARED_SHAPE_COHORT_UNSAFE",
                    ),
                )
            redundant_indexes.update(
                operation_index
                for operation_index, _operation in operation_round[1:]
            )

    return redundant_indexes, None


def motion_reference_failure(
    operations: list[dict[str, Any]],
    template_blueprint: dict[str, Any],
) -> PptxOoxmlUnsupportedOperation | None:
    coverage_by_slide_part = {
        source_slide_part(slide): str(
            dict_value(slide, "ooxmlMotionCapabilities").get(
                "importedMainSequenceCoverage",
                "unknown",
            )
        )
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict) and source_slide_part(slide)
    }
    for operation in operations:
        if operation.get("type") != "delete_element":
            continue
        slide_part = slide_part_for_operation(operation)
        if coverage_by_slide_part.get(slide_part, "unknown") != "absent":
            return unsupported_operation(
                operation,
                "MOTION_REFERENCE_COVERAGE_UNSAFE",
            )
    return None


def find_shape_by_id(
    root: ET.Element[Any], shape_id: str
) -> tuple[ET.Element[Any] | None, ET.Element[Any] | None]:
    for parent in root.iter():
        for child in list(parent):
            if child.tag not in {P_SP, P_PIC}:
                continue
            c_nv_pr = first_local_descendant(child, "cNvPr")
            if c_nv_pr is not None and c_nv_pr.get("id") == shape_id:
                return child, parent
    return None, None


def has_group_shape_ancestor(root: ET.Element[Any], shape: ET.Element[Any]) -> bool:
    parents = {child: parent for parent in root.iter() for child in list(parent)}
    parent = parents.get(shape)
    while parent is not None:
        if local_name(parent) == "grpSp":
            return True
        parent = parents.get(parent)
    return False


def update_shape_props(
    shape: ET.Element[Any],
    props: dict[str, Any],
    source: dict[str, Any],
    slide_part: str,
    package_entries: dict[str, bytes],
    added_entries: dict[str, bytes],
    updated_sources: dict[tuple[str, str], dict[str, Any]],
    source_key: tuple[str, str],
    warnings: list[str],
    element_id: str,
) -> bool:
    changed = False
    if "text" in props:
        replace_shape_text(shape, str(props.get("text") or ""))
        return True
    if "alt" in props:
        c_nv_pr = first_local_descendant(shape, "cNvPr")
        if c_nv_pr is None:
            warnings.append(f"OOXML picture metadata missing for {element_id}.")
            return False
        c_nv_pr.set("descr", str(props.get("alt") or ""))
        changed = True
    if "src" in props:
        if source.get("fallbackReason"):
            warnings.append(f"OOXML fallback source preserved for {element_id}.")
            return False
        replacement = decode_image_data_url(props.get("src"))
        if isinstance(replacement, str):
            warnings.append(
                f"OOXML image sync skipped for {element_id}: {replacement}."
            )
            return False
        mime_type, image_blob = replacement
        uses_contain_fit = (
            source.get("ooxmlOrigin") == "authored"
            or picture_uses_contain_fit(shape)
        )
        relationship_id = replace_picture_media_relationship(
            shape,
            source,
            slide_part,
            mime_type,
            image_blob,
            package_entries,
            added_entries,
            warnings,
            element_id,
        )
        if relationship_id is None:
            return False
        if uses_contain_fit:
            frame_size = picture_frame_size(shape)
            image_size = image_dimensions(image_blob)
            if frame_size is None or image_size is None:
                warnings.append(
                    f"OOXML authored image contain layout unavailable for {element_id}."
                )
                return False
            set_orbit_image_fit(shape, "contain")
            set_picture_contain_source_rect(shape, image_size, frame_size)
        source["relationshipId"] = relationship_id
        updated_sources[source_key] = dict(source)
        changed = True
    if changed:
        return True
    warnings.append(f"OOXML prop sync skipped for {element_id}.")
    return False


def decode_image_data_url(value: Any) -> tuple[str, bytes] | str:
    if not isinstance(value, str):
        return "invalid data URL"
    header, separator, payload = value.partition(",")
    if not separator or not header.lower().startswith("data:"):
        return "invalid data URL"
    if not header.lower().endswith(";base64"):
        return "invalid data URL"

    mime_type = header[5:-7].lower()
    expected_format = {
        "image/png": "PNG",
        "image/jpeg": "JPEG",
        "image/gif": "GIF",
        "image/webp": "WEBP",
    }.get(mime_type)
    if expected_format is None:
        return f"unsupported MIME type {mime_type or 'unknown'}"

    try:
        image_blob = base64.b64decode(payload, validate=True)
        with Image.open(BytesIO(image_blob)) as image:
            image.verify()
            actual_format = str(image.format or "").upper()
    except (binascii.Error, OSError, SyntaxError, ValueError):
        return "invalid image data"
    if actual_format != expected_format:
        return f"image data does not match {mime_type}"
    return mime_type, image_blob


def replace_picture_media_relationship(
    shape: ET.Element[Any],
    source: dict[str, Any],
    slide_part: str,
    mime_type: str,
    image_blob: bytes,
    package_entries: dict[str, bytes],
    added_entries: dict[str, bytes],
    warnings: list[str],
    element_id: str,
) -> str | None:
    if shape.tag != P_PIC:
        warnings.append(f"OOXML image source is not a picture for {element_id}.")
        return None

    blip = next(shape.iter(A_BLIP), None)
    expected_relationship_id = str(source.get("relationshipId", ""))
    current_relationship_id = (
        str(blip.get(f"{{{REL_NS}}}embed", "")) if blip is not None else ""
    )
    if (
        blip is None
        or not expected_relationship_id
        or current_relationship_id != expected_relationship_id
    ):
        warnings.append(f"OOXML image relationship mismatch for {element_id}.")
        return None

    rels_part = rels_part_for_slide_part(slide_part)
    rels_xml = package_entries.get(rels_part)
    content_types_xml = package_entries.get("[Content_Types].xml")
    if rels_xml is None or not is_image_relationship(
        rels_xml, expected_relationship_id
    ):
        warnings.append(f"OOXML image relationship missing for {element_id}.")
        return None
    if content_types_xml is None:
        warnings.append(f"OOXML content types missing for {element_id}.")
        return None

    extension = extension_for_mime_type(mime_type)
    media_token = safe_package_token(
        f"{Path(slide_part).stem}_{source.get('shapeId', 'image')}"
    )
    media_name = f"orbit_sync_{media_token}.{extension}"
    media_part = f"ppt/media/{media_name}"
    relationship_id, next_rels_xml = append_image_relationship(
        rels_xml,
        f"../media/{media_name}",
    )

    blip.set(f"{{{REL_NS}}}embed", relationship_id)
    package_entries[rels_part] = next_rels_xml
    package_entries["[Content_Types].xml"] = ensure_content_type_default(
        content_types_xml,
        extension,
        mime_type,
    )
    added_entries[media_part] = image_blob
    return relationship_id


def is_image_relationship(rels_xml: bytes, relationship_id: str) -> bool:
    root = ET.fromstring(rels_xml)
    return any(
        child.get("Id") == relationship_id and child.get("Type") == IMAGE_REL_TYPE
        for child in list(root)
    )


def safe_package_token(value: str) -> str:
    token = "".join(
        char if char.isascii() and (char.isalnum() or char in "_-") else "_"
        for char in value
    )
    return token or "image"


def replace_shape_text(shape: ET.Element[Any], text: str) -> None:
    nodes = list(shape.iter(A_T))
    if not nodes:
        tx_body = ensure_text_body(shape)
        paragraph = ET.SubElement(tx_body, f"{{{DML_NS}}}p")
        run = ET.SubElement(paragraph, f"{{{DML_NS}}}r")
        ET.SubElement(run, f"{{{DML_NS}}}t")
        nodes = list(shape.iter(A_T))
    nodes[0].text = text
    for node in nodes[1:]:
        node.text = ""


def update_shape_frame(
    shape: ET.Element[Any],
    frame: dict[str, Any],
    scale: PackageFrameScale,
) -> None:
    xfrm = ensure_xfrm(shape)
    off = first_local_child(xfrm, "off")
    if off is None:
        off = ET.SubElement(xfrm, f"{{{DML_NS}}}off")
    ext = first_local_child(xfrm, "ext")
    if ext is None:
        ext = ET.SubElement(xfrm, f"{{{DML_NS}}}ext")
    x, y, width, height = frame_to_emu(frame, scale)
    off.set("x", str(x))
    off.set("y", str(y))
    ext.set("cx", str(width))
    ext.set("cy", str(height))
    if "rotation" in frame:
        xfrm.set("rot", str(round(float(frame["rotation"]) * 60000)))


def add_element_to_slide_xml(
    operation: dict[str, Any],
    element: dict[str, Any],
    package_entries: dict[str, bytes],
    added_entries: dict[str, bytes],
    scale: PackageFrameScale,
    warnings: list[str],
) -> dict[str, Any] | None:
    slide_part = slide_part_for_operation(operation)
    slide_xml = package_entries.get(slide_part)
    if slide_xml is None:
        warnings.append(
            f"OOXML slide part missing for added element {element.get('elementId')}."
        )
        return None

    root = ET.fromstring(slide_xml)
    shape_tree = first_local_descendant(root, "spTree")
    if shape_tree is None:
        warnings.append(
            f"OOXML shape tree missing for added element {element.get('elementId')}."
        )
        return None

    next_shape_id = next_c_nv_pr_id(root)
    element_id = str(element.get("elementId", ""))
    element_type = str(element.get("type", ""))
    if element_type == "text":
        shape = text_shape_element(next_shape_id, element, scale)
        source_type = "slide"
        relationship_id = None
    elif element_type == "rect":
        shape = rect_shape_element(next_shape_id, element, scale)
        source_type = "slide"
        relationship_id = None
    elif element_type == "image":
        replacement = decode_image_data_url(dict_value(element, "props").get("src"))
        if isinstance(replacement, str):
            warnings.append(
                f"OOXML add_element image skipped for {element_id}: {replacement}."
            )
            return None
        content_types_xml = package_entries.get("[Content_Types].xml")
        if content_types_xml is None:
            warnings.append(f"OOXML content types missing for {element_id}.")
            return None
        mime_type, image_blob = replacement
        extension = extension_for_mime_type(mime_type)
        rels_part = rels_part_for_slide_part(slide_part)
        rels_xml = package_entries.get(rels_part, empty_relationships_xml())
        media_name = f"orbit_sync_{Path(slide_part).stem}_{next_shape_id}.{extension}"
        media_part = f"ppt/media/{media_name}"
        try:
            relationship_id, next_rels_xml = append_image_relationship(
                rels_xml,
                f"../media/{media_name}",
            )
            next_content_types_xml = ensure_content_type_default(
                content_types_xml,
                extension,
                mime_type,
            )
        except (ET.ParseError, ValueError):
            warnings.append(f"OOXML image relationship invalid for {element_id}.")
            return None
        shape = picture_shape_element(
            next_shape_id,
            element,
            relationship_id,
            scale,
            image_dimensions(image_blob),
        )
        source_type = "image"
    else:
        warnings.append(f"OOXML add_element skipped for {element_type}.")
        return None

    if not insert_visual_shape(shape_tree, shape, element.get("zIndex")):
        warnings.append(f"OOXML zIndex invalid for added element {element_id}.")
        return None
    package_entries[slide_part] = xml_bytes(root)
    if element_type == "image":
        package_entries[rels_part] = next_rels_xml
        package_entries["[Content_Types].xml"] = next_content_types_xml
        added_entries[media_part] = image_blob

    source: dict[str, Any] = {
        "elementId": element_id,
        "elementType": element_type,
        "ooxmlOrigin": "authored",
        "ooxmlEditCapabilities": {
            "richText": "none",
            "crop": "none",
            "tableCellText": False,
            "frame": True,
            "delete": True,
            "imageSource": element_type == "image",
        },
        "slidePart": slide_part,
        "shapeId": str(next_shape_id),
        "sourceType": source_type,
        "writable": True,
    }
    if relationship_id is not None:
        source["relationshipId"] = relationship_id
    return source


def slide_part_for_operation(operation: dict[str, Any]) -> str:
    explicit = str(operation.get("sourceSlidePart", ""))
    if is_safe_slide_part(explicit):
        return explicit
    return ""


def source_slide_part(slide: dict[str, Any]) -> str:
    explicit = str(slide.get("sourceSlidePart", ""))
    if is_safe_slide_part(explicit):
        return explicit
    candidates = {
        str(source.get("slidePart", ""))
        for source in slide.get("elementSources", [])
        if isinstance(source, dict)
        and bool(source.get("writable", False))
        and is_safe_slide_part(str(source.get("slidePart", "")))
    }
    return next(iter(candidates)) if len(candidates) == 1 else ""


def route_operations_to_source_parts(
    template_blueprint: dict[str, Any],
    operations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    slides = [
        slide
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict)
    ]
    routed: list[dict[str, Any]] = []
    for operation in operations:
        if is_safe_slide_part(str(operation.get("sourceSlidePart", ""))):
            routed.append(operation)
            continue
        operation_slide_index = slide_index_from_id(
            str(operation.get("slideId", ""))
        )
        slide = next(
            (
                candidate
                for candidate in slides
                if int_value(candidate.get("slideIndex"), 0)
                == operation_slide_index
            ),
            None,
        )
        if slide is None:
            slide = next(
                (
                    candidate
                    for candidate in slides
                    if int_value(candidate.get("sourceSlideIndex"), 0)
                    == operation_slide_index
                ),
                None,
            )
        slide_part = source_slide_part(slide) if slide is not None else ""
        routed.append(
            {**operation, **({"sourceSlidePart": slide_part} if slide_part else {})}
        )
    return routed


def is_safe_slide_part(value: str) -> bool:
    return (
        value.startswith("ppt/slides/slide")
        and value.endswith(".xml")
        and "/" not in value.removeprefix("ppt/slides/")
        and ".." not in value
    )


def text_shape_element(
    shape_id: int,
    element: dict[str, Any],
    scale: PackageFrameScale,
) -> ET.Element[Any]:
    shape = base_shape_element(shape_id, "Orbit text", element, scale)
    props = dict_value(element, "props")
    tx_body = ensure_text_body(shape)
    body_pr = first_local_child(tx_body, "bodyPr")
    if body_pr is None:
        body_pr = ET.SubElement(tx_body, f"{{{DML_NS}}}bodyPr")
    body_inset = dict_value(props, "bodyInset")
    body_pr.set(
        "anchor",
        {"top": "t", "middle": "ctr", "bottom": "b"}.get(
            str(props.get("verticalAlign", "top")),
            "t",
        ),
    )
    body_pr.set("lIns", str(canvas_x_to_emu(body_inset.get("left", 0), scale)))
    body_pr.set("rIns", str(canvas_x_to_emu(body_inset.get("right", 0), scale)))
    body_pr.set("tIns", str(canvas_y_to_emu(body_inset.get("top", 0), scale)))
    body_pr.set("bIns", str(canvas_y_to_emu(body_inset.get("bottom", 0), scale)))

    paragraph = ET.SubElement(tx_body, f"{{{DML_NS}}}p")
    paragraph_properties = ET.SubElement(
        paragraph,
        f"{{{DML_NS}}}pPr",
        {
            "algn": {
                "left": "l",
                "center": "ctr",
                "right": "r",
                "justify": "just",
            }.get(str(props.get("align", "left")), "l")
        },
    )
    line_spacing = ET.SubElement(
        paragraph_properties,
        f"{{{DML_NS}}}lnSpc",
    )
    ET.SubElement(
        line_spacing,
        f"{{{DML_NS}}}spcPct",
        {"val": str(round(float(props.get("lineHeight", 1.2)) * 100000))},
    )
    run = ET.SubElement(paragraph, f"{{{DML_NS}}}r")
    run_properties = ET.SubElement(
        run,
        f"{{{DML_NS}}}rPr",
        {
            "lang": "ko-KR",
            "sz": str(round(float(props.get("fontSize", 24)) * 100)),
            "b": "1" if props.get("fontWeight", "normal") == "bold" else "0",
            "i": "1" if bool(props.get("italic", False)) else "0",
            "u": "sng" if bool(props.get("underline", False)) else "none",
        },
    )
    font_family = props.get("fontFamily")
    if isinstance(font_family, str) and font_family:
        ET.SubElement(
            run_properties,
            f"{{{DML_NS}}}latin",
            {"typeface": font_family},
        )
        ET.SubElement(
            run_properties,
            f"{{{DML_NS}}}ea",
            {"typeface": font_family},
        )
    color = props.get("color")
    if isinstance(color, str) and valid_hex_color(color):
        solid_fill = ET.SubElement(run_properties, f"{{{DML_NS}}}solidFill")
        ET.SubElement(solid_fill, f"{{{DML_NS}}}srgbClr", {"val": color[1:]})
    ET.SubElement(run, f"{{{DML_NS}}}t").text = str(
        props.get("text", "")
    )
    return shape


def rect_shape_element(
    shape_id: int,
    element: dict[str, Any],
    scale: PackageFrameScale,
) -> ET.Element[Any]:
    shape = base_shape_element(shape_id, "Orbit rect", element, scale)
    sp_pr = ensure_shape_properties(shape)
    ET.SubElement(
        ET.SubElement(sp_pr, f"{{{DML_NS}}}prstGeom", {"prst": "rect"}),
        f"{{{DML_NS}}}avLst",
    )
    fill = dict_value(element, "props").get("fill")
    if fill == "transparent":
        ET.SubElement(sp_pr, f"{{{DML_NS}}}noFill")
    elif isinstance(fill, str) and valid_hex_color(fill):
        solid_fill = ET.SubElement(sp_pr, f"{{{DML_NS}}}solidFill")
        ET.SubElement(solid_fill, f"{{{DML_NS}}}srgbClr", {"val": fill[1:]})
    return shape


def picture_shape_element(
    shape_id: int,
    element: dict[str, Any],
    relationship_id: str,
    scale: PackageFrameScale,
    image_size: tuple[int, int] | None,
) -> ET.Element[Any]:
    picture = ET.Element(P_PIC)
    nv_pic_pr = ET.SubElement(picture, f"{{{PML_NS}}}nvPicPr")
    ET.SubElement(
        nv_pic_pr,
        f"{{{PML_NS}}}cNvPr",
        {
            "id": str(shape_id),
            "name": "Orbit image",
            "descr": str(dict_value(element, "props").get("alt", "")),
        },
    )
    ET.SubElement(nv_pic_pr, f"{{{PML_NS}}}cNvPicPr")
    ET.SubElement(nv_pic_pr, f"{{{PML_NS}}}nvPr")
    blip_fill = ET.SubElement(picture, f"{{{PML_NS}}}blipFill")
    ET.SubElement(
        blip_fill,
        A_BLIP,
        {f"{{{REL_NS}}}embed": relationship_id},
    )
    stretch = ET.SubElement(blip_fill, f"{{{DML_NS}}}stretch")
    ET.SubElement(stretch, f"{{{DML_NS}}}fillRect")
    sp_pr = ET.SubElement(picture, f"{{{PML_NS}}}spPr")
    update_shape_frame(picture, element, scale)
    frame_size = picture_frame_size(picture)
    if image_size is not None and frame_size is not None:
        set_picture_contain_source_rect(picture, image_size, frame_size)
    set_orbit_image_fit(picture, "contain")
    ET.SubElement(
        ET.SubElement(sp_pr, f"{{{DML_NS}}}prstGeom", {"prst": "rect"}),
        f"{{{DML_NS}}}avLst",
    )
    return picture


VISUAL_SHAPE_NAMES = {"cxnSp", "graphicFrame", "grpSp", "pic", "sp"}


def reorder_visual_shape(
    parent: ET.Element[Any],
    shape: ET.Element[Any],
    z_index_value: Any,
) -> bool:
    visual_children = [
        child for child in list(parent) if local_name(child) in VISUAL_SHAPE_NAMES
    ]
    if shape not in visual_children:
        return False
    target_index = normalized_z_index(z_index_value, len(visual_children))
    if target_index is None:
        return False
    current_index = visual_children.index(shape)
    if current_index == target_index:
        return True

    parent.remove(shape)
    remaining = [child for child in visual_children if child is not shape]
    if target_index >= len(remaining):
        insert_at = visual_insert_end_index(parent)
    else:
        insert_at = list(parent).index(remaining[target_index])
    parent.insert(insert_at, shape)
    return True


def insert_visual_shape(
    parent: ET.Element[Any],
    shape: ET.Element[Any],
    z_index_value: Any,
) -> bool:
    visual_children = [
        child for child in list(parent) if local_name(child) in VISUAL_SHAPE_NAMES
    ]
    target_index = normalized_z_index(z_index_value, len(visual_children) + 1)
    if target_index is None:
        return False
    if target_index >= len(visual_children):
        insert_at = visual_insert_end_index(parent)
    else:
        insert_at = list(parent).index(visual_children[target_index])
    parent.insert(insert_at, shape)
    return True


def normalized_z_index(value: Any, item_count: int) -> int | None:
    if value is None:
        return max(0, item_count - 1)
    if isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or not numeric.is_integer():
        return None
    return max(0, min(int(numeric), max(0, item_count - 1)))


def visual_insert_end_index(parent: ET.Element[Any]) -> int:
    children = list(parent)
    visual_indexes = [
        index
        for index, child in enumerate(children)
        if local_name(child) in VISUAL_SHAPE_NAMES
    ]
    if visual_indexes:
        return visual_indexes[-1] + 1
    for index, child in enumerate(children):
        if local_name(child) == "extLst":
            return index
    return len(children)


def image_dimensions(image_blob: bytes) -> tuple[int, int] | None:
    try:
        with Image.open(BytesIO(image_blob)) as image:
            width, height = image.size
    except (OSError, SyntaxError, ValueError):
        return None
    if width <= 0 or height <= 0:
        return None
    return int(width), int(height)


def picture_frame_size(shape: ET.Element[Any]) -> tuple[int, int] | None:
    xfrm = first_local_descendant(shape, "xfrm")
    if xfrm is None:
        return None
    ext = first_local_child(xfrm, "ext")
    if ext is None:
        return None
    width = int_value(ext.get("cx"), 0)
    height = int_value(ext.get("cy"), 0)
    if width <= 0 or height <= 0:
        return None
    return width, height


def picture_source_image_dimensions(
    picture: ET.Element[Any],
    slide_part: str,
    package_entries: dict[str, bytes],
    added_entries: dict[str, bytes],
    source_package: zipfile.ZipFile,
) -> tuple[int, int] | None:
    blip = next(picture.iter(A_BLIP), None)
    relationship_id = (
        str(blip.get(f"{{{REL_NS}}}embed", "")) if blip is not None else ""
    )
    if not relationship_id:
        return None
    rels_xml = package_entries.get(rels_part_for_slide_part(slide_part))
    if rels_xml is None:
        return None
    try:
        rels_root = ET.fromstring(rels_xml)
    except ET.ParseError:
        return None
    relationship = next(
        (
            child
            for child in list(rels_root)
            if child.get("Id") == relationship_id
            and child.get("Type") == IMAGE_REL_TYPE
            and child.get("TargetMode") != "External"
        ),
        None,
    )
    if relationship is None:
        return None
    target = str(relationship.get("Target", ""))
    if not target:
        return None
    if target.startswith("/"):
        media_part = target.lstrip("/")
    else:
        media_part = posixpath.normpath(
            posixpath.join(posixpath.dirname(slide_part), target)
        )
    if media_part.startswith("../") or media_part == "..":
        return None
    image_blob = added_entries.get(media_part) or package_entries.get(media_part)
    if image_blob is None:
        try:
            image_blob = source_package.read(media_part)
        except (KeyError, OSError):
            return None
    return image_dimensions(image_blob)


def set_orbit_image_fit(picture: ET.Element[Any], fit: str) -> None:
    ext_list = first_local_child(picture, "extLst")
    if ext_list is None:
        ext_list = ET.SubElement(picture, f"{{{PML_NS}}}extLst")
    for extension in list(ext_list):
        if extension.get("uri") == ORBIT_IMAGE_FIT_EXTENSION_URI:
            ext_list.remove(extension)
    extension = ET.SubElement(
        ext_list,
        f"{{{PML_NS}}}ext",
        {"uri": ORBIT_IMAGE_FIT_EXTENSION_URI},
    )
    ET.SubElement(
        extension,
        f"{{{ORBIT_OOXML_NS}}}imageFit",
        {"value": fit},
    )


def picture_uses_contain_fit(picture: ET.Element[Any]) -> bool:
    for node in picture.iter():
        if (
            node.tag == f"{{{ORBIT_OOXML_NS}}}imageFit"
            and node.get("value") == "contain"
        ):
            return True
    src_rect = first_local_descendant(picture, "srcRect")
    if src_rect is None:
        return False
    values = [
        int_value(src_rect.get(edge), 0) / 100_000
        for edge in ("l", "t", "r", "b")
    ]
    return any(value < 0 for value in values) and not any(
        value > 0 for value in values
    )


def set_picture_contain_source_rect(
    picture: ET.Element[Any],
    image_size: tuple[int, int],
    frame_size: tuple[int, int],
) -> None:
    blip_fill = first_local_child(picture, "blipFill")
    if blip_fill is None:
        return
    for child in list(blip_fill):
        if local_name(child) == "srcRect":
            blip_fill.remove(child)

    image_width, image_height = image_size
    frame_width, frame_height = frame_size
    image_ratio = image_width / image_height
    frame_ratio = frame_width / frame_height
    attributes: dict[str, str] = {}
    if not math.isclose(image_ratio, frame_ratio, rel_tol=1e-6, abs_tol=1e-9):
        if image_ratio > frame_ratio:
            vertical_extension = image_ratio / frame_ratio - 1
            edge = -round(vertical_extension * 50_000)
            attributes = {"t": str(edge), "b": str(edge)}
        else:
            horizontal_extension = frame_ratio / image_ratio - 1
            edge = -round(horizontal_extension * 50_000)
            attributes = {"l": str(edge), "r": str(edge)}
    if not attributes:
        return

    children = list(blip_fill)
    blip_index = next(
        (
            index
            for index, child in enumerate(children)
            if local_name(child) == "blip"
        ),
        -1,
    )
    blip_fill.insert(
        blip_index + 1,
        ET.Element(f"{{{DML_NS}}}srcRect", attributes),
    )


def valid_hex_color(value: str) -> bool:
    if len(value) != 7 or not value.startswith("#"):
        return False
    try:
        int(value[1:], 16)
    except ValueError:
        return False
    return True


def base_shape_element(
    shape_id: int,
    name: str,
    element: dict[str, Any],
    scale: PackageFrameScale,
) -> ET.Element[Any]:
    shape = ET.Element(P_SP)
    nv_sp_pr = ET.SubElement(shape, f"{{{PML_NS}}}nvSpPr")
    ET.SubElement(
        nv_sp_pr,
        f"{{{PML_NS}}}cNvPr",
        {"id": str(shape_id), "name": name},
    )
    ET.SubElement(nv_sp_pr, f"{{{PML_NS}}}cNvSpPr")
    ET.SubElement(nv_sp_pr, f"{{{PML_NS}}}nvPr")
    update_shape_frame(shape, element, scale)
    return shape


def ensure_shape_properties(shape: ET.Element[Any]) -> ET.Element[Any]:
    sp_pr = first_local_child(shape, "spPr")
    if sp_pr is None:
        sp_pr = ET.SubElement(shape, f"{{{PML_NS}}}spPr")
    return sp_pr


def ensure_xfrm(shape: ET.Element[Any]) -> ET.Element[Any]:
    sp_pr = ensure_shape_properties(shape)
    xfrm = first_local_child(sp_pr, "xfrm")
    if xfrm is None:
        xfrm = ET.SubElement(sp_pr, f"{{{DML_NS}}}xfrm")
    return xfrm


def ensure_text_body(shape: ET.Element[Any]) -> ET.Element[Any]:
    tx_body = first_local_child(shape, "txBody")
    if tx_body is None:
        tx_body = ET.SubElement(shape, f"{{{PML_NS}}}txBody")
        ET.SubElement(tx_body, f"{{{DML_NS}}}bodyPr")
        ET.SubElement(tx_body, f"{{{DML_NS}}}lstStyle")
    return tx_body


def frame_to_emu(
    frame: dict[str, Any],
    scale: PackageFrameScale,
) -> tuple[int, int, int, int]:
    return (
        round(float(frame.get("x", 0)) * scale.slide_width_emu / scale.canvas_width),
        round(float(frame.get("y", 0)) * scale.slide_height_emu / scale.canvas_height),
        max(
            1,
            round(
                float(frame.get("width", 1))
                * scale.slide_width_emu
                / scale.canvas_width
            ),
        ),
        max(
            1,
            round(
                float(frame.get("height", 1))
                * scale.slide_height_emu
                / scale.canvas_height
            ),
        ),
    )


def canvas_x_to_emu(value: Any, scale: PackageFrameScale) -> int:
    return max(
        0,
        round(float(value) * scale.slide_width_emu / scale.canvas_width),
    )


def canvas_y_to_emu(value: Any, scale: PackageFrameScale) -> int:
    return max(
        0,
        round(float(value) * scale.slide_height_emu / scale.canvas_height),
    )


def slide_index_from_id(slide_id: str) -> int:
    suffix = slide_id.rsplit("_", maxsplit=1)[-1]
    return max(1, int_value(suffix, 1))


def next_c_nv_pr_id(root: ET.Element[Any]) -> int:
    ids = [
        int(node.get("id", "0"))
        for node in root.iter()
        if local_name(node) == "cNvPr" and str(node.get("id", "")).isdigit()
    ]
    return max(ids, default=0) + 1


def dict_value(value: dict[str, Any], key: str) -> dict[str, Any]:
    item = value.get(key)
    return item if isinstance(item, dict) else {}


def first_local_child(element: ET.Element[Any], name: str) -> ET.Element[Any] | None:
    for child in list(element):
        if local_name(child) == name:
            return child
    return None


def first_local_descendant(
    element: ET.Element[Any], name: str
) -> ET.Element[Any] | None:
    for child in element.iter():
        if local_name(child) == name:
            return child
    return None


def local_name(element: Any) -> str:
    tag = getattr(element, "tag", element)
    return str(tag).rsplit("}", maxsplit=1)[-1]


def scale_slot_bounds(slot: dict[str, Any], scale_x: float, scale_y: float) -> None:
    bounds = slot.get("bounds")
    if not isinstance(bounds, dict):
        return
    bounds["x"] = round(float(bounds.get("x", 0)) * scale_x, 3)
    bounds["y"] = round(float(bounds.get("y", 0)) * scale_y, 3)
    bounds["width"] = max(1, round(float(bounds.get("width", 1)) * scale_x, 3))
    bounds["height"] = max(1, round(float(bounds.get("height", 1)) * scale_y, 3))


def rels_part_for_slide_part(slide_part: str) -> str:
    path, name = slide_part.rsplit("/", maxsplit=1)
    return f"{path}/_rels/{name}.rels"


def append_image_relationship(rels_xml: bytes, target: str) -> tuple[str, bytes]:
    root = ET.fromstring(rels_xml)
    ids = [
        int(str(child.get("Id", "")).removeprefix("rId"))
        for child in list(root)
        if str(child.get("Id", "")).startswith("rId")
        and str(child.get("Id", "")).removeprefix("rId").isdigit()
    ]
    relationship_id = f"rId{max(ids, default=0) + 1}"
    ET.SubElement(
        root,
        f"{{{PKG_REL_NS}}}Relationship",
        {"Id": relationship_id, "Type": IMAGE_REL_TYPE, "Target": target},
    )
    return relationship_id, xml_bytes(root)


def ensure_content_type_default(
    content_types_xml: bytes,
    extension: str,
    mime_type: str,
) -> bytes:
    root = ET.fromstring(content_types_xml)
    for child in list(root):
        if child.tag.endswith("Default") and child.get("Extension") == extension:
            return content_types_xml
    ET.SubElement(
        root,
        f"{{{CONTENT_TYPES_NS}}}Default",
        {"Extension": extension, "ContentType": mime_type},
    )
    return xml_bytes(root)


def rewrite_zip(
    source: zipfile.ZipFile,
    changed_entries: dict[str, bytes],
    added_entries: dict[str, bytes] | None = None,
) -> bytes:
    buffer = BytesIO()
    added = added_entries or {}
    with zipfile.ZipFile(buffer, "w") as target:
        for info in source.infolist():
            if info.filename in added:
                continue
            target.writestr(
                info,
                changed_entries.get(info.filename, source.read(info.filename)),
            )
        for name, content in added.items():
            target.writestr(name, content)
        for name, content in changed_entries.items():
            if name not in source.namelist():
                target.writestr(name, content)
    return buffer.getvalue()


def render_pptx_to_png_assets(
    package_bytes: bytes,
    canvas: CanvasSpec,
) -> list[ImportedDesignAsset]:
    executable = shutil.which("libreoffice") or shutil.which("soffice")
    if executable is None:
        raise PptxRenderUnavailableError(
            "LibreOffice is required to render PPTX slides."
        )

    with TemporaryDirectory(prefix="orbit-ooxml-render-") as temp_dir:
        temp_path = Path(temp_dir)
        pptx_path = temp_path / "source.pptx"
        out_dir = temp_path / "out"
        out_dir.mkdir()
        pptx_path.write_bytes(package_bytes)
        try:
            subprocess.run(
                [
                    executable,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(out_dir),
                    str(pptx_path),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            raise PptxRenderUnavailableError(
                "LibreOffice failed to render PPTX slides."
            ) from error
        pdf_path = out_dir / "source.pdf"
        if not pdf_path.exists():
            raise PptxRenderUnavailableError("LibreOffice did not produce a PDF.")
        return render_pdf_to_png_assets(pdf_path, canvas)


def render_pdf_to_png_assets(
    pdf_path: Path,
    canvas: CanvasSpec,
) -> list[ImportedDesignAsset]:
    fitz: Any = importlib.import_module("fitz")
    assets: list[ImportedDesignAsset] = []
    document = fitz.open(str(pdf_path))
    try:
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            matrix = fitz.Matrix(
                canvas.width / float(page.rect.width),
                canvas.height / float(page.rect.height),
            )
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            assets.append(
                ImportedDesignAsset(
                    assetId=f"slide_render_{page_index + 1}",
                    fileName=f"slide-{page_index + 1:02d}.png",
                    mimeType="image/png",
                    contentBase64=base64.b64encode(pixmap.tobytes("png")).decode(
                        "ascii"
                    ),
                )
            )
    finally:
        document.close()
    if not assets:
        raise PptxRenderUnavailableError("Rendered PDF has no pages.")
    return assets


def shape_fallback_assets(
    blueprint: dict[str, Any],
    slide_render_assets: list[ImportedDesignAsset],
    warnings: list[str],
) -> list[ImportedDesignAsset]:
    render_assets_by_slide = slide_render_assets_by_index(slide_render_assets)
    assets: list[ImportedDesignAsset] = []
    seen_asset_ids: set[str] = set()
    slides = blueprint.get("slides", [])
    if not isinstance(slides, list):
        return assets

    for index, slide in enumerate(slides):
        if not isinstance(slide, dict):
            continue
        slide_index = int_value(slide.get("sourceSlideIndex"), index + 1)
        fallback_elements = [
            element
            for element in slide.get("elements", [])
            if isinstance(element, dict)
            and shape_fallback_asset_id_from_element(element) is not None
        ]
        if not fallback_elements:
            continue

        render_asset = render_assets_by_slide.get(slide_index)
        if render_asset is None:
            warnings.append(
                f"Shape image fallback skipped; slide render missing: {slide_index}"
            )
            continue

        try:
            image_bytes = base64.b64decode(render_asset.content_base64)
            with Image.open(BytesIO(image_bytes)) as source_image:
                rendered = source_image.convert("RGBA")
        except Exception:
            warnings.append(
                f"Shape image fallback skipped; slide render unreadable: {slide_index}"
            )
            continue

        for element in fallback_elements:
            asset_id = shape_fallback_asset_id_from_element(element)
            if asset_id is None or asset_id in seen_asset_ids:
                continue
            crop_box = element_crop_box(element, rendered.size)
            if crop_box is None:
                warnings.append(
                    f"Shape image fallback skipped; invalid frame: {asset_id}"
                )
                continue
            crop = rendered.crop(crop_box)
            buffer = BytesIO()
            crop.save(buffer, format="PNG")
            assets.append(
                ImportedDesignAsset(
                    assetId=asset_id,
                    fileName=f"{asset_id}.png",
                    mimeType="image/png",
                    contentBase64=base64.b64encode(buffer.getvalue()).decode("ascii"),
                )
            )
            seen_asset_ids.add(asset_id)

    return assets


def blueprint_has_shape_fallbacks(blueprint: dict[str, Any]) -> bool:
    slides = blueprint.get("slides", [])
    if not isinstance(slides, list):
        return False
    return any(
        isinstance(element, dict)
        and shape_fallback_asset_id_from_element(element) is not None
        for slide in slides
        if isinstance(slide, dict)
        for element in slide.get("elements", [])
    )


def strip_text_from_pptx_package(package_bytes: bytes) -> bytes:
    changed_entries: dict[str, bytes] = {}
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        for name in package.namelist():
            if not is_presentation_visual_part(name):
                continue
            root = ET.fromstring(package.read(name))
            if remove_text_bodies(root):
                changed_entries[name] = xml_bytes(root)
        if not changed_entries:
            return package_bytes
        return rewrite_zip(package, changed_entries)


def is_presentation_visual_part(name: str) -> bool:
    return (
        name.startswith("ppt/slides/slide")
        or name.startswith("ppt/slideLayouts/slideLayout")
        or name.startswith("ppt/slideMasters/slideMaster")
    ) and name.endswith(".xml")


def remove_text_bodies(element: ET.Element[Any]) -> bool:
    changed = False
    for child in list(element):
        if local_name(child) == "txBody":
            element.remove(child)
            changed = True
        elif remove_text_bodies(child):
            changed = True
    return changed


def slide_render_assets_by_index(
    slide_render_assets: list[ImportedDesignAsset],
) -> dict[int, ImportedDesignAsset]:
    assets: dict[int, ImportedDesignAsset] = {}
    for asset in slide_render_assets:
        prefix = "slide_render_"
        if not asset.asset_id.startswith(prefix):
            continue
        try:
            slide_index = int(asset.asset_id.removeprefix(prefix))
        except ValueError:
            continue
        assets[slide_index] = asset
    return assets


def shape_fallback_asset_id_from_element(element: dict[str, Any]) -> str | None:
    props = element.get("props")
    if not isinstance(props, dict):
        return None
    src = props.get("src")
    if not isinstance(src, str):
        return None
    prefix = "asset:shape_render_"
    if not src.startswith(prefix):
        return None
    return src.removeprefix("asset:")


def element_crop_box(
    element: dict[str, Any],
    image_size: tuple[int, int],
) -> tuple[int, int, int, int] | None:
    image_width, image_height = image_size
    x = math_floor_float(element.get("x"))
    y = math_floor_float(element.get("y"))
    width = math_ceil_float(element.get("width"))
    height = math_ceil_float(element.get("height"))
    if width <= 0 or height <= 0:
        return None
    left = max(0, min(image_width, x))
    top = max(0, min(image_height, y))
    right = max(left, min(image_width, x + width))
    bottom = max(top, min(image_height, y + height))
    if right <= left or bottom <= top:
        return None
    return left, top, right, bottom


def math_floor_float(value: Any) -> int:
    try:
        return math.floor(float(value))
    except (TypeError, ValueError):
        return 0


def math_ceil_float(value: Any) -> int:
    try:
        return math.ceil(float(value))
    except (TypeError, ValueError):
        return 0


def package_asset(
    asset_id: str, package_bytes: bytes, file_name: str
) -> ImportedDesignAsset:
    return ImportedDesignAsset(
        assetId=asset_id,
        fileName=file_name,
        mimeType="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        contentBase64=base64.b64encode(package_bytes).decode("ascii"),
    )


def empty_relationships_xml() -> bytes:
    return (
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    )


def extension_for_mime_type(mime_type: str) -> str:
    subtype = mime_type.rsplit("/", maxsplit=1)[-1].lower()
    if subtype == "jpeg":
        return "jpg"
    if subtype in {"png", "jpg", "gif", "webp"}:
        return subtype
    return "png"


def int_value(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def xml_bytes(element: ET.Element[Any]) -> bytes:
    namespace = namespace_for_tag(element.tag)
    if namespace in {CONTENT_TYPES_NS, PKG_REL_NS}:
        ET.register_namespace("", namespace)
    return cast(bytes, ET.tostring(element, encoding="utf-8", xml_declaration=True))


def namespace_for_tag(tag: str) -> str | None:
    if not tag.startswith("{"):
        return None
    return tag[1:].partition("}")[0]


def safe_file_stem(path: Path) -> str:
    stem = path.stem.strip() or "presentation"
    return "".join(
        char if char.isascii() and (char.isalnum() or char in "_-") else "_"
        for char in stem
    )
