import base64
import hashlib
import shutil
import zipfile
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pptx import Presentation
from pptx.util import Inches

from app.ai.pptx_ooxml_generation import (
    PptxRenderUnavailableError,
    generate_pptx_ooxml,
    insert_media_slot_image,
    render_pptx_to_png_assets,
    replace_content_slot_text,
    sync_pptx_ooxml,
)


def test_no_ai_generation_preserves_package_entries(tmp_path: Path) -> None:
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


def test_extracts_slots_and_replaces_content_slot_text(tmp_path: Path) -> None:
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

    replaced = replace_content_slot_text(
        pptx_path.read_bytes(),
        result.template_blueprint,
        ["New OOXML Title", "New OOXML Subtitle"],
    )

    with zipfile.ZipFile(BytesIO(replaced), "r") as package:
        slide_xml = package.read("ppt/slides/slide1.xml")

    assert b"New OOXML Title" in slide_xml
    assert b"Placeholder Title" not in slide_xml


def test_inserts_media_slot_image_relationship(tmp_path: Path) -> None:
    pptx_path = sample_pptx(tmp_path)
    image = BytesIO()
    Image.new("RGB", (4, 4), "#00ff00").save(image, format="PNG")

    inserted = insert_media_slot_image(
        pptx_path.read_bytes(),
        slide_index=1,
        image_blob=image.getvalue(),
        mime_type="image/png",
    )

    assert inserted.relationship_id.startswith("rId")
    with zipfile.ZipFile(BytesIO(inserted.package_bytes), "r") as package:
        assert inserted.media_part in package.namelist()
        rels = package.read("ppt/slides/_rels/slide1.xml.rels")
        slide = package.read("ppt/slides/slide1.xml")

    assert inserted.relationship_id.encode() in rels
    assert inserted.relationship_id.encode() in slide


def test_sync_pptx_ooxml_applies_text_and_frame_patch(tmp_path: Path) -> None:
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
    package_asset = next(
        asset for asset in result.assets if asset.asset_id == "current_package"
    )
    package_bytes = base64.b64decode(package_asset.content_base64)

    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        slide_xml = package.read("ppt/slides/slide1.xml")

    assert b"Synced Title" in slide_xml
    assert b"Placeholder Title" not in slide_xml
    assert b'x="609600"' in slide_xml
    assert b'cx="4064000"' in slide_xml


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


def sample_pptx(tmp_path: Path) -> Path:
    pptx_path = tmp_path / "template.pptx"
    image_path = tmp_path / "image.png"
    Image.new("RGB", (32, 32), "#ff0000").save(image_path)

    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    slide.shapes.title.text_frame.text = "Placeholder Title"
    slide.placeholders[1].text_frame.text = "Placeholder Subtitle"
    slide.shapes.add_picture(
        str(image_path), Inches(7), Inches(2), Inches(2), Inches(2)
    )
    presentation.save(pptx_path)
    return pptx_path


def zip_entry_hashes(package_bytes: bytes) -> dict[str, str]:
    with zipfile.ZipFile(BytesIO(package_bytes), "r") as package:
        return {
            info.filename: hashlib.sha256(package.read(info.filename)).hexdigest()
            for info in package.infolist()
        }
