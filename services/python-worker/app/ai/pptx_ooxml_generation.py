from __future__ import annotations

import base64
import importlib
import json
import math
import shutil
import subprocess
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, cast
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
IMAGE_REL_TYPE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
)
P_SP = f"{{{PML_NS}}}sp"
P_PIC = f"{{{PML_NS}}}pic"
P_PH = f"{{{PML_NS}}}ph"
A_T = f"{{{DML_NS}}}t"
A_BLIP = f"{{{DML_NS}}}blip"

ET.register_namespace("p", PML_NS)
ET.register_namespace("a", DML_NS)
ET.register_namespace("r", REL_NS)


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


class PptxOoxmlSyncResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    assets: list[ImportedDesignAsset] = Field(default_factory=list)
    element_sources: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="elementSources",
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
class MediaInsertResult:
    package_bytes: bytes
    relationship_id: str
    media_part: str


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
    topic: str = "",
    prompt: str = "",
    api_key: str | None = None,
    model: str = "gpt-4o-mini",
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
    wants_ai = bool(topic.strip() or prompt.strip())

    if wants_ai:
        if not api_key:
            raise PptxOoxmlGenerationError(
                "OPENAI_API_KEY is required for PPTX OOXML content generation."
            )
        package_bytes = replace_content_slot_text(
            package_bytes,
            template_blueprint,
            generate_content_slot_texts(
                content_slots(template_blueprint),
                topic=topic,
                prompt=prompt,
                api_key=api_key,
                model=model,
            ),
        )
        warnings.extend(media_generation_warnings(template_blueprint))

    assets = [
        package_asset("current_package", package_bytes, f"{safe_file_stem(path)}.pptx")
    ]
    if render:
        slide_render_assets = render_pptx_to_png_assets(package_bytes, canvas)
        assets.extend(slide_render_assets)
        assets.extend(
            shape_fallback_assets(imported.blueprint, slide_render_assets, warnings)
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
    package_bytes, patch_warnings = apply_patch_operations_to_package(
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
        elementSources=element_sources_for_added_operations(
            template_blueprint,
            operations,
        ),
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
        slide["renderAssetFileId"] = f"asset:slide_render_{slide_index}"
        for slot_index, slot in enumerate(slide.get("slots", []), start=1):
            if not isinstance(slot, dict):
                continue
            scale_slot_bounds(slot, scale_x, scale_y)
            if slot.get("usage") == "media-slot":
                slot["replaceMode"] = "replace"
                slot["confidence"] = max(0.65, float(slot.get("confidence", 0)))
            source = slot.setdefault("source", {})
            if isinstance(source, dict):
                source.setdefault("slidePart", f"ppt/slides/slide{slide_index}.xml")
                source.setdefault("shapeId", str(slot_index))
    return prepared


def apply_patch_operations_to_package(
    package_bytes: bytes,
    template_blueprint: dict[str, Any],
    operations: list[dict[str, Any]],
    scale: PackageFrameScale,
) -> tuple[bytes, list[str]]:
    sources = element_source_map(template_blueprint)
    warnings: list[str] = []

    with zipfile.ZipFile(BytesIO(package_bytes), "r") as source:
        slide_parts = {
            f"ppt/slides/slide{int_value(slide.get('sourceSlideIndex'), int_value(slide.get('slideIndex'), 1))}.xml"
            for slide in template_blueprint.get("slides", [])
            if isinstance(slide, dict)
        }
        slide_parts.update(
            str(item.get("slidePart", ""))
            for item in sources.values()
            if str(item.get("slidePart", ""))
        )
        slide_xml_by_part = {
            slide_part: source.read(slide_part)
            for slide_part in slide_parts
            if slide_part in source.namelist()
        }

        for operation in operations:
            apply_sync_operation(
                operation,
                sources,
                slide_xml_by_part,
                scale,
                warnings,
            )

        changed_entries = {
            slide_part: slide_xml
            for slide_part, slide_xml in slide_xml_by_part.items()
            if slide_xml != source.read(slide_part)
        }
        return rewrite_zip(source, changed_entries), warnings


def apply_sync_operation(
    operation: dict[str, Any],
    sources: dict[str, dict[str, Any]],
    slide_xml_by_part: dict[str, bytes],
    scale: PackageFrameScale,
    warnings: list[str],
) -> None:
    operation_type = str(operation.get("type", ""))
    element_id = str(operation.get("elementId", ""))

    if operation_type == "add_element":
        element = operation.get("element")
        if isinstance(element, dict):
            add_element_to_slide_xml(
                operation, element, slide_xml_by_part, scale, warnings
            )
        return

    source = sources.get(element_id)
    if not source:
        warnings.append(f"OOXML source missing for {element_id}.")
        return
    if not bool(source.get("writable", False)):
        warnings.append(f"OOXML source is locked for {element_id}.")
        return

    slide_part = str(source.get("slidePart", ""))
    slide_xml = slide_xml_by_part.get(slide_part)
    if slide_xml is None:
        warnings.append(f"OOXML slide part missing for {element_id}.")
        return

    root = ET.fromstring(slide_xml)
    shape, parent = find_shape_by_id(root, str(source.get("shapeId", "")))
    if shape is None:
        warnings.append(f"OOXML shape missing for {element_id}.")
        return

    if operation_type == "update_element_props":
        props = operation.get("props")
        if isinstance(props, dict):
            update_shape_props(shape, props, warnings, element_id)
    elif operation_type == "update_element_frame":
        frame = operation.get("frame")
        if isinstance(frame, dict):
            update_shape_frame(shape, frame, scale)
            if "zIndex" in frame:
                warnings.append(f"OOXML zIndex sync skipped for {element_id}.")
    elif operation_type == "delete_element":
        if parent is not None:
            parent.remove(shape)

    slide_xml_by_part[slide_part] = xml_bytes(root)


def element_source_map(template_blueprint: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(source.get("elementId")): source
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict)
        for source in slide.get("elementSources", [])
        if isinstance(source, dict) and source.get("elementId")
    }


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


def update_shape_props(
    shape: ET.Element[Any],
    props: dict[str, Any],
    warnings: list[str],
    element_id: str,
) -> None:
    if "text" in props:
        replace_shape_text(shape, str(props.get("text") or ""))
        return
    warnings.append(f"OOXML prop sync skipped for {element_id}.")


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
    off = first_local_child(xfrm, "off") or ET.SubElement(
        xfrm,
        f"{{{DML_NS}}}off",
    )
    ext = first_local_child(xfrm, "ext") or ET.SubElement(
        xfrm,
        f"{{{DML_NS}}}ext",
    )
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
    slide_xml_by_part: dict[str, bytes],
    scale: PackageFrameScale,
    warnings: list[str],
) -> None:
    slide_index = slide_index_from_id(str(operation.get("slideId", "")))
    slide_part = f"ppt/slides/slide{slide_index}.xml"
    slide_xml = slide_xml_by_part.get(slide_part)
    if slide_xml is None:
        warnings.append(
            f"OOXML slide part missing for added element {element.get('elementId')}."
        )
        return

    root = ET.fromstring(slide_xml)
    shape_tree = first_local_descendant(root, "spTree")
    if shape_tree is None:
        warnings.append(
            f"OOXML shape tree missing for added element {element.get('elementId')}."
        )
        return

    next_shape_id = next_c_nv_pr_id(root)
    element_type = str(element.get("type", ""))
    if element_type == "text":
        shape_tree.append(text_shape_element(next_shape_id, element, scale))
    elif element_type == "rect":
        shape_tree.append(rect_shape_element(next_shape_id, element, scale))
    else:
        warnings.append(f"OOXML add_element skipped for {element_type}.")
        return
    slide_xml_by_part[slide_part] = xml_bytes(root)


