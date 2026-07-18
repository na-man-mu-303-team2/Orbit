import base64
import copy
from collections.abc import Callable
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from app.ai.deck_pptx_export import DeckPptxExportRequest, export_deck_pptx
from app.ai.pptx_ooxml_generation import (
    PptxOoxmlGenerationResult,
    PptxOoxmlSyncResult,
    find_shape_by_id,
    generate_pptx_ooxml,
    sync_pptx_ooxml,
)


PML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
DML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
TEST_NS = "urn:orbit:test:table-sync"
SLIDE_PART = "ppt/slides/slide1.xml"


def template_slide_id(generated: PptxOoxmlGenerationResult) -> str:
    return generated.template_blueprint["slides"][0]["slideId"]


def test_find_shape_by_id_finds_nested_direct_graphic_frame_without_payload_spoof() -> (
    None
):
    root = ET.fromstring(
        f'<p:sld xmlns:p="{PML_NS}" xmlns:a="{DML_NS}" xmlns:x="{TEST_NS}">'
        "<p:cSld><p:spTree><p:grpSp><p:graphicFrame>"
        '<p:nvGraphicFramePr><p:cNvPr id="7" name="table"/>'
        "<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>"
        '<p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/'
        'drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>'
        '<a:gridCol w="1"/></a:tblGrid><a:tr h="1"><a:tc>'
        "<a:txBody><a:bodyPr/><a:lstStyle/><a:p/></a:txBody>"
        '<a:tcPr><x:payload><p:cNvPr id="999" name="spoof"/>'
        "</x:payload></a:tcPr></a:tc></a:tr></a:tbl>"
        "</a:graphicData></a:graphic></p:graphicFrame></p:grpSp>"
        "</p:spTree></p:cSld></p:sld>"
    )

    shape, parent = find_shape_by_id(root, "7")
    spoof, _spoof_parent = find_shape_by_id(root, "999")

    assert shape is not None and shape.tag == f"{{{PML_NS}}}graphicFrame"
    assert parent is not None and parent.tag == f"{{{PML_NS}}}grpSp"
    assert spoof is None


