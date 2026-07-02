from io import BytesIO
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml import parse_xml
from pptx.util import Inches, Pt

from app.ai.pptx_design_importer import blip_fill_asset, import_pptx_design


def test_import_pptx_design_extracts_editable_elements(tmp_path: Path) -> None:
    pptx_path = tmp_path / "design.pptx"
    image_path = tmp_path / "sample.png"
    Image.new("RGB", (24, 24), "#ff0000").save(image_path)

    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = RGBColor(240, 248, 255)

    title = slide.shapes.add_textbox(Inches(1), Inches(0.8), Inches(5), Inches(1))
    title.text_frame.text = "Original Title"
    title_run = title.text_frame.paragraphs[0].runs[0]
    title_run.font.size = Pt(40)
    title_run.font.bold = True
    title_run.font.name = "Aptos Display"
    title_run.font.color.rgb = RGBColor(10, 20, 30)

    box = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(1),
        Inches(2.4),
        Inches(3),
        Inches(1.2),
    )
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(17, 34, 51)
    box.line.color.rgb = RGBColor(68, 85, 102)
    slide.shapes.add_picture(str(image_path), Inches(7), Inches(2), Inches(2), Inches(2))
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    slide_blueprint = result.blueprint["slides"][0]
    elements = slide_blueprint["elements"]

    assert slide_blueprint["style"]["backgroundColor"] == "#F0F8FF"
    assert slide_blueprint["style"]["textColor"] == "#0A141E"
    assert slide_blueprint["style"]["accentColor"] == "#112233"
    assert slide_blueprint["style"]["fontFamily"] == "Aptos Display"
    assert result.blueprint["theme"]["fontFamily"] == "Aptos Display"
    assert result.blueprint["theme"]["textColor"] == "#0A141E"
    assert result.blueprint["theme"]["accentColor"] == "#112233"
    assert result.blueprint["theme"]["typography"]["bodyFontFamily"] == "Aptos Display"
    assert any(
        element["type"] == "text"
        and element["role"] == "title"
        and element["props"]["text"] == "Original Title"
        and element["props"]["fontFamily"] == "Aptos Display"
        and element["props"]["color"] == "#0A141E"
        for element in elements
    )
    assert any(
        element["type"] == "rect" and element["props"]["fill"] == "#112233"
        for element in elements
    )
    assert any(
        element["type"] == "image" and element["props"]["src"] == "asset:image_1"
        for element in elements
    )
    title_slot = next(
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["elementId"].endswith("_text")
    )
    image_slot = next(
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["elementId"].endswith("_image")
    )
    assert title_slot["usage"] == "fixed-text"
    assert title_slot["replaceMode"] == "preserve"
    assert title_slot["confidence"] < 0.5
    assert image_slot["usage"] == "media-slot"
    assert image_slot["replaceMode"] == "preserve"
    assert result.quality_report["metrics"]["pixelSimilarity"] is None
    assert result.quality_report["compositeScore"] <= 100
    assert result.assets[0].mime_type == "image/png"


def test_import_pptx_design_marks_placeholders_as_replaceable_slots(
    tmp_path: Path,
) -> None:
    pptx_path = tmp_path / "placeholder.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    slide.shapes.title.text_frame.text = "Placeholder Title"
    slide.placeholders[1].text_frame.text = "Placeholder Subtitle"
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    slots = result.template_blueprint["slides"][0]["slots"]
    replaceable = [
        slot
        for slot in slots
        if slot["usage"] == "content-slot" and slot["replaceMode"] == "replace"
    ]

    assert len(replaceable) >= 2
    assert {slot["source"]["type"] for slot in replaceable} == {"placeholder"}
    assert any(slot["slotRole"] == "title" for slot in replaceable)


def test_import_pptx_design_flattens_group_shapes(tmp_path: Path) -> None:
    pptx_path = tmp_path / "group.pptx"
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
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(0, 128, 128)
    textbox = slide.shapes.add_textbox(Inches(1.2), Inches(1.2), Inches(1.4), Inches(0.5))
    textbox.text_frame.text = "Grouped text"
    slide.shapes.add_group_shape([box, textbox])
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    elements = result.blueprint["slides"][0]["elements"]

    assert not any("GROUP" in warning for warning in result.warnings)
    assert any(
        element["type"] == "rect" and element["props"]["fill"] == "#008080"
        for element in elements
    )
    text = next(element for element in elements if element["type"] == "text")
    assert text["props"]["text"] == "Grouped text"
    assert 160 <= text["x"] <= 190