def element_sources_for_added_operations(
    template_blueprint: dict[str, Any],
    operations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    del template_blueprint
    sources: list[dict[str, Any]] = []
    for operation in operations:
        if operation.get("type") != "add_element" or not isinstance(
            operation.get("element"), dict
        ):
            continue
        element = cast(dict[str, Any], operation["element"])
        element_id = str(element.get("elementId", ""))
        if not element_id:
            continue
        sources.append(
            {
                "elementId": element_id,
                "slidePart": f"ppt/slides/slide{slide_index_from_id(str(operation.get('slideId', '')))}.xml",
                "shapeId": "0",
                "sourceType": "slide",
                "writable": False,
                "fallbackReason": "source map refresh required",
            }
        )
    return sources


def text_shape_element(
    shape_id: int,
    element: dict[str, Any],
    scale: PackageFrameScale,
) -> ET.Element[Any]:
    shape = base_shape_element(shape_id, "Orbit text", element, scale)
    tx_body = ensure_text_body(shape)
    paragraph = ET.SubElement(tx_body, f"{{{DML_NS}}}p")
    run = ET.SubElement(paragraph, f"{{{DML_NS}}}r")
    ET.SubElement(run, f"{{{DML_NS}}}t").text = str(
        dict_value(element, "props").get("text", "")
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
    return shape


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


def content_slots(template_blueprint: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        slot
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict)
        for slot in slide.get("slots", [])
        if isinstance(slot, dict)
        and slot.get("usage") == "content-slot"
        and slot.get("replaceMode") == "replace"
    ]


def media_generation_warnings(template_blueprint: dict[str, Any]) -> list[str]:
    return [
        f"AI media generation skipped for {slot.get('elementId')}; original media preserved."
        for slide in template_blueprint.get("slides", [])
        if isinstance(slide, dict)
        for slot in slide.get("slots", [])
        if isinstance(slot, dict)
        and slot.get("usage") == "media-slot"
        and slot.get("replaceMode") == "replace"
    ]


def generate_content_slot_texts(
    slots: list[dict[str, Any]],
    *,
    topic: str,
    prompt: str,
    api_key: str,
    model: str,
) -> list[str]:
    if not slots:
        return []

    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.responses.create(
        model=model,
        instructions=(
            "Return JSON only. Fill PPTX content slots with concise Korean "
            "presentation copy while preserving the template structure."
        ),
        input=json.dumps(
            {
                "topic": topic,
                "prompt": prompt,
                "slots": [
                    {
                        "elementId": slot.get("elementId"),
                        "slotRole": slot.get("slotRole"),
                    }
                    for slot in slots
                ],
            },
            ensure_ascii=False,
        ),
    )
    output_text = str(getattr(response, "output_text", "")).strip()
    try:
        payload = json.loads(output_text)
    except json.JSONDecodeError as error:
        raise PptxOoxmlGenerationError("LLM returned invalid JSON.") from error

    values = payload.get("texts") if isinstance(payload, dict) else None
    if not isinstance(values, list):
        raise PptxOoxmlGenerationError("LLM response must include a texts array.")

    texts = [str(value).strip() for value in values if str(value).strip()]
    if len(texts) < len(slots):
        raise PptxOoxmlGenerationError("LLM returned fewer texts than content slots.")
    return texts[: len(slots)]


def replace_content_slot_text(
    package_bytes: bytes,
    template_blueprint: dict[str, Any],
    texts: list[str],
) -> bytes:
    if not texts:
        return package_bytes

    replacements_by_slide: dict[int, list[str]] = {}
    text_cursor = 0
    for slide in template_blueprint.get("slides", []):
        if not isinstance(slide, dict):
            continue
        slide_index = int_value(
            slide.get("sourceSlideIndex"),
            int_value(slide.get("slideIndex"), 1),
        )
        count = sum(
            1
            for slot in slide.get("slots", [])
            if isinstance(slot, dict)
            and slot.get("usage") == "content-slot"
            and slot.get("replaceMode") == "replace"
        )
        if count:
            replacements_by_slide[slide_index] = texts[
                text_cursor : text_cursor + count
            ]
            text_cursor += count

    changed_entries: dict[str, bytes] = {}
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as source:
        for slide_index, slide_texts in replacements_by_slide.items():
            entry = f"ppt/slides/slide{slide_index}.xml"
            changed_entries[entry] = replace_slide_texts(
                source.read(entry), slide_texts
            )
        return rewrite_zip(source, changed_entries)


def replace_slide_texts(slide_xml: bytes, texts: list[str]) -> bytes:
    root = ET.fromstring(slide_xml)
    text_shapes = sorted(
        (shape for shape in root.iter(P_SP) if list(shape.iter(A_T))),
        key=lambda shape: 0 if next(shape.iter(P_PH), None) is not None else 1,
    )
    for shape, text in zip(text_shapes, texts, strict=False):
        nodes = list(shape.iter(A_T))
        if not nodes:
            continue
        nodes[0].text = text
        for node in nodes[1:]:
            node.text = ""
    return xml_bytes(root)


def insert_media_slot_image(
    package_bytes: bytes,
    *,
    slide_index: int,
    image_blob: bytes,
    mime_type: str = "image/png",
) -> MediaInsertResult:
    extension = extension_for_mime_type(mime_type)
    media_part = f"ppt/media/orbit_media_{slide_index}.{extension}"
    slide_entry = f"ppt/slides/slide{slide_index}.xml"
    rels_entry = f"ppt/slides/_rels/slide{slide_index}.xml.rels"

    with zipfile.ZipFile(BytesIO(package_bytes), "r") as source:
        slide_xml = source.read(slide_entry)
        rels_xml = (
            source.read(rels_entry)
            if rels_entry in source.namelist()
            else empty_relationships_xml()
        )
        relationship_id, next_rels_xml = append_image_relationship(
            rels_xml,
            f"../media/orbit_media_{slide_index}.{extension}",
        )
        next_slide_xml = replace_first_picture_relationship(
            slide_xml,
            relationship_id,
        )
        changed = {
            slide_entry: next_slide_xml,
            rels_entry: next_rels_xml,
            "[Content_Types].xml": ensure_content_type_default(
                source.read("[Content_Types].xml"),
                extension,
                mime_type,
            ),
        }
        package = rewrite_zip(source, changed, {media_part: image_blob})

    return MediaInsertResult(
        package_bytes=package,
        relationship_id=relationship_id,
        media_part=media_part,
    )


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


def replace_first_picture_relationship(slide_xml: bytes, relationship_id: str) -> bytes:
    root = ET.fromstring(slide_xml)
    for picture in root.iter(P_PIC):
        blip = next(picture.iter(A_BLIP), None)
        if blip is not None:
            blip.set(f"{{{REL_NS}}}embed", relationship_id)
            return xml_bytes(root)
    raise PptxOoxmlGenerationError("No picture shape found for media-slot replacement.")


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
    return cast(bytes, ET.tostring(element, encoding="utf-8", xml_declaration=True))


def safe_file_stem(path: Path) -> str:
    stem = path.stem.strip() or "presentation"
    return "".join(
        char if char.isascii() and (char.isalnum() or char in "_-") else "_"
        for char in stem
    )
