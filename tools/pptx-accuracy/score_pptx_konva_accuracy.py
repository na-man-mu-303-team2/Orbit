from __future__ import annotations

# ruff: noqa: E402

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "services" / "python-worker"
sys.path.insert(0, str(WORKER))

from app.ai.pptx_quality import image_ssim

MANIFEST = ROOT / "tmp" / "pptx-konva-accuracy" / "run" / "manifest.json"
REPORT_JSON = ROOT / "tmp" / "pptx-konva-accuracy" / "run" / "konva-accuracy-report.json"
REPORT_MD = ROOT / "tmp" / "pptx-konva-accuracy" / "run" / "konva-accuracy-report.md"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    threshold = float(manifest.get("threshold", 0.95))
    fallback_threshold = float(manifest.get("fallbackThreshold", 0.80))
    rows = [
        score_row(row, threshold, fallback_threshold)
        for row in manifest["rows"]
    ]
    report = {
        "sampleCount": len(rows),
        "threshold": threshold,
        "fallbackThreshold": fallback_threshold,
        "averageKonvaSsim": round(
            sum(row["konvaSsim"] or 0 for row in rows) / max(1, len(rows)),
            4,
        ),
        "passedCount": sum(1 for row in rows if row["gatePassed"]),
        "failedCount": sum(1 for row in rows if not row["gatePassed"]),
        "pixelPassedCount": sum(1 for row in rows if row["pixelPassed"]),
        "pixelFailedCount": sum(1 for row in rows if not row["pixelPassed"]),
        "fallbackRequiredCount": sum(
            1 for row in rows if row["status"] == "fallback_required"
        ),
        "rows": rows,
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_MD.write_text(markdown_report(report), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def score_row(
    row: dict[str, Any],
    threshold: float,
    fallback_threshold: float = 0.80,
) -> dict[str, Any]:
    golden_path = ROOT / row["goldenPath"]
    candidate_path = ROOT / row["candidatePath"]
    reasons = [
        *row.get("warnings", []),
        *row.get("modeReasons", []),
    ]
    import_preference = row.get("importPreference")
    expected_render_mode = row.get("expectedRenderMode")
    selected_render_mode = row.get("selectedRenderMode", expected_render_mode)
    recommended_render_mode = row.get(
        "recommendedRenderMode",
        selected_render_mode,
    )
    source_snapshot_expected = (
        import_preference == "appearance-first"
        and expected_render_mode == "snapshot"
    )
    required_ssim = 0.99 if source_snapshot_expected else threshold
    ssim: float | None = None
    if not candidate_path.exists():
        reasons.append("candidate image missing")
    else:
        ssim = image_ssim(golden_path.read_bytes(), candidate_path.read_bytes())
        if ssim < required_ssim:
            reasons.append(f"SSIM {ssim:.4f} is below {required_ssim:.2f}")
    explicit_editability_snapshot = (
        import_preference == "editability-first"
        and selected_render_mode == "snapshot"
    )
    if (
        row.get("fullSlideFallbackUsed")
        and not source_snapshot_expected
        and not explicit_editability_snapshot
    ):
        reasons.append("full-slide background fallback used")
    unresolved_assets = row.get("unresolvedAssets", [])
    if unresolved_assets:
        reasons.append(f"unresolved assets: {', '.join(unresolved_assets)}")
    pixel_passed = ssim is not None and ssim >= required_ssim
    hard_failure = bool(unresolved_assets) or (
        bool(row.get("fullSlideFallbackUsed"))
        and not source_snapshot_expected
        and not explicit_editability_snapshot
    )
    fallback_required = False
    if (
        not pixel_passed
        and not hard_failure
        and ssim is not None
        and import_preference == "editability-first"
    ):
        recommended_render_mode = (
            "hybrid" if selected_render_mode == "hybrid" else "snapshot"
        )
        if ssim >= fallback_threshold:
            fallback_required = True
            reasons.append(
                "PPTX_ACCURACY_HYBRID_REQUIRED_PIXEL_BELOW_THRESHOLD"
                if recommended_render_mode == "hybrid"
                else "PPTX_ACCURACY_SNAPSHOT_RECOMMENDED_PIXEL_BELOW_THRESHOLD"
            )
        else:
            reasons.append(
                f"SSIM {ssim:.4f} is below fallback floor {fallback_threshold:.2f}"
            )
    gate_passed = (
        ssim is not None
        and not hard_failure
        and (pixel_passed or fallback_required)
    )
    status = (
        "passed"
        if pixel_passed and gate_passed
        else "fallback_required"
        if fallback_required and gate_passed
        else "vectorization_failed"
    )
    return {
        "name": row["name"],
        "konvaSsim": ssim,
        "passed": gate_passed,
        "gatePassed": gate_passed,
        "pixelPassed": pixel_passed,
        "status": status,
        "fallbackObjects": row.get("fallbackObjects", 0),
        "fullSlideFallbackUsed": bool(row.get("fullSlideFallbackUsed")),
        "unresolvedAssets": unresolved_assets,
        "elementCounts": row.get("elementCounts", {}),
        "importPreference": import_preference,
        "expectedRenderMode": expected_render_mode,
        "selectedRenderMode": selected_render_mode,
        "recommendedRenderMode": recommended_render_mode,
        "requiredSsim": required_ssim,
        "fallbackThreshold": fallback_threshold,
        "reasons": reasons,
        "goldenPath": row["goldenPath"],
        "candidatePath": row["candidatePath"],
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# PPTX Konva Accuracy Report",
        "",
        f"- Samples: {report['sampleCount']}",
        f"- Threshold: {report['threshold']:.2f}",
        f"- Fallback floor: {report['fallbackThreshold']:.2f}",
        f"- Average Konva SSIM: {report['averageKonvaSsim']:.4f}",
        f"- Gate passed: {report['passedCount']}",
        f"- Gate failed: {report['failedCount']}",
        f"- Pixel passed: {report['pixelPassedCount']}",
        f"- Pixel failed: {report['pixelFailedCount']}",
        f"- Fallback required: {report['fallbackRequiredCount']}",
        "",
        "| sample | SSIM | status | selected | recommended | fallback objects | full-slide fallback | reasons |",
        "|---|---:|---|---|---|---:|---:|---|",
    ]
    for row in report["rows"]:
        ssim = "missing" if row["konvaSsim"] is None else f"{row['konvaSsim']:.4f}"
        reasons = "<br>".join(row["reasons"]) if row["reasons"] else ""
        lines.append(
            f"| {row['name']} | {ssim} | {row['status']} | "
            f"{row['selectedRenderMode']} | {row['recommendedRenderMode']} | "
            f"{row['fallbackObjects']} | {row['fullSlideFallbackUsed']} | {reasons} |"
        )
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
