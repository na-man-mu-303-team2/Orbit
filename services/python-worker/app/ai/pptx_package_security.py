from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass
from io import BytesIO
from typing import cast
from xml.etree import ElementTree as ET


PPTX_PACKAGE_INVALID = "PPTX_PACKAGE_INVALID"
PPTX_PACKAGE_PATH_TRAVERSAL = "PPTX_PACKAGE_PATH_TRAVERSAL"
PPTX_PACKAGE_ZIP_BOMB = "PPTX_PACKAGE_ZIP_BOMB"
PPTX_EXTERNAL_RELATIONSHIP_BLOCKED = "PPTX_EXTERNAL_RELATIONSHIP_BLOCKED"
PPTX_ACTIVE_CONTENT_BLOCKED = "PPTX_ACTIVE_CONTENT_BLOCKED"

MAX_PACKAGE_ENTRIES = 20_000
MAX_PACKAGE_ENTRY_BYTES = 128 * 1024 * 1024
MAX_PACKAGE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_PACKAGE_COMPRESSION_RATIO = 1_000
MIN_RATIO_CHECK_BYTES = 1024 * 1024

RELATIONSHIP_NS = (
    "http://schemas.openxmlformats.org/package/2006/relationships"
)
CONTENT_TYPES_NS = (
    "http://schemas.openxmlformats.org/package/2006/content-types"
)
ACTIVE_PART_PREFIXES = ("ppt/activex/", "ppt/embeddings/")
ACTIVE_PART_NAMES = {
    "ppt/vbaproject.bin",
    "ppt/vbasignature.bin",
}
ACTIVE_RELATIONSHIP_SUFFIXES = (
    "/attachedtemplate",
    "/control",
    "/oleobject",
    "/package",
    "/vbaproject",
)
ACTIVE_CONTENT_TYPE_MARKERS = (
    "activex",
    "macroenabled",
    "ms-office.vbaproject",
    "oleobject",
)


class PptxPackageSecurityError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class PptxPackageSecurityReport:
    diagnostic_codes: tuple[str, ...]
    active_parts: frozenset[str]
    relationship_parts_to_sanitize: frozenset[str]


def inspect_pptx_package(package_bytes: bytes) -> PptxPackageSecurityReport:
    try:
        package = zipfile.ZipFile(BytesIO(package_bytes), "r")
    except (OSError, zipfile.BadZipFile) as error:
        raise PptxPackageSecurityError(PPTX_PACKAGE_INVALID) from error

    external_relationship = False
    active_content = False
    active_parts: set[str] = set()
    relationship_parts_to_sanitize: set[str] = set()
    try:
        infos = package.infolist()
        if len(infos) > MAX_PACKAGE_ENTRIES:
            raise PptxPackageSecurityError(PPTX_PACKAGE_ZIP_BOMB)
        total_uncompressed_bytes = 0
        seen_names: set[str] = set()
        for info in infos:
            name = info.filename
            if not package_part_name_is_safe(name) or name in seen_names:
                raise PptxPackageSecurityError(PPTX_PACKAGE_PATH_TRAVERSAL)
            seen_names.add(name)
            total_uncompressed_bytes += info.file_size
            if (
                info.file_size > MAX_PACKAGE_ENTRY_BYTES
                or total_uncompressed_bytes > MAX_PACKAGE_UNCOMPRESSED_BYTES
                or compression_ratio_is_unsafe(info)
            ):
                raise PptxPackageSecurityError(PPTX_PACKAGE_ZIP_BOMB)
            if active_part_name(name):
                active_parts.add(name)
                active_content = True

        for info in infos:
            name = info.filename
            if name == "[Content_Types].xml":
                root = parse_package_xml(package.read(name))
                for item in root:
                    content_type = str(item.get("ContentType", "")).lower()
                    part_name = str(item.get("PartName", "")).lstrip("/")
                    if active_content_type(content_type):
                        active_content = True
                        if part_name:
                            active_parts.add(part_name)
                continue
            if not name.endswith(".rels"):
                continue
            root = parse_package_xml(package.read(name))
            for relationship in root:
                if local_name(relationship) != "Relationship":
                    continue
                relationship_type = str(
                    relationship.get("Type", "")
                ).lower()
                target_mode = str(
                    relationship.get("TargetMode", "")
                ).lower()
                if target_mode == "external":
                    external_relationship = True
                    relationship_parts_to_sanitize.add(name)
                if active_relationship_type(relationship_type):
                    active_content = True
                    relationship_parts_to_sanitize.add(name)

        diagnostic_codes = tuple(
            code
            for code, present in (
                (PPTX_EXTERNAL_RELATIONSHIP_BLOCKED, external_relationship),
                (PPTX_ACTIVE_CONTENT_BLOCKED, active_content),
            )
            if present
        )
        return PptxPackageSecurityReport(
            diagnostic_codes=diagnostic_codes,
            active_parts=frozenset(active_parts),
            relationship_parts_to_sanitize=frozenset(
                relationship_parts_to_sanitize
            ),
        )
    except PptxPackageSecurityError:
        raise
    except (KeyError, OSError, ET.ParseError) as error:
        raise PptxPackageSecurityError(PPTX_PACKAGE_INVALID) from error
    finally:
        package.close()


