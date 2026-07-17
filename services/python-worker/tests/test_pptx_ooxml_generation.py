import base64
import copy
import hashlib
import shutil
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from PIL import Image
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches

from app.ai.pptx_ooxml_generation import (
    PptxRenderUnavailableError,
    generate_pptx_ooxml,
    render_pptx_to_png_assets,
    shape_fallback_assets,
    source_slide_part,
    strip_text_from_pptx_package,
    sync_pptx_ooxml,
)
from app.ai.pptx_design_importer import ImportedDesignAsset
from app.main import app


def test_pure_generation_preserves_package_entries_and_source_text(
    tmp_path: Path,
) -> None:
    pptx_path = sample_pptx(tmp_path)

    result = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    package_asset = next(
        asset for asset in result.assets if asset.asset_id == "current_package"
    )
    package_bytes = base64.b64decode(package_asset.content_base64)

    assert package_bytes == pptx_path.read_bytes()
    assert zip_entry_hashes(package_bytes) == zip_entry_hashes(pptx_path.read_bytes())
    assert len(result.template_blueprint["slides"]) == 1
    assert result.template_blueprint["currentPackageFileId"] == "asset:current_package"
    assert result.template_blueprint["slides"][0]["ooxmlOrigin"] == "imported"
    assert result.template_blueprint["slides"][0]["ooxmlMotionCapabilities"] == {
        "transitionWritable": True,
        "importedMainSequenceCoverage": "absent",
    }
    assert all(
        source["elementType"]
        and source["ooxmlOrigin"] == "imported"
        and source["ooxmlEditCapabilities"]["richText"]
        == ("full" if source["elementType"] == "text" else "none")
        and source["ooxmlEditCapabilities"]["crop"]
        == (
            "picture"
            if source["elementType"] == "image" and source["sourceType"] == "image"
            else "none"
        )
        and source["ooxmlEditCapabilities"]["tableCellText"] is False
        and isinstance(source["ooxmlEditCapabilities"]["frame"], bool)
        and isinstance(source["ooxmlEditCapabilities"]["imageSource"], bool)
        and source["ooxmlEditCapabilities"]["delete"]
        is source["ooxmlEditCapabilities"]["frame"]
        for source in result.template_blueprint["slides"][0]["elementSources"]
    )
    assert result.blueprint["slides"][0]["elements"]
    assert any(
        element["type"] == "text" and element["props"]["text"] == "Placeholder Title"
        for element in result.blueprint["slides"][0]["elements"]
    )


def test_apply_slot_texts_route_is_not_registered() -> None:
    assert "/ai/pptx-ooxml-apply-slot-texts" not in app.openapi()["paths"]


def test_source_slide_part_fails_closed_for_ambiguous_legacy_sources() -> None:
    assert (
        source_slide_part(
            {
                "elementSources": [
                    {
                        "slidePart": "ppt/slides/slide1.xml",
                        "writable": True,
                    },
                    {
                        "slidePart": "ppt/slides/slide2.xml",
                        "writable": True,
                    },
                ]
            }
        )
        == ""
    )


def test_generation_blueprint_uses_detected_canvas(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path, wide=False)

    result = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    background = next(
        element
        for element in result.blueprint["slides"][0]["elements"]
        if element["role"] == "background"
    )
    title_slot = next(
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["usage"] == "content-slot"
    )

    assert result.canvas["preset"] == "standard-4-3"
    assert result.blueprint["canvas"] == {"width": 1024, "height": 768}
    assert background["width"] == 1024
    assert background["height"] == 768
    assert title_slot["bounds"]["width"] <= 1024
    assert title_slot["bounds"]["height"] <= 768


def test_extracts_slot_mapping(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path)
    result = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    slots = result.template_blueprint["slides"][0]["slots"]

    assert any(slot["usage"] == "content-slot" for slot in slots)
    assert any(
        slot["usage"] == "media-slot" and slot["replaceMode"] == "replace"
        for slot in slots
    )
    assert all(
        slot["source"].get("slidePart") == "ppt/slides/slide1.xml" for slot in slots
    )


def test_generation_includes_imported_image_assets(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path)

    result = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image_asset = next(asset for asset in result.assets if asset.asset_id == "image_1")

    assert image_asset.mime_type == "image/png"
    assert base64.b64decode(image_asset.content_base64).startswith(b"\x89PNG")


def test_sync_pptx_ooxml_applies_imported_full_text_and_frame_atomically(
    tmp_path: Path,
) -> None:
    pptx_path = sample_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    title_slot = next(
        slot
        for slot in generated.template_blueprint["slides"][0]["slots"]
        if slot["usage"] == "content-slot"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas={
            "preset": "wide-16-9",
            "width": 1920,
            "height": 1080,
            "aspectRatio": "16:9",
        },
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": title_slot["elementId"],
                "props": {"text": "Synced Title"},
            },
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": title_slot["elementId"],
                "frame": {"x": 96, "y": 48, "width": 640, "height": 120},
            },
        ],
    )
    package = current_package_bytes(result.assets)
    assert package != original_bytes
    assert b"Synced Title" in shape_xml(package, title_slot["source"]["shapeId"])
    assert [item.operation_type for item in result.applied_operations] == [
        "update_element_props",
        "update_element_frame",
    ]
    assert result.unsupported_operations == []


def test_sync_pptx_ooxml_applies_imported_frame_patch(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    title_slot = next(
        slot
        for slot in generated.template_blueprint["slides"][0]["slots"]
        if slot["usage"] == "content-slot"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": title_slot["elementId"],
                "frame": {"x": 96, "y": 48, "width": 640, "height": 120},
            }
        ],
    )
    package_bytes = current_package_bytes(result.assets)

    assert b'x="609600"' in package_entry(package_bytes, "ppt/slides/slide1.xml")
    assert b'cx="4064000"' in package_entry(package_bytes, "ppt/slides/slide1.xml")
    assert [operation.operation_type for operation in result.applied_operations] == [
        "update_element_frame"
    ]
    assert result.unsupported_operations == []


def test_sync_pptx_ooxml_applies_imported_z_index_to_shape_tree(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    target_source = generated.template_blueprint["slides"][0]["elementSources"][0]

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": target_source["elementId"],
                "frame": {"zIndex": 999},
            }
        ],
    )

    assert result.unsupported_operations == []
    assert len(result.applied_operations) == 1
    assert slide_visual_shape_ids(current_package_bytes(result.assets))[-1] == str(
        target_source["shapeId"]
    )


@pytest.mark.parametrize("operation_type", ["delete_element", "update_element_frame"])
def test_sync_pptx_ooxml_rejects_partial_shared_shape_operation_atomically(
    tmp_path: Path,
    operation_type: str,
) -> None:
    pptx_path = sample_split_fill_text_shape_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    sources = generated.template_blueprint["slides"][0]["elementSources"]
    cohorts: dict[str, list[dict]] = {}
    for source in sources:
        cohorts.setdefault(source["shapeId"], []).append(source)
    cohort = next(members for members in cohorts.values() if len(members) > 1)
    assert all(
        source["ooxmlEditCapabilities"]["frame"] is False
        and source["ooxmlEditCapabilities"]["delete"] is False
        for source in cohort
    )
    operation = {
        "type": operation_type,
        "slideId": "slide_import_file_template_1",
        "elementId": cohort[0]["elementId"],
    }
    if operation_type == "update_element_frame":
        operation["frame"] = {"x": 200, "y": 160, "width": 500, "height": 180}

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[operation],
    )

    assert current_package_bytes(result.assets) == pptx_path.read_bytes()
    assert result.applied_operations == []
    assert len(result.unsupported_operations) == 1
    assert result.unsupported_operations[0].reason_code == "SHARED_SHAPE_COHORT_UNSAFE"


