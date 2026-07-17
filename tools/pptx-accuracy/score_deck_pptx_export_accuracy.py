from __future__ import annotations

# ruff: noqa: E402

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "services" / "python-worker"
DEFAULT_RUN_DIR = ROOT / "tmp" / "pptx-export-accuracy" / "run"
DEFAULT_BASELINE = (
    ROOT
    / "tools"
    / "pptx-accuracy"
    / "baselines"
    / "export-fidelity-baseline.json"
)
BASELINE_KIND = "deck-pptx-export-baseline"
BASELINE_SCHEMA_VERSION = 2

sys.path.insert(0, str(WORKER))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_diagnostics import (
    artifact_checksums,
    canonical_json_sha256,
    ensure_tmp_output_path,
    semantic_assertions,
)


def main() -> None:
    args = parse_args()
    run_dir = ensure_tmp_output_path(ROOT, args.run_dir)
    manifest_path = (
        resolve_repo_path(args.manifest) if args.manifest else run_dir / "manifest.json"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    baseline = None
    if not args.report_only:
        baseline_path = resolve_repo_path(args.baseline or DEFAULT_BASELINE)
        baseline = load_approved_baseline(baseline_path)
    rows = [score_row(row) for row in manifest["rows"]]

    evaluated = [row for row in rows if row["status"] == "evaluated"]
    missing_count = sum(1 for row in rows if row["status"] == "missing")
    dimension_mismatch_count = sum(
        1 for row in rows if row["status"] == "dimension-mismatch"
    )
    metric_summary = summarize_metrics(evaluated, len(rows), missing_count)
    assertions = [
        assertion.to_dict()
        for assertion in semantic_assertions(
            ROOT / manifest["pptxPath"], manifest.get("semanticExpectations", {})
        )
    ]
    rendered_paths = [
        ROOT / row[path_key]
        for row in manifest["rows"]
        for path_key in ("libreOfficePath", "candidatePath")
        if (ROOT / row[path_key]).exists()
    ]
    checksums = artifact_checksums(rendered_paths, run_dir)

    deterministic_payload = {
        "fixtureSha256": manifest["fixtureSha256"],
        "exporterSourceSha256": manifest["exporterSourceSha256"],
        "fontFiles": manifest.get("fontFiles", []),
        "toolVersions": manifest.get("toolVersions", {}),
        "browserCapture": manifest.get("browserCapture", {}),
        "metrics": metric_summary,
        "rows": rows,
        "diagnosticSummary": manifest.get("diagnosticSummary", {}),
        "exporterWarningReconciliation": manifest.get(
            "exporterWarningReconciliation", {}
        ),
        "semanticAssertions": assertions,
        "artifactChecksums": checksums,
    }
    determinism_checksum = canonical_json_sha256(deterministic_payload)
    gate = baseline_gate(
        deterministic_payload,
        baseline,
        max_average_ssim_drop=args.max_average_ssim_drop,
        max_slide_ssim_drop=args.max_slide_ssim_drop,
        max_slide_mae_increase=args.max_slide_mae_increase,
    )
    infrastructure_failures = []
    if missing_count:
        infrastructure_failures.append("ACCURACY_RENDER_MISSING")
    if dimension_mismatch_count:
        infrastructure_failures.append("ACCURACY_DIMENSION_MISMATCH")
    if not manifest.get("exporterWarningReconciliation", {}).get("matched", False):
        infrastructure_failures.append("ACCURACY_DIAGNOSTIC_WARNING_MISMATCH")
    if not browser_capture_matches_manifest(manifest):
        infrastructure_failures.append("ACCURACY_BROWSER_CAPTURE_ENVIRONMENT_MISMATCH")

    report = {
        "schemaVersion": 2,
        "mode": gate["mode"],
        **deterministic_payload,
        "determinismChecksum": determinism_checksum,
        "gate": gate,
        "infrastructureFailures": infrastructure_failures,
    }
    report_json = run_dir / "pptx-export-accuracy-report.json"
    report_markdown = run_dir / "pptx-export-accuracy-report.md"
    report_json.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    report_markdown.write_text(markdown_report(report), encoding="utf-8")
    print(
        json.dumps(
            {
                "code": "PPTX_EXPORT_ACCURACY_SCORED",
                "mode": gate["mode"],
                "metrics": metric_summary,
                "semanticPassedCount": sum(1 for row in assertions if row["passed"]),
                "semanticFailedCount": sum(
                    1 for row in assertions if not row["passed"]
                ),
                "diagnosticSummary": report["diagnosticSummary"],
                "determinismChecksum": determinism_checksum,
                "gatePassed": gate["passed"],
                "infrastructureFailures": infrastructure_failures,
                "reportPath": report_json.relative_to(ROOT).as_posix(),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    if infrastructure_failures or not gate["passed"]:
        raise SystemExit(2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Score deterministic Deck-to-PPTX render fidelity."
    )
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument(
        "--baseline",
        type=Path,
        help=(
            "Approved baseline JSON. Defaults to the repository baseline; "
            "use --report-only explicitly to collect an ungated snapshot."
        ),
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Collect an explicit ungated report instead of applying a baseline.",
    )
    parser.add_argument("--max-average-ssim-drop", type=float, default=0.0)
    parser.add_argument("--max-slide-ssim-drop", type=float, default=0.0)
    parser.add_argument("--max-slide-mae-increase", type=float, default=0.0)
    args = parser.parse_args()
    if args.report_only and args.baseline is not None:
        parser.error("--report-only and --baseline are mutually exclusive")
    return args


def score_row(row: Mapping[str, Any]) -> dict[str, Any]:
    from PIL import Image, ImageChops, ImageStat
    from app.ai.pptx_quality import image_ssim

    reference_path = ROOT / str(row["libreOfficePath"])
    candidate_path = ROOT / str(row["candidatePath"])
    result = {
        "name": row["name"],
        "slideId": row["slideId"],
        "status": "evaluated",
        "ssim": None,
        "colorMae": None,
        "dimensions": None,
    }
    if not reference_path.exists() or not candidate_path.exists():
        result["status"] = "missing"
        return result

    with Image.open(reference_path) as reference_image, Image.open(
        candidate_path
    ) as candidate_image:
        reference_rgb = reference_image.convert("RGB")
        candidate_rgb = candidate_image.convert("RGB")
        result["dimensions"] = {
            "libreOffice": list(reference_rgb.size),
            "browser": list(candidate_rgb.size),
        }
        if reference_rgb.size != candidate_rgb.size:
            result["status"] = "dimension-mismatch"
            return result
        difference = ImageChops.difference(reference_rgb, candidate_rgb)
        channel_means = ImageStat.Stat(difference).mean
        result["colorMae"] = round(sum(channel_means) / (3 * 255), 6)

    result["ssim"] = round(
        image_ssim(reference_path.read_bytes(), candidate_path.read_bytes()), 6
    )
    return result


def summarize_metrics(
    evaluated: list[dict[str, Any]], total_count: int, missing_count: int
) -> dict[str, Any]:
    ssim_values = [float(row["ssim"]) for row in evaluated]
    mae_values = [float(row["colorMae"]) for row in evaluated]
    return {
        "evaluatedCount": len(evaluated),
        "missingCount": missing_count,
        "totalCount": total_count,
        "averageSsim": rounded_mean(ssim_values),
        "minimumSsim": round(min(ssim_values), 6) if ssim_values else None,
        "p50Ssim": round(statistics.median(ssim_values), 6)
        if ssim_values
        else None,
        "averageColorMae": rounded_mean(mae_values),
        "maximumColorMae": round(max(mae_values), 6) if mae_values else None,
    }


def rounded_mean(values: list[float]) -> float | None:
    return round(statistics.fmean(values), 6) if values else None


def load_approved_baseline(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(
            "approved PPTX export accuracy baseline is missing: "
            f"{path}. Use --report-only explicitly to collect a candidate snapshot."
        )
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("kind") != BASELINE_KIND
        or payload.get("schemaVersion") != BASELINE_SCHEMA_VERSION
    ):
        raise ValueError(
            "approved PPTX export accuracy baseline has an unsupported contract: "
            f"{path}"
        )
    required = {
        "approval",
        "browserCapture",
        "diagnosticSummary",
        "exporterSourceSha256",
        "exporterWarningReconciliation",
        "fixtureSha256",
        "fontFiles",
        "metrics",
        "rows",
        "semanticAssertions",
        "toolVersions",
    }
    missing = sorted(required - payload.keys())
    if missing:
        raise ValueError(
            "approved PPTX export accuracy baseline is incomplete: "
            + ", ".join(missing)
        )
    approval = payload.get("approval")
    if (
        not isinstance(approval, Mapping)
        or approval.get("method") != "two-run-deterministic-report-review"
        or not isinstance(approval.get("runCount"), int)
        or approval["runCount"] < 2
        or not is_sha256(approval.get("artifactAggregateSha256"))
        or not is_sha256(approval.get("determinismChecksum"))
    ):
        raise ValueError(
            "approved PPTX export accuracy baseline has invalid approval evidence"
        )
    if not is_sha256(payload.get("exporterSourceSha256")):
        raise ValueError(
            "approved PPTX export accuracy baseline has invalid exporter source provenance"
        )
    if "exporterSourceSha256" in payload.get("toolVersions", {}):
        raise ValueError(
            "exporterSourceSha256 must be recorded outside the baseline "
            "environment toolVersions contract"
        )
    return payload


def is_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def browser_capture_matches_manifest(manifest: Mapping[str, Any]) -> bool:
    render = manifest.get("render")
    capture = manifest.get("browserCapture")
    if not isinstance(render, Mapping) or not isinstance(capture, Mapping):
        return False
    browser_version = capture.get("browserVersion")
    return (
        isinstance(browser_version, str)
        and bool(browser_version.strip())
        and capture.get("deviceScaleFactor") == render.get("deviceScaleFactor")
        and capture.get("locale") == render.get("locale")
        and capture.get("timezoneId") == render.get("timezoneId")
        and capture.get("viewport") == render.get("viewport")
    )


def baseline_gate(
    current: Mapping[str, Any],
    baseline: Mapping[str, Any] | None,
    *,
    max_average_ssim_drop: float,
    max_slide_ssim_drop: float,
    max_slide_mae_increase: float,
) -> dict[str, Any]:
    if baseline is None:
        return {"mode": "report-only", "passed": True, "checks": []}

    checks: list[dict[str, Any]] = []
    append_equality_check(
        checks,
        "BASELINE_FIXTURE_HASH_MATCH",
        baseline.get("fixtureSha256"),
        current.get("fixtureSha256"),
    )
    append_equality_check(
        checks,
        "BASELINE_FONT_HASH_MATCH",
        baseline.get("fontFiles"),
        current.get("fontFiles"),
    )
    append_equality_check(
        checks,
        "BASELINE_TOOL_VERSION_MATCH",
        baseline.get("toolVersions"),
        current.get("toolVersions"),
    )
    append_equality_check(
        checks,
        "BASELINE_BROWSER_CAPTURE_MATCH",
        baseline.get("browserCapture"),
        current.get("browserCapture"),
    )
    append_reconciliation_health_check(
        checks, current.get("exporterWarningReconciliation")
    )

    baseline_row_list = baseline.get("rows", [])
    current_row_list = current.get("rows", [])
    append_key_set_check(
        checks,
        "BASELINE_SLIDE_SET_MATCH",
        baseline_row_list,
        current_row_list,
        "name",
    )
    baseline_semantic_list = baseline.get("semanticAssertions", [])
    current_semantic_list = current.get("semanticAssertions", [])
    append_key_set_check(
        checks,
        "BASELINE_SEMANTIC_CODE_SET_MATCH",
        baseline_semantic_list,
        current_semantic_list,
        "code",
    )

    baseline_average = baseline.get("metrics", {}).get("averageSsim")
    current_average = current.get("metrics", {}).get("averageSsim")
    average_passed = (
        baseline_average is not None
        and current_average is not None
        and float(current_average)
        >= float(baseline_average) - max_average_ssim_drop
    )
    checks.append(
        {
            "code": "BASELINE_AVERAGE_SSIM",
            "passed": average_passed,
            "baseline": baseline_average,
            "actual": current_average,
            "allowedDrop": max_average_ssim_drop,
        }
    )

    baseline_rows = {row["name"]: row for row in baseline_row_list}
    for current_row in current_row_list:
        baseline_row = baseline_rows.get(current_row["name"])
        ssim_passed = (
            baseline_row is not None
            and baseline_row.get("ssim") is not None
            and current_row.get("ssim") is not None
            and float(current_row["ssim"])
            >= float(baseline_row["ssim"]) - max_slide_ssim_drop
        )
        mae_passed = (
            baseline_row is not None
            and baseline_row.get("colorMae") is not None
            and current_row.get("colorMae") is not None
            and float(current_row["colorMae"])
            <= float(baseline_row["colorMae"]) + max_slide_mae_increase
        )
        checks.extend(
            [
                {
                    "code": "BASELINE_SLIDE_ID_MATCH",
                    "fixture": current_row["name"],
                    "passed": (
                        baseline_row is not None
                        and baseline_row.get("slideId") == current_row.get("slideId")
                    ),
                    "baseline": baseline_row.get("slideId")
                    if baseline_row
                    else None,
                    "actual": current_row.get("slideId"),
                },
                {
                    "code": "BASELINE_SLIDE_SSIM",
                    "fixture": current_row["name"],
                    "passed": ssim_passed,
                    "baseline": baseline_row.get("ssim") if baseline_row else None,
                    "actual": current_row.get("ssim"),
                    "allowedDrop": max_slide_ssim_drop,
                },
                {
                    "code": "BASELINE_SLIDE_COLOR_MAE",
                    "fixture": current_row["name"],
                    "passed": mae_passed,
                    "baseline": baseline_row.get("colorMae")
                    if baseline_row
                    else None,
                    "actual": current_row.get("colorMae"),
                    "allowedIncrease": max_slide_mae_increase,
                },
            ]
        )

    baseline_semantics = {row["code"]: row for row in baseline_semantic_list}
    for current_assertion in current_semantic_list:
        baseline_assertion = baseline_semantics.get(current_assertion["code"])
        passed = semantic_count_is_non_regressing(
            baseline_assertion, current_assertion
        )
        checks.append(
            {
                "code": "BASELINE_SEMANTIC_ASSERTION",
                "assertion": current_assertion["code"],
                "passed": passed,
                "baseline": baseline_assertion,
                "actual": current_assertion,
            }
        )

    for dimension in ("byCode", "byDisposition", "byElementType"):
        append_diagnostic_non_regression_checks(
            checks,
            baseline.get("diagnosticSummary"),
            current.get("diagnosticSummary"),
            dimension,
        )
    return {
        "mode": "baseline-delta",
        "passed": all(check["passed"] for check in checks),
        "checks": checks,
    }


def append_equality_check(
    checks: list[dict[str, Any]], code: str, expected: Any, actual: Any
) -> None:
    checks.append(
        {
            "code": code,
            "passed": expected == actual,
            "baseline": expected,
            "actual": actual,
        }
    )


def append_reconciliation_health_check(
    checks: list[dict[str, Any]], reconciliation: Any
) -> None:
    expected_codes = string_set(reconciliation, "expectedCodes")
    observed_codes = string_set(reconciliation, "observedCodes")
    missing_codes = string_set(reconciliation, "missingCodes")
    unexpected_codes = string_set(reconciliation, "unexpectedCodes")
    actual_count = nonnegative_integer(
        reconciliation.get("actualCount") if isinstance(reconciliation, Mapping) else None
    )
    mapped_count = nonnegative_integer(
        reconciliation.get("mappedCount") if isinstance(reconciliation, Mapping) else None
    )
    unmapped_count = nonnegative_integer(
        reconciliation.get("unmappedCount")
        if isinstance(reconciliation, Mapping)
        else None
    )
    passed = (
        isinstance(reconciliation, Mapping)
        and reconciliation.get("matched") is True
        and expected_codes is not None
        and observed_codes is not None
        and expected_codes == observed_codes
        and missing_codes == set()
        and unexpected_codes == set()
        and actual_count is not None
        and mapped_count is not None
        and unmapped_count == 0
        and actual_count == mapped_count == len(observed_codes)
    )
    checks.append(
        {
            "code": "BASELINE_EXPORTER_WARNING_RECONCILIATION_HEALTH",
            "passed": passed,
            "actual": reconciliation,
        }
    )


def string_set(payload: Any, key: str) -> set[str] | None:
    if not isinstance(payload, Mapping):
        return None
    values = payload.get(key)
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        return None
    if len(values) != len(set(values)):
        return None
    return set(values)


def nonnegative_integer(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def semantic_count_is_non_regressing(
    baseline_assertion: Any, current_assertion: Any
) -> bool:
    if not isinstance(baseline_assertion, Mapping) or not isinstance(
        current_assertion, Mapping
    ):
        return False
    expected = nonnegative_integer(current_assertion.get("expected"))
    baseline_expected = nonnegative_integer(baseline_assertion.get("expected"))
    baseline_actual = nonnegative_integer(baseline_assertion.get("actual"))
    current_actual = nonnegative_integer(current_assertion.get("actual"))
    if (
        expected is None
        or baseline_expected is None
        or baseline_actual is None
        or current_actual is None
    ):
        return False
    if baseline_expected != expected:
        return False
    lower_bound = min(baseline_actual, expected)
    upper_bound = max(baseline_actual, expected)
    return (
        lower_bound <= current_actual <= upper_bound
        and baseline_assertion.get("passed") is (baseline_actual == expected)
        and current_assertion.get("passed") is (current_actual == expected)
    )


def append_diagnostic_non_regression_checks(
    checks: list[dict[str, Any]],
    baseline_summary: Any,
    current_summary: Any,
    dimension: str,
) -> None:
    baseline_counts = diagnostic_counts(baseline_summary, dimension)
    current_counts = diagnostic_counts(current_summary, dimension)
    if baseline_counts is None or current_counts is None:
        checks.append(
            {
                "code": "BASELINE_DIAGNOSTIC_COUNT_CONTRACT",
                "dimension": dimension,
                "passed": False,
                "baseline": baseline_summary,
                "actual": current_summary,
            }
        )
        return
    for key in sorted(set(baseline_counts) | set(current_counts)):
        baseline_count = baseline_counts.get(key, 0)
        current_count = current_counts.get(key, 0)
        is_new_key = key in current_counts and key not in baseline_counts
        checks.append(
            {
                "code": "BASELINE_DIAGNOSTIC_COUNT",
                "dimension": dimension,
                "key": key,
                "passed": not is_new_key and current_count <= baseline_count,
                "baseline": baseline_count,
                "actual": current_count,
                "isNewKey": is_new_key,
            }
        )


def diagnostic_counts(summary: Any, dimension: str) -> dict[str, int] | None:
    if not isinstance(summary, Mapping):
        return None
    raw_counts = summary.get(dimension)
    if not isinstance(raw_counts, Mapping):
        return None
    counts: dict[str, int] = {}
    for key, value in raw_counts.items():
        count = nonnegative_integer(value)
        if not isinstance(key, str) or count is None:
            return None
        counts[key] = count
    return counts


def append_key_set_check(
    checks: list[dict[str, Any]],
    code: str,
    baseline_rows: Any,
    current_rows: Any,
    key: str,
) -> None:
    baseline_keys = [str(row.get(key)) for row in baseline_rows]
    current_keys = [str(row.get(key)) for row in current_rows]
    baseline_set = sorted(set(baseline_keys))
    current_set = sorted(set(current_keys))
    checks.append(
        {
            "code": code,
            "passed": (
                len(baseline_keys) == len(baseline_set)
                and len(current_keys) == len(current_set)
                and baseline_set == current_set
            ),
            "baseline": baseline_set,
            "actual": current_set,
        }
    )


def markdown_report(report: Mapping[str, Any]) -> str:
    metrics = report["metrics"]
    semantic_failed = sum(
        1 for assertion in report["semanticAssertions"] if not assertion["passed"]
    )
    lines = [
        "# Deck → PPTX export accuracy report",
        "",
        f"- Mode: `{report['mode']}`",
        f"- Fixture SHA-256: `{report['fixtureSha256']}`",
        f"- Determinism checksum: `{report['determinismChecksum']}`",
        "- Evaluated / missing: "
        f"{metrics['evaluatedCount']} / {metrics['missingCount']}",
        f"- Average / minimum / p50 SSIM: {format_metric(metrics['averageSsim'])} / "
        f"{format_metric(metrics['minimumSsim'])} / "
        f"{format_metric(metrics['p50Ssim'])}",
        f"- Average / maximum color MAE: {format_metric(metrics['averageColorMae'])} / "
        f"{format_metric(metrics['maximumColorMae'])}",
        f"- Semantic assertion failures: {semantic_failed}",
        f"- Gate passed: {report['gate']['passed']}",
        "",
        "| fixture | SSIM | color MAE | status | dimensions |",
        "|---|---:|---:|---|---|",
    ]
    for row in report["rows"]:
        dimensions = row["dimensions"] or {}
        lines.append(
            f"| {row['name']} | {format_metric(row['ssim'])} | "
            f"{format_metric(row['colorMae'])} | {row['status']} | "
            f"{json.dumps(dimensions, separators=(',', ':'))} |"
        )
    lines.extend(
        [
            "",
            "| semantic assertion | expected | actual | passed |",
            "|---|---:|---:|---|",
        ]
    )
    for assertion in report["semanticAssertions"]:
        lines.append(
            f"| {assertion['code']} | {assertion['expected']} | "
            f"{assertion['actual']} | {assertion['passed']} |"
        )
    return "\n".join(lines) + "\n"


def format_metric(value: Any) -> str:
    return "missing" if value is None else f"{float(value):.6f}"


def resolve_repo_path(path: Path) -> Path:
    return (path if path.is_absolute() else ROOT / path).resolve()


if __name__ == "__main__":
    main()
