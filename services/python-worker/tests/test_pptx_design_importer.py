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