def test_sync_pptx_ooxml_applies_consistent_shared_shape_operations_once(
    tmp_path: Path,
) -> None:
    pptx_path = sample_split_fill_text_shape_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    sources = generated.template_blueprint["slides"][0]["elementSources"]
    cohorts: dict[str, list[dict]] = {}
    for source in sources:
        cohorts.setdefault(source["shapeId"], []).append(source)
    cohort = next(members for members in cohorts.values() if len(members) > 1)
    frames = [
        {"x": 200, "y": 160, "width": 500, "height": 180},
        {"x": 300, "y": 200, "width": 500, "height": 180},
    ]

    framed = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
                "frame": frame,
            }
            for frame in frames
            for source in cohort
        ],
    )
    assert framed.unsupported_operations == []
    assert len(framed.applied_operations) == len(cohort) * len(frames)
    assert b'x="1905000"' in shape_xml(
        current_package_bytes(framed.assets), cohort[0]["shapeId"]
    )

    deleted = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "delete_element",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
            }
            for source in cohort
        ],
    )
    assert deleted.unsupported_operations == []
    assert len(deleted.applied_operations) == len(cohort)
    with pytest.raises(AssertionError):
        shape_xml(current_package_bytes(deleted.assets), cohort[0]["shapeId"])


def test_sync_pptx_ooxml_edits_shared_shape_text_without_changing_geometry(
    tmp_path: Path,
) -> None:
    pptx_path = sample_split_fill_text_shape_pptx(tmp_path)
    original_package = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    target = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element.get("props", {}).get("text") == "Shared native fill and text"
    )
    source = source_for_element(
        generated.template_blueprint["slides"][0]["elementSources"],
        target["elementId"],
    )
    assert source["ooxmlEditCapabilities"]["richText"] == "full"
    original_shape_properties = shape_child_xml(
        original_package,
        source["shapeId"],
        "spPr",
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": target["elementId"],
                "props": {"fontWeight": "bold"},
            }
        ],
    )

    assert result.unsupported_operations == []
    assert len(result.applied_operations) == 1
    package_bytes = current_package_bytes(result.assets)
    assert (
        shape_child_xml(package_bytes, source["shapeId"], "spPr")
        == original_shape_properties
    )
    assert b'b="1"' in shape_child_xml(package_bytes, source["shapeId"], "txBody")


def test_sync_pptx_ooxml_partial_frame_fails_without_changing_package(
    tmp_path: Path,
) -> None:
    pptx_path = sample_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    title_slot = next(
        slot
        for slot in generated.template_blueprint["slides"][0]["slots"]
        if slot["usage"] == "content-slot"
    )
    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": title_slot["elementId"],
                "frame": {"x": 96},
            }
        ],
    )
    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert len(result.unsupported_operations) == 1
    assert result.unsupported_operations[0].reason_code == "FRAME_FIELDS_UNSUPPORTED"


def test_sync_pptx_ooxml_skips_grouped_child_frame_patch(tmp_path: Path) -> None:
    pptx_path = sample_scaled_group_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    target = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element.get("props", {}).get("text") == "Grouped frame target"
    )
    original_frame = {
        key: target[key] for key in ("x", "y", "width", "height", "rotation")
    }

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": target["elementId"],
                "frame": {
                    "x": target["x"] + 100,
                    "y": target["y"] + 50,
                    "width": target["width"],
                    "height": target["height"],
                },
            }
        ],
    )
    package_bytes = current_package_bytes(result.assets)

    assert package_bytes == original_bytes
    assert result.warnings == [
        f"OOXML grouped frame sync skipped for {target['elementId']}."
    ]
    assert result.applied_operations == []
    assert len(result.unsupported_operations) == 1
    assert result.unsupported_operations[0].reason_code == "GROUPED_FRAME_UNSUPPORTED"

    synced_path = tmp_path / "grouped-frame-synced.pptx"
    synced_path.write_bytes(package_bytes)
    reimported = generate_pptx_ooxml(synced_path, "file_template", render=False)
    reimported_target = next(
        element
        for element in reimported.blueprint["slides"][0]["elements"]
        if element.get("props", {}).get("text") == "Grouped frame target"
    )
    assert {
        key: reimported_target[key] for key in ("x", "y", "width", "height", "rotation")
    } == original_frame


def test_sync_pptx_ooxml_edits_grouped_child_text_without_changing_group_frame(
    tmp_path: Path,
) -> None:
    pptx_path = sample_scaled_group_pptx(tmp_path)
    original_package = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    target = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element.get("props", {}).get("text") == "Grouped frame target"
    )
    source = source_for_element(
        generated.template_blueprint["slides"][0]["elementSources"],
        target["elementId"],
    )
    assert source["ooxmlEditCapabilities"]["richText"] == "full"
    original_shape_properties = shape_child_xml(
        original_package,
        source["shapeId"],
        "spPr",
    )
    original_group_properties = containing_group_properties_xml(
        original_package,
        source["shapeId"],
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": target["elementId"],
                "props": {"italic": True},
            }
        ],
    )

    assert result.unsupported_operations == []
    assert len(result.applied_operations) == 1
    package_bytes = current_package_bytes(result.assets)
    assert (
        shape_child_xml(package_bytes, source["shapeId"], "spPr")
        == original_shape_properties
    )
    assert (
        containing_group_properties_xml(package_bytes, source["shapeId"])
        == original_group_properties
    )
    assert b'i="1"' in shape_child_xml(package_bytes, source["shapeId"], "txBody")


def test_sync_pptx_ooxml_applies_imported_picture_crop(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element["type"] == "image"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": image["elementId"],
                "props": {"crop": {"left": 0.1, "top": 0, "right": 0, "bottom": 0}},
            }
        ],
    )

    source = source_for_element(
        generated.template_blueprint["slides"][0]["elementSources"],
        image["elementId"],
    )
    assert current_package_bytes(result.assets) != original_bytes
    assert len(result.applied_operations) == 1
    assert result.unsupported_operations == []
    assert source["ooxmlEditCapabilities"]["crop"] == "picture"
    assert b'<a:srcRect l="10000" t="0" r="0" b="0"' in shape_xml(
        current_package_bytes(result.assets),
        source["shapeId"],
    )


def test_sync_pptx_ooxml_rejects_crop_when_source_capability_is_missing(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element["type"] == "image"
    )
    unsafe_blueprint = copy.deepcopy(generated.template_blueprint)
    source = source_for_element(
        unsafe_blueprint["slides"][0]["elementSources"],
        image["elementId"],
    )
    source["ooxmlEditCapabilities"]["crop"] = "none"

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=unsafe_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": image["elementId"],
                "props": {"crop": None},
            }
        ],
    )

    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert len(result.unsupported_operations) == 1
    assert result.unsupported_operations[0].reason_code == "CROP_CAPABILITY_UNSAFE"


def test_sync_pptx_ooxml_rejects_crop_when_relationship_locator_mismatches(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    unsafe_blueprint = copy.deepcopy(generated.template_blueprint)
    source = next(
        item
        for item in unsafe_blueprint["slides"][0]["elementSources"]
        if item["ooxmlEditCapabilities"]["crop"] == "picture"
    )
    source["relationshipId"] = "rId-mismatch"

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=unsafe_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
                "props": {"crop": {"left": 0.1, "top": 0, "right": 0, "bottom": 0}},
            }
        ],
    )

    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert len(result.unsupported_operations) == 1
    assert result.unsupported_operations[0].reason_code == "CROP_CAPABILITY_UNSAFE"