def test_import_pptx_design_converts_freeform_to_custom_shape(tmp_path: Path) -> None:
    pptx_path = tmp_path / "freeform.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])

    builder = slide.shapes.build_freeform(Inches(1), Inches(1))
    builder.move_to(0, 0)
    builder.add_line_segments([(Inches(1), 0), (Inches(1), Inches(1))])
    freeform = builder.convert_to_shape()
    freeform.fill.solid()
    freeform.fill.fore_color.rgb = RGBColor(255, 128, 0)
    freeform.line.color.rgb = RGBColor(20, 20, 20)
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    elements = result.blueprint["slides"][0]["elements"]
    custom_shape = next(element for element in elements if element["type"] == "customShape")
    custom_slot = next(
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["elementId"] == custom_shape["elementId"]
    )

    assert "L" in custom_shape["props"]["pathData"]
    assert custom_shape["props"]["fill"] == "#FF8000"
    assert custom_shape["props"]["viewBoxWidth"] > 0
    assert custom_slot["usage"] == "decoration"
    assert custom_slot["replaceMode"] == "ignore"


def test_blip_fill_asset_extracts_embedded_image_and_color() -> None:
    image_buffer = BytesIO()
    Image.new("RGB", (4, 4), "#47604D").save(image_buffer, format="PNG")
    image_blob = image_buffer.getvalue()

    class FakeImagePart:
        content_type = "image/png"

        def __init__(self, blob: bytes) -> None:
            self.blob = blob

    class FakePart:
        def related_part(self, relationship_id: str) -> FakeImagePart:
            assert relationship_id == "rId2"
            return FakeImagePart(image_blob)

    class FakeShape:
        _element = parse_xml(
            """
            <p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <p:spPr>
                <a:blipFill>
                  <a:blip r:embed="rId2"/>
                </a:blipFill>
              </p:spPr>
            </p:sp>
            """
        )
        part = FakePart()

    extracted = blip_fill_asset(FakeShape(), "image_1")

    assert extracted is not None
    asset, color = extracted
    assert asset.asset_id == "image_1"
    assert asset.mime_type == "image/png"
    assert color == "#47604D"


def test_import_pptx_design_expands_table_cells(tmp_path: Path) -> None:
    pptx_path = tmp_path / "table.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    table = slide.shapes.add_table(2, 2, Inches(1), Inches(1), Inches(4), Inches(2)).table
    table.cell(0, 0).text = "A"
    table.cell(0, 1).text = "B"
    table.cell(1, 0).text = "C"
    table.cell(1, 1).text = "D"
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    elements = result.blueprint["slides"][0]["elements"]
    cell_rects = [
        element
        for element in elements
        if element["type"] == "rect" and "_cell_" in element["elementId"]
    ]
    cell_texts = [
        element
        for element in elements
        if element["type"] == "text" and "_cell_" in element["elementId"]
    ]

    assert len(cell_rects) == 4
    assert [element["props"]["text"] for element in cell_texts] == ["A", "B", "C", "D"]
    table_slots = [
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["source"]["type"] == "table"
    ]
    assert table_slots
    assert all(slot["replaceMode"] in {"ignore", "preserve"} for slot in table_slots)


def test_import_pptx_design_imports_layout_decorations(tmp_path: Path) -> None:
    pptx_path = tmp_path / "layout.pptx"
    presentation = Presentation()
    presentation.slide_width = Inches(13.333333)
    presentation.slide_height = Inches(7.5)
    layout = presentation.slide_layouts[6]
    layout.shapes._spTree.add_autoshape(
        99,
        "Decoration 1",
        "rect",
        Inches(0.2),
        Inches(0.2),
        Inches(1),
        Inches(0.25),
    )
    decoration = layout.shapes[-1]
    decoration.fill.solid()
    decoration.fill.fore_color.rgb = RGBColor(34, 197, 94)
    slide = presentation.slides.add_slide(layout)
    slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).text_frame.text = "Slide"
    presentation.save(pptx_path)

    result = import_pptx_design(pptx_path, "file_design")
    elements = result.blueprint["slides"][0]["elements"]
    layout_decoration = next(
        element
        for element in elements
        if element["type"] == "rect" and element["props"]["fill"] == "#22C55E"
    )

    assert layout_decoration["zIndex"] < 100
    assert layout_decoration["locked"] is True
    layout_slot = next(
        slot
        for slot in result.template_blueprint["slides"][0]["slots"]
        if slot["elementId"] == layout_decoration["elementId"]
    )
    assert layout_slot["usage"] == "decoration"
    assert layout_slot["source"]["type"] == "layout"
