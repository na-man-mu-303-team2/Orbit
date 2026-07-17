from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from export_diagnostics import (  # noqa: E402
    artifact_checksums,
    canonical_json_sha256,
    diagnostics_for_deck,
    ensure_tmp_output_path,
    semantic_assertions,
    summarize_diagnostics,
    warning_reconciliation,
)
import score_deck_pptx_export_accuracy as score_module  # noqa: E402
from prepare_deck_pptx_export_accuracy import (  # noqa: E402
    probe_exporter_warning_codes,
)
from score_deck_pptx_export_accuracy import baseline_gate  # noqa: E402
from score_deck_pptx_export_accuracy import browser_capture_matches_manifest  # noqa: E402
from score_deck_pptx_export_accuracy import load_approved_baseline  # noqa: E402


class ExportDiagnosticsTest(unittest.TestCase):
    def test_diagnostics_use_stable_codes_and_dispositions(self) -> None:
        deck = {
            "slides": [
                {
                    "slideId": "slide_fixture",
                    "elements": [
                        element("el_group", "group"),
                        element("el_arrow", "arrow"),
                        element(
                            "el_image",
                            "image",
                            props={
                                "src": "data:image/png;base64,AA==",
                                "crop": {"left": 0.1},
                            },
                        ),
                        element("el_custom", "customShape"),
                        element("el_hidden", "rect", visible=False),
                    ],
                }
            ]
        }

        diagnostics = diagnostics_for_deck(deck)
        summary = summarize_diagnostics(diagnostics)

        self.assertEqual(
            summary["byCode"],
            {
                "EXPORT_ARROWHEAD_DEGRADED_TO_LINE": 1,
                "EXPORT_ELEMENT_INTENTIONAL_HIDDEN": 1,
                "EXPORT_ELEMENT_TYPE_UNSUPPORTED": 1,
                "EXPORT_GROUP_CONTAINER_SKIPPED": 1,
                "EXPORT_IMAGE_CROP_NOT_SERIALIZED": 1,
            },
        )
        self.assertEqual(
            summary["byDisposition"],
            {"degraded": 2, "intentional-hidden": 1, "skipped": 2},
        )
        self.assertEqual(summary["expectedExporterWarningCount"], 3)
        expected_codes = [
            "EXPORT_ARROWHEAD_DEGRADED_TO_LINE",
            "EXPORT_ELEMENT_TYPE_UNSUPPORTED",
            "EXPORT_GROUP_CONTAINER_SKIPPED",
        ]
        self.assertEqual(summary["expectedExporterWarningCodes"], expected_codes)
        self.assertTrue(
            warning_reconciliation(diagnostics, expected_codes, 3)["matched"]
        )
        count_only_match = warning_reconciliation(
            diagnostics,
            ["EXPORT_ARROWHEAD_DEGRADED_TO_LINE"],
            3,
        )
        self.assertFalse(count_only_match["matched"])
        self.assertEqual(count_only_match["unmappedCount"], 2)
        self.assertEqual(
            count_only_match["missingCodes"],
            [
                "EXPORT_ELEMENT_TYPE_UNSUPPORTED",
                "EXPORT_GROUP_CONTAINER_SKIPPED",
            ],
        )

    def test_warning_codes_are_observed_with_isolated_exporter_probes(self) -> None:
        try:
            from app.ai.deck_pptx_export import (
                DeckPptxExportRequest,
                export_deck_pptx,
            )
        except ImportError:
            self.skipTest("worker PPTX exporter dependencies are unavailable")

        deck = {
            "canvas": {"width": 1920, "height": 1080},
            "theme": {},
            "slides": [
                {
                    "slideId": "slide_fixture",
                    "order": 1,
                    "style": {},
                    "elements": [
                        element("el_arrow", "arrow"),
                        element("el_custom", "customShape"),
                        element("el_group", "group"),
                    ],
                }
            ],
        }
        diagnostics = diagnostics_for_deck(deck)
        observed_codes = probe_exporter_warning_codes(deck, diagnostics)
        response = export_deck_pptx(DeckPptxExportRequest(deck=deck))
        reconciliation = warning_reconciliation(
            diagnostics,
            observed_codes,
            len(response.warnings),
        )

        self.assertTrue(reconciliation["matched"])
        self.assertEqual(reconciliation["observedCodes"], observed_codes)
        self.assertEqual(reconciliation["unmappedCount"], 0)

    def test_output_path_must_stay_in_ignored_accuracy_tmp(self) -> None:
        root = Path("/repo")
        allowed = ensure_tmp_output_path(
            root, Path("tmp/pptx-export-accuracy/session/run-1")
        )
        self.assertEqual(
            allowed, Path("/repo/tmp/pptx-export-accuracy/session/run-1")
        )
        for rejected in (
            Path("docs/quality/generated"),
            Path("tmp/pptx-export-accuracy"),
            Path("../outside"),
        ):
            with self.subTest(rejected=rejected):
                with self.assertRaises(ValueError):
                    ensure_tmp_output_path(root, rejected)

    def test_semantic_assertions_read_slide_ooxml_without_text_regex(self) -> None:
        slide_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
 <p:cSld><p:spTree><a:srcRect/><c:chart/><a:tbl/></p:spTree></p:cSld>
 <p:transition/><p:timing/>
