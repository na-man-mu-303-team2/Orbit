from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

from app.ai.pptx_design_importer import import_pptx_design


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
    title.text_frame.paragraphs[0].runs[0].font.size = Pt(40)
    title.text_frame.paragraphs[0].runs[0].font.bold = True

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
    assert any(
        element["type"] == "text"
        and element["role"] == "title"
        and element["props"]["text"] == "Original Title"
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
    assert result.assets[0].mime_type == "image/png"


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

    assert "L" in custom_shape["props"]["pathData"]
    assert custom_shape["props"]["fill"] == "#FF8000"
    assert custom_shape["props"]["viewBoxWidth"] > 0


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
