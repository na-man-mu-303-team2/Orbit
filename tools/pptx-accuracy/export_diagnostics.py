from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Literal, Mapping
from xml.etree import ElementTree
from zipfile import ZipFile


Disposition = Literal["skipped", "degraded", "intentional-hidden"]


@dataclass(frozen=True)
class ExportDiagnostic:
    code: str
    disposition: Disposition
    element_type: str
    element_id: str
    slide_id: str
    reported_by_exporter: bool

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        return {
            "code": payload["code"],
            "disposition": payload["disposition"],
            "elementType": payload["element_type"],
            "elementId": payload["element_id"],
            "slideId": payload["slide_id"],
            "reportedByExporter": payload["reported_by_exporter"],
        }


@dataclass(frozen=True)
class SemanticAssertion:
    code: str
    expected: int
    actual: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "expected": self.expected,
            "actual": self.actual,
            "passed": self.expected == self.actual,
        }


SUPPORTED_EXPORT_ELEMENT_TYPES = {
    "text",
    "rect",
    "ellipse",
    "line",
    "arrow",
    "image",
    "chart",
    "table",
}

SEMANTIC_EXPECTATION_CODES = {
    "transitionCount": "OOXML_TRANSITION_COUNT",
    "timingSlideCount": "OOXML_TIMING_SLIDE_COUNT",
    "cropCount": "OOXML_IMAGE_CROP_COUNT",
    "cropLeft": "OOXML_IMAGE_CROP_LEFT",
    "cropTop": "OOXML_IMAGE_CROP_TOP",
    "cropRight": "OOXML_IMAGE_CROP_RIGHT",
    "cropBottom": "OOXML_IMAGE_CROP_BOTTOM",
    "chartCount": "OOXML_CHART_REFERENCE_COUNT",
    "tableCount": "OOXML_TABLE_COUNT",
}

PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"


def diagnostics_for_deck(deck: Mapping[str, Any]) -> list[ExportDiagnostic]:
    diagnostics: list[ExportDiagnostic] = []
    for slide in deck.get("slides", []):
        slide_id = str(slide.get("slideId", "unknown-slide"))
        for element in slide.get("elements", []):
            element_type = str(element.get("type", "unknown"))
            element_id = str(element.get("elementId", "unknown-element"))
            common = {
                "element_type": element_type,
                "element_id": element_id,
                "slide_id": slide_id,
            }
            if element.get("visible", True) is False:
                diagnostics.append(
                    ExportDiagnostic(
                        code="EXPORT_ELEMENT_INTENTIONAL_HIDDEN",
                        disposition="intentional-hidden",
                        reported_by_exporter=False,
                        **common,
                    )
                )
                continue
            if element_type == "group":
                diagnostics.append(
                    ExportDiagnostic(
                        code="EXPORT_GROUP_CONTAINER_SKIPPED",
                        disposition="skipped",
                        reported_by_exporter=True,
                        **common,
                    )
                )
                continue
            if element_type not in SUPPORTED_EXPORT_ELEMENT_TYPES:
                diagnostics.append(
                    ExportDiagnostic(
                        code="EXPORT_ELEMENT_TYPE_UNSUPPORTED",
                        disposition="skipped",
                        reported_by_exporter=True,
                        **common,
                    )
                )
                continue
            if element_type == "arrow":
                diagnostics.append(
                    ExportDiagnostic(
                        code="EXPORT_ARROWHEAD_DEGRADED_TO_LINE",
                        disposition="degraded",
                        reported_by_exporter=True,
                        **common,
                    )
                )
    return diagnostics


def summarize_diagnostics(
    diagnostics: Iterable[ExportDiagnostic],
) -> dict[str, Any]:
    rows = list(diagnostics)
    expected_exporter_warning_codes = sorted(
        {row.code for row in rows if row.reported_by_exporter}
    )
    return {
        "total": len(rows),
        "byCode": stable_counts(row.code for row in rows),
        "byDisposition": stable_counts(row.disposition for row in rows),
        "byElementType": stable_counts(row.element_type for row in rows),
        "expectedExporterWarningCodes": expected_exporter_warning_codes,
        "expectedExporterWarningCount": len(expected_exporter_warning_codes),
    }


