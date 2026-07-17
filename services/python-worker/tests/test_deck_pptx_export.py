import base64
import math
from io import BytesIO
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import pytest
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from app.ai.deck_pptx_export import DeckPptxExportRequest, export_deck_pptx


DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
ONE_PIXEL_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
    "AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_export_deck_pptx_serializes_and_reopens_all_image_crop_edges() -> None:
    crop = {"left": 0.2, "top": 0.1, "right": 0.15, "bottom": 0.05}

    binary = export_binary(image_deck(crop=crop))

    with ZipFile(BytesIO(binary)) as archive:
        slide_root = ET.fromstring(archive.read("ppt/slides/slide1.xml"))
    src_rect = slide_root.find(f".//{{{DRAWING_NS}}}srcRect")
    assert src_rect is not None
    assert src_rect.attrib == {
        "l": "20000",
        "t": "10000",
        "r": "15000",
        "b": "5000",
    }

    reopened = Presentation(BytesIO(binary))
    picture = next(
        shape
        for shape in reopened.slides[0].shapes
        if shape.shape_type == MSO_SHAPE_TYPE.PICTURE
    )
    assert picture.crop_left == pytest.approx(crop["left"])
    assert picture.crop_top == pytest.approx(crop["top"])
    assert picture.crop_right == pytest.approx(crop["right"])
    assert picture.crop_bottom == pytest.approx(crop["bottom"])


def test_export_deck_pptx_clamps_rounded_crop_pairs_below_full_image() -> None:
    crop = {
        "left": 0.5000049,
        "top": 0.5000049,
        "right": 0.499995,
        "bottom": 0.499995,
    }

    binary = export_binary(image_deck(crop=crop))

    with ZipFile(BytesIO(binary)) as archive:
        slide_root = ET.fromstring(archive.read("ppt/slides/slide1.xml"))
    src_rect = slide_root.find(f".//{{{DRAWING_NS}}}srcRect")
    assert src_rect is not None
    assert src_rect.attrib == {
        "l": "50000",
        "t": "50000",
        "r": "49999",
        "b": "49999",
    }
    assert int(src_rect.attrib["l"]) + int(src_rect.attrib["r"]) == 99_999
    assert int(src_rect.attrib["t"]) + int(src_rect.attrib["b"]) == 99_999


@pytest.mark.parametrize(
    "include_null", [False, True], ids=["omitted", "explicit-null"]
)
def test_export_deck_pptx_keeps_no_crop_images_without_src_rect(
    include_null: bool,
) -> None:
    deck = image_deck(crop=None) if include_null else image_deck()

    binary = export_binary(deck)

    with ZipFile(BytesIO(binary)) as archive:
        slide_root = ET.fromstring(archive.read("ppt/slides/slide1.xml"))
    assert slide_root.find(f".//{{{DRAWING_NS}}}srcRect") is None

    reopened = Presentation(BytesIO(binary))
    picture = next(
        shape
        for shape in reopened.slides[0].shapes
        if shape.shape_type == MSO_SHAPE_TYPE.PICTURE
    )
    assert picture.crop_left == 0
    assert picture.crop_top == 0
    assert picture.crop_right == 0
    assert picture.crop_bottom == 0


@pytest.mark.parametrize(
    "crop",
    [
        {"left": math.nan},
        {"top": math.inf},
        {"right": -0.01},
        {"bottom": 1.01},
        {"left": True},
        {"left": "0.1"},
        {"left": 0.5, "right": 0.5},
        {"top": 0.6, "bottom": 0.4},
        "invalid",
    ],
)
def test_export_deck_pptx_rejects_crop_outside_shared_contract(
    crop: Any,
) -> None:
    with pytest.raises(ValueError, match="image crop"):
        export_deck_pptx(DeckPptxExportRequest(deck=image_deck(crop=crop)))


def export_binary(deck: dict[str, Any]) -> bytes:
    response = export_deck_pptx(DeckPptxExportRequest(deck=deck))
    return base64.b64decode(response.content_base64)


def image_deck(*, crop: Any = ...) -> dict[str, Any]:
    props: dict[str, Any] = {
        "src": ONE_PIXEL_PNG_DATA_URL,
        "alt": "Crop export fixture",
        "fit": "contain",
        "focusX": 0.5,
        "focusY": 0.5,
    }
    if crop is not ...:
        props["crop"] = crop
    return {
        "canvas": {"width": 1920, "height": 1080},
        "theme": {"backgroundColor": "#FFFFFF"},
        "slides": [
            {
                "order": 1,
                "style": {"backgroundColor": "#FFFFFF"},
                "elements": [
                    {
                        "elementId": "el_crop_image",
                        "type": "image",
                        "x": 120,
                        "y": 180,
                        "width": 640,
                        "height": 360,
                        "zIndex": 1,
                        "visible": True,
                        "props": props,
                    }
                ],
            }
        ],
    }