def sanitize_pptx_package_for_render(
    package_bytes: bytes,
    report: PptxPackageSecurityReport | None = None,
) -> bytes:
    report = report or inspect_pptx_package(package_bytes)
    if not report.diagnostic_codes:
        return package_bytes

    source = zipfile.ZipFile(BytesIO(package_bytes), "r")
    output = BytesIO()
    try:
        with zipfile.ZipFile(output, "w") as target:
            for info in source.infolist():
                if info.filename in report.active_parts:
                    continue
                content = source.read(info.filename)
                if info.filename.endswith(".rels"):
                    content = sanitized_relationships_xml(
                        content,
                        info.filename,
                        report.active_parts,
                    )
                elif info.filename == "[Content_Types].xml":
                    content = sanitized_content_types_xml(
                        content,
                        report.active_parts,
                    )
                target.writestr(info, content)
    finally:
        source.close()
    return output.getvalue()


def package_part_name_is_safe(name: str) -> bool:
    if not name or "\\" in name or name.startswith("/"):
        return False
    normalized = posixpath.normpath(name)
    return (
        normalized == name.rstrip("/")
        and normalized not in {"", ".", ".."}
        and not normalized.startswith("../")
        and all(piece not in {"", ".", ".."} for piece in normalized.split("/"))
    )


def compression_ratio_is_unsafe(info: zipfile.ZipInfo) -> bool:
    if info.file_size < MIN_RATIO_CHECK_BYTES:
        return False
    if info.compress_size <= 0:
        return True
    return info.file_size / info.compress_size > MAX_PACKAGE_COMPRESSION_RATIO


def active_part_name(name: str) -> bool:
    normalized = name.lower().rstrip("/")
    return normalized in ACTIVE_PART_NAMES or normalized.startswith(
        ACTIVE_PART_PREFIXES
    )


def active_relationship_type(relationship_type: str) -> bool:
    return relationship_type.endswith(ACTIVE_RELATIONSHIP_SUFFIXES)


def active_content_type(content_type: str) -> bool:
    return any(marker in content_type for marker in ACTIVE_CONTENT_TYPE_MARKERS)


def sanitized_relationships_xml(
    content: bytes,
    relationships_part: str,
    active_parts: frozenset[str],
) -> bytes:
    root = parse_package_xml(content)
    source_part = source_part_for_relationships(relationships_part)
    for relationship in list(root):
        if local_name(relationship) != "Relationship":
            continue
        target_mode = str(relationship.get("TargetMode", "")).lower()
        relationship_type = str(relationship.get("Type", "")).lower()
        target_part = resolve_part_path(
            source_part,
            str(relationship.get("Target", "")),
        )
        if (
            target_mode == "external"
            or active_relationship_type(relationship_type)
            or target_part in active_parts
        ):
            root.remove(relationship)
    return cast(
        bytes,
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
    )


def sanitized_content_types_xml(
    content: bytes,
    active_parts: frozenset[str],
) -> bytes:
    root = parse_package_xml(content)
    active_extensions = {
        part.rpartition(".")[2].lower()
        for part in active_parts
        if "." in part
    }
    for item in list(root):
        content_type = str(item.get("ContentType", "")).lower()
        part_name = str(item.get("PartName", "")).lstrip("/")
        extension = str(item.get("Extension", "")).lower()
        if (
            active_content_type(content_type)
            or part_name in active_parts
            or (extension and extension in active_extensions)
        ):
            root.remove(item)
    return cast(
        bytes,
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
    )


def source_part_for_relationships(relationships_part: str) -> str:
    directory, _, filename = relationships_part.rpartition("/")
    source_directory = directory.removesuffix("/_rels")
    return posixpath.join(source_directory, filename.removesuffix(".rels"))


def resolve_part_path(source_part: str, target: str) -> str:
    if target.startswith("/"):
        return posixpath.normpath(target).lstrip("/")
    return posixpath.normpath(
        posixpath.join(posixpath.dirname(source_part), target)
    )


def parse_package_xml(content: bytes) -> ET.Element:
    return ET.fromstring(content)


def local_name(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1]


ET.register_namespace("", RELATIONSHIP_NS)
ET.register_namespace("", CONTENT_TYPES_NS)