</p:sld>"""
        with tempfile.TemporaryDirectory() as directory:
            pptx_path = Path(directory) / "fixture.pptx"
            with ZipFile(pptx_path, "w", ZIP_DEFLATED) as archive:
                archive.writestr("ppt/slides/slide1.xml", slide_xml)
            assertions = semantic_assertions(
                pptx_path,
                {
                    "transitionCount": 1,
                    "timingSlideCount": 1,
                    "cropCount": 1,
                    "chartCount": 1,
                    "tableCount": 1,
                },
            )

        self.assertEqual(len(assertions), 5)
        self.assertTrue(all(row.to_dict()["passed"] for row in assertions))

    def test_checksums_are_independent_of_run_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            run_one = temp / "run-one"
            run_two = temp / "run-two"
            for run in (run_one, run_two):
                (run / "browser").mkdir(parents=True)
                (run / "libreoffice").mkdir(parents=True)
                (run / "browser/slide.png").write_bytes(b"browser")
                (run / "libreoffice/slide.png").write_bytes(b"libreoffice")
            first = artifact_checksums(
                [run_one / "browser/slide.png", run_one / "libreoffice/slide.png"],
                run_one,
            )
            second = artifact_checksums(
                [run_two / "browser/slide.png", run_two / "libreoffice/slide.png"],
                run_two,
            )

        self.assertEqual(first, second)
        self.assertEqual(
            canonical_json_sha256({"b": 2, "a": 1}),
            canonical_json_sha256({"a": 1, "b": 2}),
        )

    def test_baseline_gate_checks_each_fixture_not_only_average(self) -> None:
        baseline = report_payload(
            rows=[
                {"name": "slide-1", "ssim": 0.9, "colorMae": 0.1},
                {"name": "slide-2", "ssim": 0.9, "colorMae": 0.1},
            ],
            average=0.9,
        )
        current = report_payload(
            rows=[
                {"name": "slide-1", "ssim": 0.95, "colorMae": 0.05},
                {"name": "slide-2", "ssim": 0.85, "colorMae": 0.15},
            ],
            average=0.9,
        )

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        self.assertFalse(gate["passed"])
        failed_fixture_checks = [
            check
            for check in gate["checks"]
            if check.get("fixture") == "slide-2" and not check["passed"]
        ]
        self.assertEqual(len(failed_fixture_checks), 2)

    def test_baseline_gate_allows_warning_improvement_with_healthy_reconciliation(
        self,
    ) -> None:
        baseline = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        baseline["diagnosticSummary"] = {
            "byCode": {
                "EXPORT_ARROWHEAD_DEGRADED_TO_LINE": 1,
                "EXPORT_IMAGE_CROP_NOT_SERIALIZED": 1,
            },
            "byDisposition": {"degraded": 2},
            "byElementType": {"arrow": 1, "image": 1},
        }
        baseline["exporterWarningReconciliation"] = reconciliation(
            ["EXPORT_ARROWHEAD_DEGRADED_TO_LINE"]
        )
        current = copy.deepcopy(baseline)
        current["diagnosticSummary"] = {
            "byCode": {"EXPORT_IMAGE_CROP_NOT_SERIALIZED": 1},
            "byDisposition": {"degraded": 1},
            "byElementType": {"image": 1},
        }
        current["exporterWarningReconciliation"] = reconciliation([])

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        self.assertTrue(gate["passed"])

    def test_baseline_gate_rejects_diagnostic_code_or_element_type_exchange(
        self,
    ) -> None:
        baseline = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        baseline["diagnosticSummary"] = {
            "byCode": {"EXPORT_ELEMENT_TYPE_UNSUPPORTED": 1},
            "byDisposition": {"skipped": 1},
            "byElementType": {"customShape": 1},
        }
        current = copy.deepcopy(baseline)
        current["diagnosticSummary"] = {
            "byCode": {"EXPORT_NEW_STRUCTURAL_LOSS": 1},
            "byDisposition": {"skipped": 1},
            "byElementType": {"video": 1},
        }

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        self.assertFalse(gate["passed"])
        failures = [check for check in gate["checks"] if not check["passed"]]
        self.assertTrue(
            any(
                check.get("dimension") == "byCode"
                and check.get("key") == "EXPORT_NEW_STRUCTURAL_LOSS"
                for check in failures
            )
        )
        self.assertTrue(
            any(
                check.get("dimension") == "byElementType"
                and check.get("key") == "video"
                for check in failures
            )
        )

    def test_baseline_gate_rejects_unhealthy_warning_reconciliation(self) -> None:
        baseline = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        mutations = {
            "matched": {"matched": False},
            "missing": {"missingCodes": ["EXPORT_MISSING"]},
            "unexpected": {"unexpectedCodes": ["EXPORT_UNEXPECTED"]},
            "unmapped": {"unmappedCount": 1},
            "count": {"actualCount": 1},
        }
        for label, mutation in mutations.items():
            with self.subTest(label=label):
                current = copy.deepcopy(baseline)
                current["exporterWarningReconciliation"].update(mutation)
                gate = baseline_gate(
                    current,
                    baseline,
                    max_average_ssim_drop=0,
                    max_slide_ssim_drop=0,
                    max_slide_mae_increase=0,
                )

                health = next(
                    check
                    for check in gate["checks"]
                    if check["code"]
                    == "BASELINE_EXPORTER_WARNING_RECONCILIATION_HEALTH"
                )
                self.assertFalse(health["passed"])
                self.assertFalse(gate["passed"])

    def test_semantic_gate_allows_progress_without_overshooting_expected_count(
        self,
    ) -> None:
        baseline = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        cases = ((0, False, True), (1, True, True), (2, False, False))
        for actual, assertion_passed, expected_gate in cases:
            with self.subTest(actual=actual):
                current = copy.deepcopy(baseline)
                current["semanticAssertions"][0].update(
                    {"actual": actual, "passed": assertion_passed}
                )
                gate = baseline_gate(
                    current,
                    baseline,
                    max_average_ssim_drop=0,
                    max_slide_ssim_drop=0,
                    max_slide_mae_increase=0,
                )

                semantic_check = next(
                    check
                    for check in gate["checks"]
                    if check.get("assertion") == "OOXML_IMAGE_CROP_COUNT"
                )
                self.assertEqual(semantic_check["passed"], expected_gate)
                self.assertEqual(gate["passed"], expected_gate)

    def test_baseline_gate_requires_exact_slide_and_semantic_code_sets(self) -> None:
        baseline = report_payload(
            rows=[
                {
                    "name": "slide-1",
                    "slideId": "slide_one",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                },
                {
                    "name": "slide-2",
                    "slideId": "slide_two",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                },
            ],
            average=0.9,
        )
        current = report_payload(
            rows=[
                {
                    "name": "slide-1",
                    "slideId": "slide_one",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                },
                {
                    "name": "slide-3",
                    "slideId": "slide_three",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                },
            ],
            average=0.9,
        )
        current["semanticAssertions"] = [
            {
                "code": "OOXML_TABLE_COUNT",
                "expected": 1,
                "actual": 1,
                "passed": True,
            }
        ]

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        failed_codes = {
            check["code"] for check in gate["checks"] if not check["passed"]
        }
        self.assertIn("BASELINE_SLIDE_SET_MATCH", failed_codes)
        self.assertIn("BASELINE_SEMANTIC_CODE_SET_MATCH", failed_codes)

    def test_exporter_source_hash_is_not_part_of_environment_equality(self) -> None:
        baseline = report_payload(
            rows=[
                {
                    "name": "slide-1",
                    "slideId": "slide_one",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                }
            ],
            average=0.9,
        )
        current = report_payload(
            rows=[
                {
                    "name": "slide-1",
                    "slideId": "slide_one",
                    "ssim": 0.9,
                    "colorMae": 0.1,
                }
            ],
            average=0.9,
        )
        baseline["exporterSourceSha256"] = "before"
        current["exporterSourceSha256"] = "after"

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        self.assertTrue(gate["passed"])
        tool_check = next(
            check
            for check in gate["checks"]
            if check["code"] == "BASELINE_TOOL_VERSION_MATCH"
        )
        self.assertTrue(tool_check["passed"])

    def test_browser_capture_environment_must_match_baseline(self) -> None:
        baseline = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        current = report_payload(
            rows=[{"name": "slide-1", "ssim": 0.9, "colorMae": 0.1}],
            average=0.9,
        )
        baseline["browserCapture"] = {"browserVersion": "1"}
        current["browserCapture"] = {"browserVersion": "2"}

        gate = baseline_gate(
            current,
            baseline,
            max_average_ssim_drop=0,
            max_slide_ssim_drop=0,
            max_slide_mae_increase=0,
        )

        self.assertFalse(gate["passed"])
        self.assertFalse(
            next(
                check
                for check in gate["checks"]
                if check["code"] == "BASELINE_BROWSER_CAPTURE_MATCH"
            )["passed"]
        )

    def test_approved_baseline_loader_fails_closed_on_missing_or_legacy_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(FileNotFoundError):
                load_approved_baseline(root / "missing.json")
            legacy = root / "legacy.json"
            legacy.write_text(json.dumps({"schemaVersion": 1}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_approved_baseline(legacy)

            invalid_provenance = root / "invalid-provenance.json"
            approved_payload = json.loads(
                (TOOLS / "baselines" / "export-fidelity-baseline.json").read_text(
                    encoding="utf-8"
                )
            )
            approved_payload["exporterSourceSha256"] = "not-a-sha256"
            invalid_provenance.write_text(
                json.dumps(approved_payload), encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "exporter source provenance"):
                load_approved_baseline(invalid_provenance)

        approved = load_approved_baseline(
            TOOLS / "baselines" / "export-fidelity-baseline.json"
        )
        self.assertEqual(approved["kind"], "deck-pptx-export-baseline")
        self.assertNotIn("exporterSourceSha256", approved["toolVersions"])

    def test_browser_capture_must_match_declared_render_environment(self) -> None:
        manifest = {
            "render": {
                "deviceScaleFactor": 1,
                "locale": "ko-KR",
                "timezoneId": "UTC",
                "viewport": {"height": 1080, "width": 1920},
            },
            "browserCapture": {
                "browserVersion": "149.0",
                "deviceScaleFactor": 1,
                "locale": "ko-KR",
                "timezoneId": "UTC",
                "viewport": {"height": 1080, "width": 1920},
            },
        }

        self.assertTrue(browser_capture_matches_manifest(manifest))
        manifest["browserCapture"]["locale"] = "en-US"
        self.assertFalse(browser_capture_matches_manifest(manifest))

    def test_score_row_rejects_dimension_mismatch_without_resize(self) -> None:
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow is unavailable in the lightweight test interpreter")

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            Image.new("RGB", (10, 10), "white").save(root / "reference.png")
            Image.new("RGB", (11, 10), "white").save(root / "candidate.png")
            original_root = score_module.ROOT
            score_module.ROOT = root
            try:
                result = score_module.score_row(
                    {
                        "name": "dimension-fixture",
                        "slideId": "slide_dimension",
                        "libreOfficePath": "reference.png",
                        "candidatePath": "candidate.png",
                    }
                )
            finally:
                score_module.ROOT = original_root

        self.assertEqual(result["status"], "dimension-mismatch")
        self.assertIsNone(result["ssim"])
        self.assertEqual(
            result["dimensions"],
            {"libreOffice": [10, 10], "browser": [11, 10]},
        )


def element(
    element_id: str,
    element_type: str,
    *,
    props: dict[str, object] | None = None,
    visible: bool = True,
) -> dict[str, object]:
    return {
        "elementId": element_id,
        "type": element_type,
        "visible": visible,
        "props": props or {},
    }


def report_payload(
    *, rows: list[dict[str, object]], average: float
) -> dict[str, object]:
    return {
        "fixtureSha256": "fixture",
        "fontFiles": [{"sha256": "font"}],
        "toolVersions": {"libreOffice": "version"},
        "browserCapture": {"browserVersion": "version"},
        "exporterWarningReconciliation": reconciliation([]),
        "metrics": {"averageSsim": average},
        "rows": rows,
        "semanticAssertions": [
            {
                "code": "OOXML_IMAGE_CROP_COUNT",
                "expected": 1,
                "actual": 0,
                "passed": False,
            }
        ],
        "diagnosticSummary": {
            "byCode": {
                "EXPORT_ELEMENT_TYPE_UNSUPPORTED": 1,
                "EXPORT_IMAGE_CROP_NOT_SERIALIZED": 1,
            },
            "byDisposition": {"skipped": 1, "degraded": 1},
            "byElementType": {"customShape": 1, "image": 1},
        },
    }


def reconciliation(codes: list[str]) -> dict[str, object]:
    return {
        "actualCount": len(codes),
        "code": "EXPORTER_WARNING_CODE_RECONCILIATION",
        "expectedCodes": codes,
        "mappedCount": len(codes),
        "mappingMethod": "isolated-element-probe-v1",
        "matched": True,
        "missingCodes": [],
        "observedCodes": codes,
        "unexpectedCodes": [],
        "unmappedCount": 0,
    }


if __name__ == "__main__":
    unittest.main()