def test_imported_table_updates_one_cell_and_preserves_non_text_xml(
    tmp_path: Path,
) -> None:
    pptx_path = source_table_pptx(tmp_path, mutate=add_unknown_cell_formatting)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    element = imported_table_element(generated)
    source = imported_table_source(generated, element["elementId"])
    assert source["ooxmlEditCapabilities"]["tableCellText"] is True
    assert source["ooxmlEditCapabilities"]["frame"] is False
    assert source["ooxmlEditCapabilities"]["delete"] is False

    original = pptx_path.read_bytes()
    original_cells = table_cells(original)
    original_p_pr = canonical(first_descendant(original_cells[0], "pPr"))
    original_r_pr = canonical(first_descendant(original_cells[0], "rPr"))
    original_tc_pr = canonical(first_child(original_cells[0], "tcPr"))
    props = copy.deepcopy(element["props"])
    props["rows"][0][0]["text"] = " 한글🙂 "

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        operations=[
            table_props_operation(
                template_slide_id(generated), element["elementId"], props
            )
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert result.unsupported_operations == []
    package = current_package_bytes(result)
    cells = table_cells(package)
    assert table_cell_text(cells[0]) == " 한글🙂 "
    assert (
        first_descendant(cells[0], "t").get(
            "{http://www.w3.org/XML/1998/namespace}space"
        )
        == "preserve"
    )
    assert canonical(first_descendant(cells[0], "pPr")) == original_p_pr
    assert canonical(first_descendant(cells[0], "rPr")) == original_r_pr
    assert canonical(first_child(cells[0], "tcPr")) == original_tc_pr
    assert [canonical(cell) for cell in cells[1:]] == [
        canonical(cell) for cell in original_cells[1:]
    ]
    updated_source = result.element_sources[0]
    assert updated_source["tableCellLocators"] == source["tableCellLocators"]
    assert updated_source["ooxmlEditCapabilities"]["tableCellText"] is True


@pytest.mark.parametrize("locator_case", ["missing", "forged"])
def test_imported_table_rejects_missing_or_forged_locator_atomically(
    tmp_path: Path,
    locator_case: str,
) -> None:
    pptx_path = source_table_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    element = imported_table_element(generated)
    blueprint = copy.deepcopy(generated.template_blueprint)
    source = source_from_blueprint(blueprint, element["elementId"])
    if locator_case == "missing":
        source.pop("tableCellLocators")
    else:
        source["tableCellLocators"][0]["fingerprint"] = "0" * 64
    props = copy.deepcopy(element["props"])
    props["rows"][0][0]["text"] = "Edited"
    original = pptx_path.read_bytes()

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=blueprint,
        operations=[
            table_props_operation(
                template_slide_id(generated), element["elementId"], props
            )
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert current_package_bytes(result) == original
    assert result.applied_operations == []
    assert [item.reason_code for item in result.unsupported_operations] == [
        "TABLE_CELL_CAPABILITY_UNSAFE"
    ]


def test_imported_table_rejects_stale_locator_atomically(tmp_path: Path) -> None:
    source_path = source_table_pptx(tmp_path)
    generated = generate_pptx_ooxml(source_path, "file_table", render=False)
    element = imported_table_element(generated)
    stale_path = rewrite_slide(
        source_path,
        tmp_path / "stale-table.pptx",
        add_stale_cell_attribute,
    )
    props = copy.deepcopy(element["props"])
    props["rows"][0][0]["text"] = "Edited"
    original = stale_path.read_bytes()

    result = sync_pptx_ooxml(
        stale_path,
        template_blueprint=generated.template_blueprint,
        operations=[
            table_props_operation(
                template_slide_id(generated), element["elementId"], props
            )
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert current_package_bytes(result) == original
    assert [item.reason_code for item in result.unsupported_operations] == [
        "TABLE_CELL_CAPABILITY_UNSAFE"
    ]


@pytest.mark.parametrize("case", ["merged", "jagged"])
def test_merged_or_jagged_imported_table_has_no_cell_capability(
    tmp_path: Path,
    case: str,
) -> None:
    mutation = merge_first_cell if case == "merged" else remove_last_cell
    pptx_path = source_table_pptx(tmp_path, mutate=mutation)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    source = next(
        item
        for item in generated.template_blueprint["slides"][0]["elementSources"]
        if item.get("sourceType") == "table"
    )

    assert source["ooxmlEditCapabilities"]["tableCellText"] is False


@pytest.mark.parametrize("case", ["multi-run", "field", "hyperlink"])
def test_unsafe_imported_table_text_body_has_no_cell_capability(
    tmp_path: Path,
    case: str,
) -> None:
    mutation = {
        "multi-run": add_second_run,
        "field": replace_run_with_field,
        "hyperlink": add_run_hyperlink,
    }[case]
    pptx_path = source_table_pptx(tmp_path, mutate=mutation)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    source = next(
        item
        for item in generated.template_blueprint["slides"][0]["elementSources"]
        if item.get("sourceType") == "table"
    )

    assert source["ooxmlEditCapabilities"]["tableCellText"] is False


@pytest.mark.parametrize("case", ["two-cells", "row", "column-track", "style"])
def test_imported_table_rejects_multi_cell_or_structure_changes_atomically(
    tmp_path: Path,
    case: str,
) -> None:
    pptx_path = source_table_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    element = imported_table_element(generated)
    props = copy.deepcopy(element["props"])
    props["rows"][0][0]["text"] = "Edited A"
    if case == "two-cells":
        props["rows"][0][1]["text"] = "Edited B"
    elif case == "row":
        props["rows"].append(copy.deepcopy(props["rows"][0]))
        props["rowHeights"].append(props["rowHeights"][0])
    elif case == "column-track":
        props["columnWidths"][0] += 10
    else:
        props["rows"][0][0]["fill"] = "#112233"
    original = pptx_path.read_bytes()

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        operations=[
            table_props_operation(
                template_slide_id(generated), element["elementId"], props
            )
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert current_package_bytes(result) == original
    assert [item.reason_code for item in result.unsupported_operations] == [
        "TABLE_STRUCTURE_UNSUPPORTED"
    ]


def test_imported_empty_cell_clones_end_style_without_mutating_existing_xml(
    tmp_path: Path,
) -> None:
    pptx_path = source_table_pptx(tmp_path, mutate=make_first_cell_empty_with_end_style)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    element = imported_table_element(generated)
    source = imported_table_source(generated, element["elementId"])
    assert source["ooxmlEditCapabilities"]["tableCellText"] is True
    original_cell = table_cells(pptx_path.read_bytes())[0]
    original_p_pr = canonical(first_descendant(original_cell, "pPr"))
    original_end = canonical(first_descendant(original_cell, "endParaRPr"))
    original_tc_pr = canonical(first_child(original_cell, "tcPr"))
    props = copy.deepcopy(element["props"])
    props["rows"][0][0]["text"] = "Filled"

    result = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        operations=[
            table_props_operation(
                template_slide_id(generated), element["elementId"], props
            )
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert result.unsupported_operations == []
    cell = table_cells(current_package_bytes(result))[0]
    end_properties = first_descendant(cell, "endParaRPr")
    run_properties = first_descendant(cell, "rPr")
    assert canonical(first_descendant(cell, "pPr")) == original_p_pr
    assert canonical(end_properties) == original_end
    assert canonical(first_child(cell, "tcPr")) == original_tc_pr
    cloned_end = copy.deepcopy(end_properties)
    cloned_end.tag = f"{{{DML_NS}}}rPr"
    assert canonical(run_properties) == canonical(cloned_end)


def test_authored_table_add_structure_update_frame_delete_and_reimport(
    tmp_path: Path,
) -> None:
    pptx_path = source_table_pptx(tmp_path)
    generated = generate_pptx_ooxml(pptx_path, "file_table", render=False)
    initial = table_element_payload("el_authored", [[cell("A"), cell("B")]])
    updated_props = table_props(
        [
            [cell("A2", fill="#123456"), cell("B2"), cell("C2")],
            [cell("D2"), cell("E2"), cell("F2", font_weight="bold")],
        ],
        column_widths=[200, 300, 400],
        row_heights=[90, 150],
    )

    added = sync_pptx_ooxml(
        pptx_path,
        template_blueprint=generated.template_blueprint,
        operations=[
            {
                "type": "add_element",
                "slideId": template_slide_id(generated),
                "element": initial,
            },
            table_props_operation(
                template_slide_id(generated), "el_authored", updated_props
            ),
            {
                "type": "update_element_frame",
                "slideId": template_slide_id(generated),
                "elementId": "el_authored",
                "frame": {"x": 300, "y": 240, "width": 900, "height": 360},
            },
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=2,
        render=False,
    )

    assert added.unsupported_operations == []
    assert [item.operation_type for item in added.applied_operations] == [
        "add_element",
        "update_element_props",
        "update_element_frame",
    ]
    authored_source = next(
        source
        for source in added.element_sources
        if source["elementId"] == "el_authored"
    )
    assert authored_source["sourceType"] == "table"
    assert authored_source["ooxmlEditCapabilities"]["tableCellText"] is True
    assert len(authored_source["tableCellLocators"]) == 6
    package = current_package_bytes(added)
    frame = shape_by_id(package, authored_source["shapeId"])
    assert frame.tag == f"{{{PML_NS}}}graphicFrame"
    assert first_child(frame, "xfrm") is not None
    assert optional_child(frame, "spPr") is None
    table = first_descendant(frame, "tbl")
    columns = direct_children(first_child(table, "tblGrid"), "gridCol")
    assert len(columns) == 3
    assert len(direct_children(table, "tr")) == 2
    assert (
        table_cell_text(direct_children(direct_children(table, "tr")[1], "tc")[2])
        == "F2"
    )
    assert all(int(item.get("w", "0")) > 0 for item in columns)
    assert all(int(item.get("h", "0")) > 0 for item in direct_children(table, "tr"))

    authored_path = tmp_path / "authored-table.pptx"
    authored_path.write_bytes(package)
    next_blueprint = copy.deepcopy(generated.template_blueprint)
    next_blueprint["slides"][0]["elementSources"].append(authored_source)
    original_column_tracks = [int(item.get("w", "0")) for item in columns]
    original_row_tracks = [
        int(item.get("h", "0")) for item in direct_children(table, "tr")
    ]
    cell_edit_rows = copy.deepcopy(updated_props["rows"])
    cell_edit_rows[0][1]["text"] = "B3"
    cell_updated = sync_pptx_ooxml(
        authored_path,
        template_blueprint=next_blueprint,
        operations=[
            {
                "type": "update_element_props",
                "slideId": template_slide_id(generated),
                "elementId": "el_authored",
                "props": {"rows": cell_edit_rows},
            }
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
    )
    assert cell_updated.unsupported_operations == []
    package = current_package_bytes(cell_updated)
    authored_source = next(
        source
        for source in cell_updated.element_sources
        if source["elementId"] == "el_authored"
    )
    updated_table = first_descendant(
        shape_by_id(package, authored_source["shapeId"]),
        "tbl",
    )
    assert [
        int(item.get("w", "0"))
        for item in direct_children(first_child(updated_table, "tblGrid"), "gridCol")
    ] == original_column_tracks
    assert [
        int(item.get("h", "0")) for item in direct_children(updated_table, "tr")
    ] == original_row_tracks
    authored_path.write_bytes(package)
    round_trip = generate_pptx_ooxml(authored_path, "file_round_trip", render=False)
    round_trip_element = next(
        candidate
        for candidate in round_trip.blueprint["slides"][0]["elements"]
        if candidate.get("type") == "table"
        and candidate.get("props", {}).get("rows", [[{}]])[0][0].get("text") == "A2"
    )
    assert round_trip_element["props"]["columnWidths"] == pytest.approx(
        [200, 300, 400], abs=1
    )
    assert round_trip_element["props"]["rowHeights"] == pytest.approx([135, 225], abs=1)
    round_trip_source = imported_table_source(
        round_trip,
        round_trip_element["elementId"],
    )
    assert round_trip_source["ooxmlEditCapabilities"]["tableCellText"] is True

    next_blueprint = copy.deepcopy(generated.template_blueprint)
    next_blueprint["slides"][0]["elementSources"].append(authored_source)
    deleted = sync_pptx_ooxml(
        authored_path,
        template_blueprint=next_blueprint,
        operations=[
            {
                "type": "delete_element",
                "slideId": template_slide_id(generated),
                "elementId": "el_authored",
            }
        ],
        deck_canvas=generated.canvas,
        synced_deck_version=3,
        render=False,
    )
    assert deleted.unsupported_operations == []
    assert (
        find_shape_in_package(
            current_package_bytes(deleted), authored_source["shapeId"]
        )
        is None
    )


def source_table_pptx(
    tmp_path: Path,
    *,
    mutate: Callable[[ET.Element], None] | None = None,
) -> Path:
    response = export_deck_pptx(
        DeckPptxExportRequest(
            deck={
                "canvas": {"width": 1920, "height": 1080},
                "theme": {
                    "backgroundColor": "#FFFFFF",
                    "textColor": "#111827",
                    "fontFamily": "Aptos",
                },
                "slides": [
                    {
                        "order": 1,
                        "style": {"backgroundColor": "#FFFFFF"},
                        "elements": [
                            table_element_payload(
                                "el_table",
                                [
                                    [cell("Alpha"), cell("Beta")],
                                    [cell("Gamma"), cell("Delta")],
                                ],
                            )
                        ],
                    }
                ],
            }
        )
    )
    path = tmp_path / "source-table.pptx"
    path.write_bytes(base64.b64decode(response.content_base64))
    if mutate is not None:
        rewrite_slide(path, tmp_path / "mutated-source-table.pptx", mutate)
        return tmp_path / "mutated-source-table.pptx"
    return path


def table_element_payload(
    element_id: str,
    rows: list[list[dict[str, object]]],
) -> dict[str, object]:
    return {
        "elementId": element_id,
        "type": "table",
        "x": 100,
        "y": 120,
        "width": 900,
        "height": 240,
        "zIndex": 1,
        "visible": True,
        "props": table_props(
            rows,
            column_widths=[450] * len(rows[0]),
            row_heights=[120] * len(rows),
        ),
    }


def table_props(
    rows: list[list[dict[str, object]]],
    *,
    column_widths: list[int],
    row_heights: list[int],
) -> dict[str, object]:
    return {
        "rows": rows,
        "columnWidths": column_widths,
        "rowHeights": row_heights,
        "borderColor": "#CBD5E1",
        "borderWidth": 1,
    }


def cell(
    text: str,
    *,
    fill: str = "#FFFFFF",
    font_weight: str = "normal",
) -> dict[str, object]:
    return {
        "text": text,
        "fill": fill,
        "textColor": "#111827",
        "fontFamily": "Aptos",
        "fontSize": 24,
        "fontWeight": font_weight,
        "align": "left",
        "verticalAlign": "middle",
        "borderColor": "#CBD5E1",
        "borderWidth": 1,
        "colSpan": 1,
        "rowSpan": 1,
    }


def table_props_operation(
    slide_id: str, element_id: str, props: dict[str, object]
) -> dict[str, object]:
    return {
        "type": "update_element_props",
        "slideId": slide_id,
        "elementId": element_id,
        "props": props,
    }


def imported_table_element(
    generated: PptxOoxmlGenerationResult,
) -> dict[str, Any]:
    blueprint = generated.blueprint
    return next(
        element
        for element in blueprint["slides"][0]["elements"]
        if element.get("type") == "table"
    )


def imported_table_source(
    generated: PptxOoxmlGenerationResult,
    element_id: str,
) -> dict[str, Any]:
    blueprint = generated.template_blueprint
    return source_from_blueprint(blueprint, element_id)


def source_from_blueprint(
    blueprint: dict[str, Any],
    element_id: str,
) -> dict[str, Any]:
    slides = blueprint["slides"]
    assert isinstance(slides, list)
    sources = slides[0]["elementSources"]
    return next(source for source in sources if source.get("elementId") == element_id)


def current_package_bytes(result: PptxOoxmlSyncResult) -> bytes:
    asset = next(item for item in result.assets if item.asset_id == "current_package")
    return base64.b64decode(asset.content_base64)


def rewrite_slide(
    source_path: Path,
    target_path: Path,
    mutate: Callable[[ET.Element], None],
) -> Path:
    with (
        ZipFile(source_path, "r") as source,
        ZipFile(target_path, "w", ZIP_DEFLATED) as target,
    ):
        for name in source.namelist():
            payload = source.read(name)
            if name == SLIDE_PART:
                root = ET.fromstring(payload)
                mutate(root)
                payload = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            target.writestr(name, payload)
    return target_path


def add_unknown_cell_formatting(root: ET.Element) -> None:
    cell_element = first_descendant(root, "tc")
    first_descendant(cell_element, "pPr").set("marL", "17")
    run_properties = first_descendant(cell_element, "rPr")
    run_properties.set("kumimoji", "1")
    ET.SubElement(run_properties, f"{{{TEST_NS}}}runMarker", {"value": "kept"})
    cell_properties = first_child(cell_element, "tcPr")
    cell_properties.set(f"{{{TEST_NS}}}flag", "kept")
    ET.SubElement(cell_properties, f"{{{TEST_NS}}}cellMarker")


def add_stale_cell_attribute(root: ET.Element) -> None:
    first_child(first_descendant(root, "tc"), "tcPr").set(f"{{{TEST_NS}}}stale", "1")


def merge_first_cell(root: ET.Element) -> None:
    first_descendant(root, "tc").set("gridSpan", "2")


def remove_last_cell(root: ET.Element) -> None:
    rows = list(root.iter(f"{{{DML_NS}}}tr"))
    cells = direct_children(rows[-1], "tc")
    rows[-1].remove(cells[-1])


def make_first_cell_empty_with_end_style(root: ET.Element) -> None:
    cell_element = first_descendant(root, "tc")
    paragraph = first_descendant(cell_element, "p")
    for run in direct_children(paragraph, "r"):
        paragraph.remove(run)
    end_properties = ET.SubElement(
        paragraph,
        f"{{{DML_NS}}}endParaRPr",
        {"lang": "ko-KR", "sz": "1200", "kumimoji": "1"},
    )
    ET.SubElement(end_properties, f"{{{TEST_NS}}}styleMarker", {"value": "kept"})


def add_second_run(root: ET.Element) -> None:
    paragraph = first_descendant(first_descendant(root, "tc"), "p")
    run = first_child(paragraph, "r")
    paragraph.insert(list(paragraph).index(run) + 1, copy.deepcopy(run))


def replace_run_with_field(root: ET.Element) -> None:
    paragraph = first_descendant(first_descendant(root, "tc"), "p")
    run = first_child(paragraph, "r")
    field = copy.deepcopy(run)
    field.tag = f"{{{DML_NS}}}fld"
    field.set("id", "{00000000-0000-0000-0000-000000000001}")
    paragraph.insert(list(paragraph).index(run), field)
    paragraph.remove(run)


def add_run_hyperlink(root: ET.Element) -> None:
    run_properties = first_descendant(first_descendant(root, "tc"), "rPr")
    ET.SubElement(run_properties, f"{{{DML_NS}}}hlinkClick", {"action": "test"})


def table_cells(package: bytes) -> list[ET.Element]:
    with ZipFile(BytesIO(package), "r") as archive:
        root = ET.fromstring(archive.read(SLIDE_PART))
    table = first_descendant(root, "tbl")
    return [
        cell_element
        for row in direct_children(table, "tr")
        for cell_element in direct_children(row, "tc")
    ]


def shape_by_id(package: bytes, shape_id: str) -> ET.Element:
    shape = find_shape_in_package(package, shape_id)
    assert shape is not None
    return shape


def find_shape_in_package(package: bytes, shape_id: str) -> ET.Element | None:
    with ZipFile(BytesIO(package), "r") as archive:
        root = ET.fromstring(archive.read(SLIDE_PART))
    shape, _parent = find_shape_by_id(root, shape_id)
    return shape


def table_cell_text(cell_element: ET.Element) -> str:
    return "\n".join(
        "".join(node.text or "" for node in paragraph.iter(f"{{{DML_NS}}}t"))
        for paragraph in direct_children(first_child(cell_element, "txBody"), "p")
    )


def canonical(element: ET.Element) -> str:
    return ET.canonicalize(
        ET.tostring(element, encoding="unicode"),
        with_comments=False,
        rewrite_prefixes=True,
    )


def first_child(element: ET.Element | None, name: str) -> ET.Element:
    assert element is not None
    child = next((item for item in list(element) if local_name(item) == name), None)
    assert child is not None
    return child


def optional_child(element: ET.Element | None, name: str) -> ET.Element | None:
    if element is None:
        return None
    return next((item for item in list(element) if local_name(item) == name), None)


def first_descendant(element: ET.Element, name: str) -> ET.Element:
    child = next((item for item in element.iter() if local_name(item) == name), None)
    assert child is not None
    return child


def direct_children(element: ET.Element, name: str) -> list[ET.Element]:
    return [item for item in list(element) if local_name(item) == name]


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", maxsplit=1)[-1]