def test_sync_pptx_ooxml_applies_crop_after_image_add_in_same_batch(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image_blob = png_sized_bytes(16, 8, "#22c55e")
    element_id = "el_add_then_crop"

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": element_id,
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 320,
                    "height": 180,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(image_blob).decode("ascii"),
                        "fit": "contain",
                    },
                },
            },
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": element_id,
                "props": {
                    "crop": {
                        "left": 0.2,
                        "top": 0.1,
                        "right": 0.15,
                        "bottom": 0.05,
                    }
                },
            },
        ],
    )
    source = source_for_element(result.element_sources, element_id)

    assert result.unsupported_operations == []
    assert len(result.applied_operations) == 2
    assert source["ooxmlEditCapabilities"]["crop"] == "picture"
    assert b'<a:srcRect l="20000" t="10000" r="15000" b="5000"' in shape_xml(
        current_package_bytes(result.assets),
        source["shapeId"],
    )


def test_sync_pptx_ooxml_round_trips_picture_fill_crop(tmp_path: Path) -> None:
    pptx_path = sample_picture_fill_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    source = next(
        item
        for item in generated.template_blueprint["slides"][0]["elementSources"]
        if item["ooxmlEditCapabilities"]["crop"] == "picture-fill"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
                "props": {
                    "crop": {
                        "left": 0.2,
                        "top": 0.1,
                        "right": 0.15,
                        "bottom": 0.05,
                    }
                },
            }
        ],
    )
    package_bytes = current_package_bytes(result.assets)

    assert result.unsupported_operations == []
    assert len(result.applied_operations) == 1
    assert b'<a:srcRect l="20000" t="10000" r="15000" b="5000"' in shape_xml(
        package_bytes,
        source["shapeId"],
    )

    synced_path = tmp_path / "picture-fill-crop-synced.pptx"
    synced_path.write_bytes(package_bytes)
    reimported = generate_pptx_ooxml(synced_path, "file_reimported", render=False)
    reimported_source = next(
        item
        for item in reimported.template_blueprint["slides"][0]["elementSources"]
        if item["shapeId"] == source["shapeId"]
        and item["sourceType"] == "shape"
        and item["elementType"] == "image"
    )
    reimported_element = next(
        item
        for item in reimported.blueprint["slides"][0]["elements"]
        if item["elementId"] == reimported_source["elementId"]
    )
    assert reimported_source["ooxmlEditCapabilities"]["crop"] == "picture-fill"
    assert reimported_element["props"]["crop"] == {
        "left": 0.2,
        "top": 0.1,
        "right": 0.15,
        "bottom": 0.05,
    }


def test_sync_pptx_ooxml_rejects_prop_type_mismatch_without_package_changes(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element["type"] == "image"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": image["elementId"],
                "props": {"text": "must not reach a picture"},
            }
        ],
    )

    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert result.unsupported_operations[0].reason_code == "ELEMENT_TYPE_MISMATCH"


def test_sync_pptx_ooxml_rejects_legacy_source_without_provenance(
    tmp_path: Path,
) -> None:
    pptx_path = sample_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    blueprint = copy.deepcopy(generated.template_blueprint)
    source = next(
        item for item in blueprint["slides"][0]["elementSources"] if item["writable"]
    )
    source.pop("ooxmlOrigin", None)

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
                "frame": {"x": 100, "y": 100, "width": 400, "height": 100},
            }
        ],
    )

    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert result.unsupported_operations[0].reason_code == "SOURCE_PROVENANCE_UNSAFE"


def test_sync_pptx_ooxml_round_trips_target_image(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    elements = generated.blueprint["slides"][0]["elements"]
    sources = generated.template_blueprint["slides"][0]["elementSources"]
    images = [element for element in elements if element["type"] == "image"]
    target_image = next(
        element for element in images if element["props"]["src"] == "asset:image_2"
    )
    untouched_image = next(
        element for element in images if element["props"]["src"] == "asset:image_1"
    )
    fallback_source = next(source for source in sources if source.get("fallbackReason"))
    target_source = source_for_element(sources, target_image["elementId"])
    untouched_source = source_for_element(sources, untouched_image["elementId"])
    replacement_bytes = png_bytes("#00ff00")
    replacement_data_url = "data:image/png;base64," + base64.b64encode(
        replacement_bytes
    ).decode("ascii")

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": target_image["elementId"],
                "props": {
                    "src": replacement_data_url,
                    "alt": "Replaced target image",
                },
            },
        ],
    )
    package_bytes = current_package_bytes(result.assets)
    target_relationship_id = picture_relationship_id(
        package_bytes, target_source["shapeId"]
    )

    assert result.warnings == []
    assert b'descr="Replaced target image"' in shape_xml(
        package_bytes,
        target_source["shapeId"],
    )
    assert target_relationship_id != target_source["relationshipId"]
    assert (
        source_for_element(
            result.element_sources,
            target_image["elementId"],
        )["relationshipId"]
        == target_relationship_id
    )
    assert (
        picture_relationship_id(package_bytes, untouched_source["shapeId"])
        == untouched_source["relationshipId"]
    )
    assert (
        relationship_blob(
            package_bytes,
            "ppt/slides/slide1.xml",
            target_relationship_id,
        )
        == replacement_bytes
    )
    assert relationship_blob(
        package_bytes,
        "ppt/slides/slide1.xml",
        untouched_source["relationshipId"],
    ) == relationship_blob(
        original_bytes,
        "ppt/slides/slide1.xml",
        untouched_source["relationshipId"],
    )
    assert shape_xml(package_bytes, fallback_source["shapeId"]) == shape_xml(
        original_bytes,
        fallback_source["shapeId"],
    )

    round_trip_path = tmp_path / "round-trip.pptx"
    round_trip_path.write_bytes(package_bytes)
    round_trip = generate_pptx_ooxml(
        round_trip_path,
        "file_round_trip",
        render=False,
    )

    assert replacement_bytes in {
        base64.b64decode(asset.content_base64)
        for asset in round_trip.assets
        if asset.mime_type == "image/png"
    }
    assert any(
        source.get("fallbackReason") == fallback_source["fallbackReason"]
        for source in round_trip.template_blueprint["slides"][0]["elementSources"]
    )