def stable_counts(values: Iterable[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def warning_reconciliation(
    diagnostics: Iterable[ExportDiagnostic],
    observed_warning_codes: Iterable[str],
    actual_warning_count: int,
) -> dict[str, Any]:
    expected_codes = sorted(
        {row.code for row in diagnostics if row.reported_by_exporter}
    )
    observed_codes = sorted(set(observed_warning_codes))
    expected_code_set = set(expected_codes)
    observed_code_set = set(observed_codes)
    missing_codes = sorted(expected_code_set - observed_code_set)
    unexpected_codes = sorted(observed_code_set - expected_code_set)
    mapped_warning_count = len(observed_codes)
    unmapped_warning_count = max(0, actual_warning_count - mapped_warning_count)
    return {
        "code": "EXPORTER_WARNING_CODE_RECONCILIATION",
        "mappingMethod": "isolated-element-probe-v1",
        "expectedCodes": expected_codes,
        "observedCodes": observed_codes,
        "missingCodes": missing_codes,
        "unexpectedCodes": unexpected_codes,
        "actualCount": actual_warning_count,
        "mappedCount": mapped_warning_count,
        "unmappedCount": unmapped_warning_count,
        "matched": (
            not missing_codes
            and not unexpected_codes
            and actual_warning_count == mapped_warning_count
        ),
    }


def semantic_assertions(
    pptx_path: Path, expectations: Mapping[str, Any]
) -> list[SemanticAssertion]:
    actual = inspect_pptx_semantics(pptx_path)
    assertions: list[SemanticAssertion] = []
    for expectation_key, code in SEMANTIC_EXPECTATION_CODES.items():
        if expectation_key not in expectations:
            continue
        assertions.append(
            SemanticAssertion(
                code=code,
                expected=int(expectations[expectation_key]),
                actual=actual[expectation_key],
            )
        )
    return assertions


def inspect_pptx_semantics(pptx_path: Path) -> dict[str, int]:
    values = {
        "transitionCount": 0,
        "timingSlideCount": 0,
        "cropCount": 0,
        "cropLeft": 0,
        "cropTop": 0,
        "cropRight": 0,
        "cropBottom": 0,
        "chartCount": 0,
        "tableCount": 0,
    }
    crop_edges_recorded = False
    with ZipFile(pptx_path) as archive:
        slide_names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        for slide_name in slide_names:
            root = ElementTree.fromstring(archive.read(slide_name))
            values["transitionCount"] += len(
                root.findall(f".//{{{PRESENTATION_NS}}}transition")
            )
            if root.find(f".//{{{PRESENTATION_NS}}}timing") is not None:
                values["timingSlideCount"] += 1
            crop_rectangles = root.findall(f".//{{{DRAWING_NS}}}srcRect")
            values["cropCount"] += len(crop_rectangles)
            if crop_rectangles and not crop_edges_recorded:
                rectangle = crop_rectangles[0]
                values["cropLeft"] = int(rectangle.get("l", "0"))
                values["cropTop"] = int(rectangle.get("t", "0"))
                values["cropRight"] = int(rectangle.get("r", "0"))
                values["cropBottom"] = int(rectangle.get("b", "0"))
                crop_edges_recorded = True
            values["chartCount"] += len(root.findall(f".//{{{CHART_NS}}}chart"))
            values["tableCount"] += len(root.findall(f".//{{{DRAWING_NS}}}tbl"))
    return values


def ensure_tmp_output_path(repository_root: Path, requested: Path) -> Path:
    repository_root = repository_root.resolve()
    candidate = requested if requested.is_absolute() else repository_root / requested
    candidate = candidate.resolve()
    allowed_root = (repository_root / "tmp" / "pptx-export-accuracy").resolve()
    if candidate == allowed_root or allowed_root not in candidate.parents:
        raise ValueError(
            f"accuracy output must stay below {allowed_root}; received {candidate}"
        )
    return candidate


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_checksums(paths: Iterable[Path], base: Path) -> dict[str, Any]:
    rows = {
        path.relative_to(base).as_posix(): sha256_file(path)
        for path in sorted(paths)
    }
    aggregate_input = "".join(f"{name}\0{digest}\n" for name, digest in rows.items())
    return {
        "aggregateSha256": hashlib.sha256(aggregate_input.encode("utf-8")).hexdigest(),
        "files": rows,
    }


def canonical_json_sha256(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
