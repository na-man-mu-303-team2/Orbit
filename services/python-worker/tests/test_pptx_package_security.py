from __future__ import annotations

import zipfile
from io import BytesIO

import pytest

from app.ai.pptx_package_security import (
    PPTX_ACTIVE_CONTENT_BLOCKED,
    PPTX_EXTERNAL_RELATIONSHIP_BLOCKED,
    PPTX_PACKAGE_PATH_TRAVERSAL,
    PPTX_PACKAGE_ZIP_BOMB,
    PptxPackageSecurityError,
    inspect_pptx_package,
    sanitize_pptx_package_for_render,
)


RELATIONSHIP_NS = (
    "http://schemas.openxmlformats.org/package/2006/relationships"
)


def test_package_preflight_rejects_path_traversal_before_reading_parts() -> None:
    package_bytes = package_with_entries({"../payload.xml": b"unsafe"})

    with pytest.raises(PptxPackageSecurityError) as error:
        inspect_pptx_package(package_bytes)

    assert error.value.code == PPTX_PACKAGE_PATH_TRAVERSAL


def test_package_preflight_rejects_extreme_compression_ratio() -> None:
    package_bytes = package_with_entries(
        {"ppt/media/repeated.bin": b"0" * (16 * 1024 * 1024)}
    )

    with pytest.raises(PptxPackageSecurityError) as error:
        inspect_pptx_package(package_bytes)

    assert error.value.code == PPTX_PACKAGE_ZIP_BOMB


def test_render_copy_removes_external_relationships_and_active_content() -> None:
    relationships = f"""<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="{RELATIONSHIP_NS}">
      <Relationship Id="rIdExternal" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/image.png" TargetMode="External"/>
      <Relationship Id="rIdOle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/object1.bin"/>
      <Relationship Id="rIdSafe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
    </Relationships>""".encode()
    content_types = b"""<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="png" ContentType="image/png"/>
      <Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>
      <Override PartName="/ppt/activeX/activeX1.xml" ContentType="application/vnd.ms-office.activeX+xml"/>
    </Types>"""
    package_bytes = package_with_entries(
        {
            "[Content_Types].xml": content_types,
            "ppt/slides/_rels/slide1.xml.rels": relationships,
            "ppt/media/image1.png": b"png",
            "ppt/embeddings/object1.bin": b"ole",
            "ppt/activeX/activeX1.xml": b"active",
            "ppt/vbaProject.bin": b"macro",
        }
    )

    report = inspect_pptx_package(package_bytes)

    assert report.diagnostic_codes == (
        PPTX_EXTERNAL_RELATIONSHIP_BLOCKED,
        PPTX_ACTIVE_CONTENT_BLOCKED,
    )
    sanitized = sanitize_pptx_package_for_render(package_bytes, report)
    with zipfile.ZipFile(BytesIO(sanitized), "r") as package:
        names = set(package.namelist())
        sanitized_relationships = package.read(
            "ppt/slides/_rels/slide1.xml.rels"
        )
        sanitized_content_types = package.read("[Content_Types].xml")

    assert "ppt/media/image1.png" in names
    assert "ppt/embeddings/object1.bin" not in names
    assert "ppt/activeX/activeX1.xml" not in names
    assert "ppt/vbaProject.bin" not in names
    assert b"rIdSafe" in sanitized_relationships
    assert b"rIdExternal" not in sanitized_relationships
    assert b"rIdOle" not in sanitized_relationships
    assert b"activeX1.xml" not in sanitized_content_types
    assert b"vbaProject" not in sanitized_content_types


def package_with_entries(entries: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as package:
        for name, content in entries.items():
            package.writestr(name, content)
    return buffer.getvalue()