def test_sync_pptx_ooxml_adds_writable_text_rect_and_image(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    first_image = png_bytes("#00ff00")
    second_image = png_bytes("#ffff00")
    added_elements = [
        {
            "elementId": "el_added_text",
            "type": "text",
            "x": 100,
            "y": 600,
            "width": 500,
            "height": 100,
            "props": {
                "text": "Added text",
                "bodyInset": {"left": 12, "right": 8, "top": 4, "bottom": 6},
                "fontFamily": "Pretendard",
                "fontSize": 30,
                "fontWeight": "bold",
                "italic": True,
                "underline": True,
                "color": "#123456",
                "align": "center",
                "verticalAlign": "middle",
                "lineHeight": 1.4,
            },
        },
        {
            "elementId": "el_added_rect",
            "type": "rect",
            "x": 700,
            "y": 600,
            "width": 300,
            "height": 100,
            "props": {"fill": "#336699"},
        },
        {
            "elementId": "el_added_image",
            "type": "image",
            "x": 1100,
            "y": 550,
            "width": 240,
            "height": 180,
            "props": {
                "src": "data:image/png;base64,"
                + base64.b64encode(first_image).decode("ascii"),
                "crop": {
                    "left": 0.2,
                    "top": 0.1,
                    "right": 0.15,
                    "bottom": 0.05,
                },
            },
        },
    ]

    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": element,
            }
            for element in added_elements
        ],
    )

    assert added.warnings == []
    added_sources = {source["elementId"]: source for source in added.element_sources}
    assert set(added_sources) == {
        "el_added_text",
        "el_added_rect",
        "el_added_image",
    }
    assert all(
        source["shapeId"] != "0" and source["writable"] is True
        for source in added_sources.values()
    )
    assert all(
        source["ooxmlOrigin"] == "authored"
        and source["ooxmlEditCapabilities"]["tableCellText"] is False
        and source["ooxmlEditCapabilities"]["frame"] is True
        and source["ooxmlEditCapabilities"]["delete"] is True
        for source in added_sources.values()
    )
    assert added_sources["el_added_text"]["ooxmlEditCapabilities"]["richText"] == (
        "full"
    )
    assert added_sources["el_added_rect"]["ooxmlEditCapabilities"]["richText"] == (
        "none"
    )
    assert added_sources["el_added_image"]["ooxmlEditCapabilities"]["richText"] == (
        "none"
    )
    assert added_sources["el_added_image"]["ooxmlEditCapabilities"]["crop"] == (
        "picture"
    )
    assert added_sources["el_added_text"]["ooxmlEditCapabilities"]["crop"] == "none"
    assert added_sources["el_added_rect"]["ooxmlEditCapabilities"]["crop"] == "none"
    assert (
        added_sources["el_added_image"]["ooxmlEditCapabilities"]["imageSource"] is True
    )
    assert (
        added_sources["el_added_text"]["ooxmlEditCapabilities"]["imageSource"] is False
    )
    assert (
        added_sources["el_added_rect"]["ooxmlEditCapabilities"]["imageSource"] is False
    )
    assert len(added.applied_operations) == 3
    assert added.unsupported_operations == []
    assert added_sources["el_added_image"]["relationshipId"].startswith("rId")
    added_package = current_package_bytes(added.assets)
    assert b'<a:srcRect l="20000" t="10000" r="15000" b="5000"' in shape_xml(
        added_package,
        added_sources["el_added_image"]["shapeId"],
    )
    assert slide_visual_shape_ids(added_package)[-3:] == [
        added_sources["el_added_text"]["shapeId"],
        added_sources["el_added_rect"]["shapeId"],
        added_sources["el_added_image"]["shapeId"],
    ]
    added_text_xml = shape_xml(
        added_package,
        added_sources["el_added_text"]["shapeId"],
    )
    assert b'<a:pPr algn="ctr">' in added_text_xml
    assert b'sz="1500"' in added_text_xml
    assert b'b="1"' in added_text_xml
    assert b'i="1"' in added_text_xml
    assert b'u="sng"' in added_text_xml
    assert b'typeface="Pretendard"' in added_text_xml
    assert b'<a:srgbClr val="123456"' in added_text_xml
    assert b'anchor="ctr"' in added_text_xml

    added_path = tmp_path / "added.pptx"
    added_path.write_bytes(added_package)
    next_blueprint = copy.deepcopy(generated.template_blueprint)
    next_blueprint["slides"][0]["elementSources"].extend(added.element_sources)
    edited = sync_pptx_ooxml(
        added_path,
        template_blueprint=next_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_added_text",
                "props": {"text": "Edited added text"},
            },
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_added_rect",
                "frame": {"x": 320, "y": 600, "width": 300, "height": 100},
            },
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_added_image",
                "props": {
                    "src": "data:image/png;base64,"
                    + base64.b64encode(second_image).decode("ascii"),
                    "crop": {
                        "left": 0.1,
                        "top": 0.2,
                        "right": 0.05,
                        "bottom": 0.15,
                    },
                },
            },
        ],
    )
    edited_bytes = current_package_bytes(edited.assets)

    assert edited.warnings == []
    assert b"Edited added text" in shape_xml(
        edited_bytes, added_sources["el_added_text"]["shapeId"]
    )
    assert b'x="2032000"' in shape_xml(
        edited_bytes, added_sources["el_added_rect"]["shapeId"]
    )
    edited_image_source = source_for_element(
        edited.element_sources,
        "el_added_image",
    )
    assert (
        relationship_blob(
            edited_bytes,
            "ppt/slides/slide1.xml",
            edited_image_source["relationshipId"],
        )
        == second_image
    )
    assert b'<a:srcRect l="10000" t="20000" r="5000" b="15000"' in shape_xml(
        edited_bytes,
        added_sources["el_added_image"]["shapeId"],
    )

    edited_path = tmp_path / "edited-added.pptx"
    edited_path.write_bytes(edited_bytes)
    round_trip = generate_pptx_ooxml(
        edited_path,
        "file_round_trip",
        render=False,
    )
    round_trip_shape_ids = {
        source["shapeId"]
        for source in round_trip.template_blueprint["slides"][0]["elementSources"]
    }

    assert {source["shapeId"] for source in added_sources.values()}.issubset(
        round_trip_shape_ids
    )
    assert any(
        element["type"] == "text" and element["props"]["text"] == "Edited added text"
        for element in round_trip.blueprint["slides"][0]["elements"]
    )
    assert second_image in {
        base64.b64decode(asset.content_base64)
        for asset in round_trip.assets
        if asset.mime_type == "image/png"
    }
    round_trip_image = next(
        element
        for element in round_trip.blueprint["slides"][0]["elements"]
        if element["type"] == "image"
        and element["props"].get("crop")
        == {"left": 0.1, "top": 0.2, "right": 0.05, "bottom": 0.15}
    )
    assert round_trip_image["props"]["fit"] == "contain"


def test_sync_pptx_ooxml_authored_image_contain_uses_letterbox_source_rect(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image_blob = png_sized_bytes(16, 8, "#00ff00")
    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_contain_image",
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                    "zIndex": 0,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(image_blob).decode("ascii"),
                        "fit": "contain",
                    },
                },
            }
        ],
    )

    source = source_for_element(result.element_sources, "el_contain_image")
    picture_xml = shape_xml(
        current_package_bytes(result.assets),
        source["shapeId"],
    )
    assert b'<a:srcRect t="-50000" b="-50000"' in picture_xml
    assert b"imageFit" in picture_xml
    assert slide_visual_shape_ids(current_package_bytes(result.assets))[0] == str(
        source["shapeId"]
    )

    contained_path = tmp_path / "authored-contain.pptx"
    contained_path.write_bytes(current_package_bytes(result.assets))
    reimported = generate_pptx_ooxml(
        contained_path,
        "file_reimported",
        render=False,
    )
    reimported_source = next(
        item
        for item in reimported.template_blueprint["slides"][0]["elementSources"]
        if item["shapeId"] == source["shapeId"]
    )
    reimported_element = next(
        item
        for item in reimported.blueprint["slides"][0]["elements"]
        if item["elementId"] == reimported_source["elementId"]
    )
    assert reimported_element["props"]["fit"] == "contain"
    assert "crop" not in reimported_element["props"]


def test_sync_pptx_ooxml_preserves_explicit_crop_on_resize_and_source_replace(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    first_blob = png_sized_bytes(16, 8, "#00ff00")
    second_blob = png_sized_bytes(8, 16, "#0000ff")
    crop = {"left": 0.2, "top": 0.1, "right": 0.15, "bottom": 0.05}
    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_explicit_crop",
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(first_blob).decode("ascii"),
                        "fit": "contain",
                        "crop": crop,
                    },
                },
            }
        ],
    )
    source = source_for_element(added.element_sources, "el_explicit_crop")
    blueprint = copy.deepcopy(generated.template_blueprint)
    blueprint["slides"][0]["elementSources"].extend(added.element_sources)
    added_path = tmp_path / "explicit-crop-added.pptx"
    added_path.write_bytes(current_package_bytes(added.assets))

    preserved = sync_pptx_ooxml(
        added_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_explicit_crop",
                "frame": {"x": 100, "y": 100, "width": 400, "height": 200},
            },
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_explicit_crop",
                "props": {
                    "src": "data:image/png;base64,"
                    + base64.b64encode(second_blob).decode("ascii")
                },
            },
        ],
    )
    preserved_bytes = current_package_bytes(preserved.assets)
    expected_rect = b'<a:srcRect l="20000" t="10000" r="15000" b="5000"'

    assert preserved.unsupported_operations == []
    assert expected_rect in shape_xml(preserved_bytes, source["shapeId"])

    preserved_source = source_for_element(
        preserved.element_sources,
        "el_explicit_crop",
    )
    source_for_element(
        blueprint["slides"][0]["elementSources"],
        "el_explicit_crop",
    ).update(preserved_source)
    preserved_path = tmp_path / "explicit-crop-preserved.pptx"
    preserved_path.write_bytes(preserved_bytes)
    reset = sync_pptx_ooxml(
        preserved_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=4,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_explicit_crop",
                "props": {"crop": None},
            }
        ],
    )

    assert reset.unsupported_operations == []
    assert b"srcRect" not in shape_xml(
        current_package_bytes(reset.assets),
        source["shapeId"],
    )


def test_sync_pptx_ooxml_recomputes_authored_contain_after_frame_resize(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image_blob = png_sized_bytes(16, 8, "#00ff00")
    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_contain_resize",
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(image_blob).decode("ascii"),
                        "fit": "contain",
                    },
                },
            }
        ],
    )
    blueprint = copy.deepcopy(generated.template_blueprint)
    blueprint["slides"][0]["elementSources"].extend(added.element_sources)
    source = source_for_element(added.element_sources, "el_contain_resize")
    added_path = tmp_path / "authored-contain-before-resize.pptx"
    added_path.write_bytes(current_package_bytes(added.assets))

    resized = sync_pptx_ooxml(
        added_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_contain_resize",
                "frame": {"x": 100, "y": 100, "width": 400, "height": 200},
            }
        ],
    )
    picture_xml = shape_xml(current_package_bytes(resized.assets), source["shapeId"])

    assert resized.unsupported_operations == []
    assert b"srcRect" not in picture_xml
    assert b"imageFit" in picture_xml

    resized_path = tmp_path / "reimported-contain-resized.pptx"
    resized_path.write_bytes(current_package_bytes(resized.assets))
    resized_reimport = generate_pptx_ooxml(
        resized_path,
        "file_resized_reimport",
        render=False,
    )
    resized_source = next(
        item
        for item in resized_reimport.template_blueprint["slides"][0]["elementSources"]
        if item["shapeId"] == source["shapeId"]
    )
    resized_element = next(
        item
        for item in resized_reimport.blueprint["slides"][0]["elements"]
        if item["elementId"] == resized_source["elementId"]
    )
    assert resized_element["props"]["fit"] == "contain"


def test_sync_pptx_ooxml_recomputes_reimported_contain_after_source_replace(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    wide_blob = png_sized_bytes(16, 8, "#00ff00")
    tall_blob = png_sized_bytes(8, 16, "#0000ff")
    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_contain_reimport_replace",
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(wide_blob).decode("ascii"),
                        "fit": "contain",
                    },
                },
            }
        ],
    )
    source = source_for_element(added.element_sources, "el_contain_reimport_replace")
    added_path = tmp_path / "authored-contain-reimport-replace.pptx"
    added_path.write_bytes(current_package_bytes(added.assets))
    reimported = generate_pptx_ooxml(
        added_path,
        "file_reimported",
        render=False,
    )
    reimported_source = next(
        item
        for item in reimported.template_blueprint["slides"][0]["elementSources"]
        if item["shapeId"] == source["shapeId"]
    )

    replaced = sync_pptx_ooxml(
        added_path,
        template_blueprint=reimported.template_blueprint,
        deck_canvas=reimported.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_reimported_1",
                "elementId": reimported_source["elementId"],
                "props": {
                    "src": "data:image/png;base64,"
                    + base64.b64encode(tall_blob).decode("ascii")
                },
            }
        ],
    )
    picture_xml = shape_xml(current_package_bytes(replaced.assets), source["shapeId"])

    assert replaced.unsupported_operations == []
    assert b'<a:srcRect l="-50000" r="-50000"' in picture_xml
    assert b"imageFit" in picture_xml


def test_sync_pptx_ooxml_recomputes_reimported_contain_after_frame_resize(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image_blob = png_sized_bytes(16, 8, "#00ff00")
    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_contain_reimport_resize",
                    "type": "image",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 200,
                    "props": {
                        "src": "data:image/png;base64,"
                        + base64.b64encode(image_blob).decode("ascii"),
                        "fit": "contain",
                    },
                },
            }
        ],
    )
    source = source_for_element(added.element_sources, "el_contain_reimport_resize")
    added_path = tmp_path / "authored-contain-reimport-resize.pptx"
    added_path.write_bytes(current_package_bytes(added.assets))
    reimported = generate_pptx_ooxml(
        added_path,
        "file_reimported",
        render=False,
    )
    reimported_source = next(
        item
        for item in reimported.template_blueprint["slides"][0]["elementSources"]
        if item["shapeId"] == source["shapeId"]
    )

    resized = sync_pptx_ooxml(
        added_path,
        template_blueprint=reimported.template_blueprint,
        deck_canvas=reimported.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_reimported_1",
                "elementId": reimported_source["elementId"],
                "frame": {"x": 100, "y": 100, "width": 400, "height": 200},
            }
        ],
    )
    picture_xml = shape_xml(current_package_bytes(resized.assets), source["shapeId"])

    assert resized.unsupported_operations == []
    assert b"srcRect" not in picture_xml
    assert b"imageFit" in picture_xml


def test_sync_pptx_ooxml_scopes_duplicate_element_ids_to_slide_part(
    tmp_path: Path,
) -> None:
    pptx_path, shape_ids = sample_duplicate_element_ids_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    blueprint = copy.deepcopy(generated.template_blueprint)
    mapped_sources: list[dict[str, dict]] = []
    for slide_index, ids in enumerate(shape_ids):
        sources = blueprint["slides"][slide_index]["elementSources"]
        text_source = next(
            source for source in sources if source["shapeId"] == ids["text"]
        )
        text_source["ooxmlOrigin"] = "authored"
        image_source = next(
            source for source in sources if source["shapeId"] == ids["image"]
        )
        delete_source = next(
            source for source in sources if source["shapeId"] == ids["delete"]
        )
        text_source["elementId"] = "el_shared_text"
        image_source["elementId"] = "el_shared_image"
        delete_source["elementId"] = "el_shared_delete"
        mapped_sources.append(
            {"text": text_source, "image": image_source, "delete": delete_source}
        )

    replacement_image = png_bytes("#ffff00")
    synced = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_2",
                "elementId": "el_shared_text",
                "props": {"text": "Only slide two"},
            },
            {
                "type": "update_element_frame",
                "slideId": "slide_2",
                "elementId": "el_shared_image",
                "frame": {"x": 400, "y": 300, "width": 240, "height": 180},
            },
            {
                "type": "update_element_props",
                "slideId": "slide_2",
                "elementId": "el_shared_image",
                "props": {
                    "src": "data:image/png;base64,"
                    + base64.b64encode(replacement_image).decode("ascii")
                },
            },
            {
                "type": "delete_element",
                "slideId": "slide_2",
                "elementId": "el_shared_delete",
            },
        ],
    )
    synced_bytes = current_package_bytes(synced.assets)

    assert synced.warnings == []
    assert package_entry(synced_bytes, "ppt/slides/slide1.xml") == package_entry(
        original_bytes, "ppt/slides/slide1.xml"
    )
    assert package_entry(
        synced_bytes, "ppt/slides/_rels/slide1.xml.rels"
    ) == package_entry(original_bytes, "ppt/slides/_rels/slide1.xml.rels")
    assert b"Only slide two" in shape_xml(
        synced_bytes,
        mapped_sources[1]["text"]["shapeId"],
        "ppt/slides/slide2.xml",
    )
    assert b'x="2540000"' in shape_xml(
        synced_bytes,
        mapped_sources[1]["image"]["shapeId"],
        "ppt/slides/slide2.xml",
    )
    synced_image_source = next(
        source
        for source in synced.element_sources
        if source["slidePart"] == "ppt/slides/slide2.xml"
        and source["elementId"] == "el_shared_image"
    )
    assert (
        relationship_blob(
            synced_bytes,
            "ppt/slides/slide2.xml",
            synced_image_source["relationshipId"],
        )
        == replacement_image
    )
    with pytest.raises(AssertionError):
        shape_xml(
            synced_bytes,
            mapped_sources[1]["delete"]["shapeId"],
            "ppt/slides/slide2.xml",
        )

    synced_path = tmp_path / "duplicate-ids-synced.pptx"
    synced_path.write_bytes(synced_bytes)
    added = sync_pptx_ooxml(
        synced_path,
        template_blueprint=blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
        operations=[
            {
                "type": "add_element",
                "slideId": f"slide_{slide_index}",
                "element": {
                    "elementId": "el_shared_added",
                    "type": "text",
                    "x": 100,
                    "y": 600,
                    "width": 400,
                    "height": 80,
                    "props": {"text": f"Added on slide {slide_index}"},
                },
            }
            for slide_index in (1, 2)
        ],
    )
    added_sources = [
        source
        for source in added.element_sources
        if source["elementId"] == "el_shared_added"
    ]

    assert added.warnings == []
    assert {source["slidePart"] for source in added_sources} == {
        "ppt/slides/slide1.xml",
        "ppt/slides/slide2.xml",
    }


def test_sync_pptx_ooxml_routes_reordered_logical_slide_to_source_part(
    tmp_path: Path,
) -> None:
    pptx_path = sample_reordered_slide_parts_pptx(tmp_path)
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    first_template_slide = generated.template_blueprint["slides"][0]
    assert first_template_slide["sourceSlidePart"] == "ppt/slides/slide2.xml"
    text_sources = [
        source
        for source in first_template_slide["elementSources"]
        if source.get("elementType") == "text" and source.get("writable")
    ]
    assert len(text_sources) >= 2
    frame_source, delete_source = text_sources[:2]

    synced = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": frame_source["elementId"],
                "frame": {"x": 320, "y": 160, "width": 500, "height": 100},
            },
            {
                "type": "delete_element",
                "slideId": "slide_import_file_template_1",
                "elementId": delete_source["elementId"],
            },
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_reordered_slide_add",
                    "type": "text",
                    "x": 100,
                    "y": 600,
                    "width": 400,
                    "height": 80,
                    "props": {"text": "Added to logical first slide"},
                },
            },
            {
                "type": "update_element_frame",
                "slideId": "slide_import_file_template_1",
                "elementId": "el_reordered_slide_add",
                "frame": {"x": 140, "y": 620, "width": 420, "height": 90},
            },
        ],
    )
    synced_bytes = current_package_bytes(synced.assets)

    assert synced.unsupported_operations == []
    assert package_entry(synced_bytes, "ppt/slides/slide1.xml") == package_entry(
        original_bytes, "ppt/slides/slide1.xml"
    )
    assert b'x="2032000"' in shape_xml(
        synced_bytes,
        frame_source["shapeId"],
        "ppt/slides/slide2.xml",
    )
    assert delete_source["elementId"].encode() not in package_entry(
        synced_bytes, "ppt/slides/slide2.xml"
    )
    assert b"Added to logical first slide" in package_entry(
        synced_bytes, "ppt/slides/slide2.xml"
    )
    added_source = next(
        source
        for source in synced.element_sources
        if source["elementId"] == "el_reordered_slide_add"
    )
    assert b'x="889000"' in shape_xml(
        synced_bytes,
        added_source["shapeId"],
        "ppt/slides/slide2.xml",
    )


def test_sync_pptx_ooxml_rejects_delete_when_motion_references_are_unmodeled(
    tmp_path: Path,
) -> None:
    pptx_path = sample_round_trip_pptx(tmp_path)
    generated_without_timing = generate_pptx_ooxml(
        pptx_path,
        "file_template",
        render=False,
    )
    source = next(
        item
        for item in generated_without_timing.template_blueprint["slides"][0][
            "elementSources"
        ]
        if item.get("elementType") == "text"
    )
    add_shape_timing_reference(pptx_path, source["shapeId"])
    original_bytes = pptx_path.read_bytes()
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    guarded_source = next(
        item
        for item in generated.template_blueprint["slides"][0]["elementSources"]
        if item["elementId"] == source["elementId"]
    )
    assert guarded_source["ooxmlEditCapabilities"]["frame"] is True
    assert guarded_source["ooxmlEditCapabilities"]["delete"] is False

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "delete_element",
                "slideId": "slide_import_file_template_1",
                "elementId": source["elementId"],
            }
        ],
    )

    assert current_package_bytes(result.assets) == original_bytes
    assert result.applied_operations == []
    assert [item.reason_code for item in result.unsupported_operations] == [
        "MOTION_REFERENCE_COVERAGE_UNSAFE"
    ]


@pytest.mark.parametrize(
    "src",
    [
        "not-a-data-url",
        "data:image/svg+xml;base64,PHN2Zy8+",
        "data:image/png;base64,!!!",
        "data:image/png;base64,bm90LWFuLWltYWdl",
    ],
)
def test_sync_pptx_ooxml_rejects_invalid_image_data_without_package_changes(
    tmp_path: Path,
    src: str,
) -> None:
    pptx_path = sample_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    image = next(
        element
        for element in generated.blueprint["slides"][0]["elements"]
        if element["type"] == "image"
    )

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
        operations=[
            {
                "type": "update_element_props",
                "slideId": "slide_import_file_template_1",
                "elementId": image["elementId"],
                "props": {"src": src},
            },
            {
                "type": "add_element",
                "slideId": "slide_import_file_template_1",
                "element": {
                    "elementId": "el_invalid_image",
                    "type": "image",
                    "x": 0,
                    "y": 0,
                    "width": 100,
                    "height": 100,
                    "props": {"src": src},
                },
            },
        ],
    )

    assert current_package_bytes(result.assets) == pptx_path.read_bytes()
    assert len(result.warnings) == 2
    assert all("OOXML" in warning and "image" in warning for warning in result.warnings)


def test_renders_slide_pngs_when_libreoffice_is_available(tmp_path: Path) -> None:
    if not (shutil.which("libreoffice") or shutil.which("soffice")):
        pytest.skip("LibreOffice is not installed.")

    pptx_path = sample_pptx(tmp_path)
    result = generate_pptx_ooxml(pptx_path, "file_template", render=False)
    canvas = type(
        "Canvas",
        (),
        {"width": 1920, "height": 1080, "preset": "wide-16-9", "aspect_ratio": "16:9"},
    )()

    try:
        assets = render_pptx_to_png_assets(
            base64.b64decode(result.assets[0].content_base64),
            canvas,
        )
    except PptxRenderUnavailableError as error:
        pytest.skip(str(error))

    assert len(assets) == 1
    assert assets[0].mime_type == "image/png"
    assert base64.b64decode(assets[0].content_base64).startswith(b"\x89PNG")


def test_shape_fallback_assets_crop_from_slide_render() -> None:
    slide_render = BytesIO()
    Image.new("RGB", (100, 80), "#336699").save(slide_render, format="PNG")
    warnings: list[str] = []

    assets = shape_fallback_assets(
        {
            "slides": [
                {
                    "sourceSlideIndex": 1,
                    "elements": [
                        {
                            "type": "image",
                            "x": 10,
                            "y": 15,
                            "width": 30,
                            "height": 25,
                            "props": {
                                "src": "asset:shape_render_1_slide_2",
                            },
                        }
                    ],
                }
            ]
        },
        [
            ImportedDesignAsset(
                assetId="slide_render_1",
                fileName="slide-01.png",
                mimeType="image/png",
                contentBase64=base64.b64encode(slide_render.getvalue()).decode("ascii"),
            )
        ],
        warnings,
    )
    crop = Image.open(BytesIO(base64.b64decode(assets[0].content_base64)))

    assert warnings == []
    assert assets[0].asset_id == "shape_render_1_slide_2"
    assert assets[0].mime_type == "image/png"
    assert crop.size == (30, 25)


def test_strip_text_from_pptx_package_removes_text_bodies(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path)

    stripped = strip_text_from_pptx_package(pptx_path.read_bytes())

    with zipfile.ZipFile(BytesIO(stripped), "r") as package:
        slide_xml = package.read("ppt/slides/slide1.xml")

    assert b"Placeholder Title" not in slide_xml
    assert b"<p:txBody>" not in slide_xml


def sample_pptx(tmp_path: Path, *, wide: bool = True) -> Path:
    pptx_path = tmp_path / "template.pptx"
    image_path = tmp_path / "image.png"
    Image.new("RGB", (32, 32), "#ff0000").save(image_path)

    presentation = Presentation()
    presentation.slide_width = Inches(13.333333 if wide else 10)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    slide.shapes.title.text_frame.text = "Placeholder Title"
    slide.placeholders[1].text_frame.text = "Placeholder Subtitle"
    slide.shapes.add_picture(
        str(image_path), Inches(7), Inches(2), Inches(2), Inches(2)
    )
    presentation.save(pptx_path)
    return pptx_path


def sample_round_trip_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "round-trip-source.pptx"
    first_image_path = tmp_path / "first.png"
    second_image_path = tmp_path / "second.png"
    first_image_path.write_bytes(png_bytes("#ff0000"))
    second_image_path.write_bytes(png_bytes("#0000ff"))

    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.shapes.add_textbox(
        Inches(1), Inches(0.5), Inches(5), Inches(0.8)
    ).text_frame.text = "Original round-trip title"
    slide.shapes.add_picture(
        str(first_image_path), Inches(1), Inches(2), Inches(2), Inches(2)
    )
    slide.shapes.add_picture(
        str(second_image_path), Inches(4), Inches(2), Inches(2), Inches(2)
    )
    slide.shapes.add_shape(
        MSO_SHAPE.CLOUD,
        Inches(8),
        Inches(2),
        Inches(2),
        Inches(1.5),
    )
    presentation.save(pptx_path)
    return pptx_path


def sample_picture_fill_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "picture-fill-source.pptx"
    image_path = tmp_path / "picture-fill.png"
    image_path.write_bytes(png_sized_bytes(64, 48, "#2563eb"))
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.shapes.add_picture(
        str(image_path),
        Inches(8),
        Inches(1),
        Inches(1),
        Inches(1),
    )
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(1),
        Inches(1),
        Inches(4),
        Inches(2),
    )
    shape.text_frame.text = "Picture fill target"
    presentation.save(pptx_path)

    presentation_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    drawing_ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    relationship_ns = (
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    )
    output = BytesIO()
    with (
        zipfile.ZipFile(pptx_path, "r") as source,
        zipfile.ZipFile(
            output,
            "w",
        ) as target,
    ):
        slide_root = ET.fromstring(source.read("ppt/slides/slide1.xml"))
        picture = next(
            node
            for node in slide_root.iter()
            if node.tag == f"{{{presentation_ns}}}pic"
        )
        picture_blip = next(
            node for node in picture.iter() if node.tag == f"{{{drawing_ns}}}blip"
        )
        relationship_id = str(picture_blip.get(f"{{{relationship_ns}}}embed", ""))
        target_shape = next(
            node
            for node in slide_root.iter()
            if node.tag == f"{{{presentation_ns}}}sp"
            and any(
                text.text == "Picture fill target"
                for text in node.iter()
                if text.tag == f"{{{drawing_ns}}}t"
            )
        )
        shape_properties = next(
            child
            for child in list(target_shape)
            if child.tag == f"{{{presentation_ns}}}spPr"
        )
        for child in list(shape_properties):
            if child.tag.rsplit("}", maxsplit=1)[-1] in {
                "blipFill",
                "gradFill",
                "grpFill",
                "noFill",
                "pattFill",
                "solidFill",
            }:
                shape_properties.remove(child)
        blip_fill = ET.Element(f"{{{drawing_ns}}}blipFill")
        ET.SubElement(
            blip_fill,
            f"{{{drawing_ns}}}blip",
            {f"{{{relationship_ns}}}embed": relationship_id},
        )
        stretch = ET.SubElement(blip_fill, f"{{{drawing_ns}}}stretch")
        ET.SubElement(stretch, f"{{{drawing_ns}}}fillRect")
        line_index = next(
            (
                index
                for index, child in enumerate(list(shape_properties))
                if child.tag.rsplit("}", maxsplit=1)[-1] == "ln"
            ),
            len(shape_properties),
        )
        shape_properties.insert(line_index, blip_fill)
        next_slide_xml = ET.tostring(
            slide_root,
            encoding="utf-8",
            xml_declaration=True,
        )
        for info in source.infolist():
            target.writestr(
                info,
                next_slide_xml
                if info.filename == "ppt/slides/slide1.xml"
                else source.read(info.filename),
            )
    pptx_path.write_bytes(output.getvalue())
    return pptx_path


def sample_scaled_group_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "scaled-group.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    box = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(1),
        Inches(1),
        Inches(2),
        Inches(1),
    )
    target = slide.shapes.add_textbox(
        Inches(1.2),
        Inches(1.2),
        Inches(1.4),
        Inches(0.5),
    )
    target.text_frame.text = "Grouped frame target"
    group = slide.shapes.add_group_shape([box, target])
    group.left = Inches(4)
    group.top = Inches(2)
    group.width = Inches(5)
    group.height = Inches(2.5)
    presentation.save(pptx_path)
    return pptx_path


def sample_split_fill_text_shape_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "split-fill-text-shape.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(1),
        Inches(1),
        Inches(4),
        Inches(1.5),
    )
    shape.text_frame.text = "Shared native fill and text"
    presentation.save(pptx_path)
    return pptx_path


def sample_reordered_slide_parts_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "reordered-slide-parts.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    for slide_number in (1, 2):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        for text_index in (1, 2):
            textbox = slide.shapes.add_textbox(
                Inches(text_index),
                Inches(text_index),
                Inches(4),
                Inches(0.6),
            )
            textbox.text_frame.text = f"Part {slide_number} text {text_index}"
    presentation.save(pptx_path)

    buffer = BytesIO()
    with (
        zipfile.ZipFile(pptx_path, "r") as source,
        zipfile.ZipFile(buffer, "w") as target,
    ):
        presentation_root = ET.fromstring(source.read("ppt/presentation.xml"))
        slide_id_list = next(
            node for node in presentation_root.iter() if node.tag.endswith("sldIdLst")
        )
        slide_ids = list(slide_id_list)
        for slide_id in slide_ids:
            slide_id_list.remove(slide_id)
        for slide_id in reversed(slide_ids):
            slide_id_list.append(slide_id)
        presentation_xml = ET.tostring(
            presentation_root,
            encoding="utf-8",
            xml_declaration=True,
        )
        for info in source.infolist():
            target.writestr(
                info,
                presentation_xml
                if info.filename == "ppt/presentation.xml"
                else source.read(info.filename),
            )
    pptx_path.write_bytes(buffer.getvalue())
    return pptx_path


def add_shape_timing_reference(pptx_path: Path, shape_id: str) -> None:
    presentation_namespace = (
        "http://schemas.openxmlformats.org/presentationml/2006/main"
    )
    buffer = BytesIO()
    with (
        zipfile.ZipFile(pptx_path, "r") as source,
        zipfile.ZipFile(buffer, "w") as target,
    ):
        slide_root = ET.fromstring(source.read("ppt/slides/slide1.xml"))
        timing = ET.SubElement(
            slide_root,
            f"{{{presentation_namespace}}}timing",
        )
        target_element = ET.SubElement(
            timing,
            f"{{{presentation_namespace}}}spTgt",
        )
        target_element.set("spid", shape_id)
        slide_xml = ET.tostring(
            slide_root,
            encoding="utf-8",
            xml_declaration=True,
        )
        for info in source.infolist():
            target.writestr(
                info,
                slide_xml
                if info.filename == "ppt/slides/slide1.xml"
                else source.read(info.filename),
            )
    pptx_path.write_bytes(buffer.getvalue())


def sample_duplicate_element_ids_pptx(
    tmp_path: Path,
) -> tuple[Path, list[dict[str, str]]]:
    pptx_path = tmp_path / "duplicate-element-ids.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    shape_ids: list[dict[str, str]] = []
    for slide_index, color in enumerate(("#ff0000", "#0000ff"), start=1):
        image_path = tmp_path / f"duplicate-{slide_index}.png"
        image_path.write_bytes(png_bytes(color))
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        text = slide.shapes.add_textbox(Inches(1), Inches(0.5), Inches(5), Inches(0.8))
        text.text_frame.text = f"Slide {slide_index} title"
        image = slide.shapes.add_picture(
            str(image_path), Inches(1), Inches(2), Inches(2), Inches(2)
        )
        delete_shape = slide.shapes.add_shape(
            MSO_SHAPE.RECTANGLE,
            Inches(4),
            Inches(2),
            Inches(2),
            Inches(1),
        )
        shape_ids.append(
            {
                "text": str(text.shape_id),
                "image": str(image.shape_id),
                "delete": str(delete_shape.shape_id),
            }
        )
    presentation.save(pptx_path)
    return pptx_path, shape_ids


def png_bytes(color: str) -> bytes:
    output = BytesIO()
    Image.new("RGB", (8, 8), color).save(output, format="PNG")
    return output.getvalue()


def png_sized_bytes(width: int, height: int, color: str) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), color).save(output, format="PNG")
    return output.getvalue()


def current_package_bytes(assets: list[ImportedDesignAsset]) -> bytes:
    package = next(asset for asset in assets if asset.asset_id == "current_package")
    return base64.b64decode(package.content_base64)


def source_for_element(sources: list[dict], element_id: str) -> dict:
    return next(source for source in sources if source["elementId"] == element_id)


def picture_relationship_id(package_bytes: bytes, shape_id: str) -> str:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        root = ET.fromstring(package.read("ppt/slides/slide1.xml"))
    for picture in root.iter():
        if not picture.tag.endswith("pic"):
            continue
        c_nv_pr = next(
            (node for node in picture.iter() if node.tag.endswith("cNvPr")),
            None,
        )
        if c_nv_pr is None or c_nv_pr.get("id") != shape_id:
            continue
        blip = next(node for node in picture.iter() if node.tag.endswith("blip"))
        return next(
            value for key, value in blip.attrib.items() if key.endswith("embed")
        )
    raise AssertionError(f"picture shape not found: {shape_id}")


def relationship_blob(
    package_bytes: bytes,
    slide_part: str,
    relationship_id: str,
) -> bytes:
    slide_path = Path(slide_part)
    rels_part = f"{slide_path.parent.as_posix()}/_rels/{slide_path.name}.rels"
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        root = ET.fromstring(package.read(rels_part))
        relationship = next(
            child for child in root if child.get("Id") == relationship_id
        )
        target = relationship.get("Target", "")
        media_part = str((Path(slide_part).parent / target).resolve()).replace(
            "\\", "/"
        )
        media_part = media_part.split("/ppt/", maxsplit=1)[-1]
        return package.read(f"ppt/{media_part}")


def shape_xml(
    package_bytes: bytes,
    shape_id: str,
    slide_part: str = "ppt/slides/slide1.xml",
) -> bytes:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        root = ET.fromstring(package.read(slide_part))
    for shape in root.iter():
        if not shape.tag.endswith(("sp", "pic")):
            continue
        c_nv_pr = next(
            (node for node in shape.iter() if node.tag.endswith("cNvPr")),
            None,
        )
        if c_nv_pr is not None and c_nv_pr.get("id") == shape_id:
            return ET.tostring(shape)
    raise AssertionError(f"shape not found: {shape_id}")


def shape_child_xml(
    package_bytes: bytes,
    shape_id: str,
    child_name: str,
    slide_part: str = "ppt/slides/slide1.xml",
) -> bytes:
    shape = ET.fromstring(shape_xml(package_bytes, shape_id, slide_part))
    child = next(
        (node for node in list(shape) if node.tag.endswith(child_name)),
        None,
    )
    if child is None:
        raise AssertionError(f"shape child not found: {shape_id}/{child_name}")
    return ET.tostring(child)


def containing_group_properties_xml(
    package_bytes: bytes,
    shape_id: str,
    slide_part: str = "ppt/slides/slide1.xml",
) -> bytes:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        root = ET.fromstring(package.read(slide_part))
    for group in root.iter():
        if not group.tag.endswith("grpSp"):
            continue
        if not any(
            node.tag.endswith("cNvPr") and node.get("id") == shape_id
            for node in group.iter()
        ):
            continue
        properties = next(
            (node for node in list(group) if node.tag.endswith("grpSpPr")),
            None,
        )
        if properties is not None:
            return ET.tostring(properties)
    raise AssertionError(f"containing group not found: {shape_id}")


def slide_visual_shape_ids(package_bytes: bytes) -> list[str]:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        root = ET.fromstring(package.read("ppt/slides/slide1.xml"))
    shape_tree = next(node for node in root.iter() if node.tag.endswith("spTree"))
    shape_ids: list[str] = []
    for shape in shape_tree:
        if not shape.tag.endswith(("cxnSp", "graphicFrame", "grpSp", "pic", "sp")):
            continue
        c_nv_pr = next(
            (node for node in shape.iter() if node.tag.endswith("cNvPr")),
            None,
        )
        if c_nv_pr is not None and c_nv_pr.get("id"):
            shape_ids.append(str(c_nv_pr.get("id")))
    return shape_ids


def package_entry(package_bytes: bytes, name: str) -> bytes:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        return package.read(name)


def zip_entry_hashes(package_bytes: bytes) -> dict[str, str]:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        return {
            info.filename: hashlib.sha256(package.read(info.filename)).hexdigest()
            for info in package.infolist()
        }
