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
    rows = [score_row(row, threshold) for row in manifest["rows"]]
    report = {
        "sampleCount": len(rows),
        "threshold": threshold,
        "averageKonvaSsim": round(
            sum(row["konvaSsim"] or 0 for row in rows) / max(1, len(rows)),
            4,
        ),
        "passedCount": sum(1 for row in rows if row["passed"]),
        "failedCount": sum(1 for row in rows if not row["passed"]),
        "rows": rows,
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    REPORT_MD.write_text(markdown_report(report), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def score_row(row: dict[str, Any], threshold: float) -> dict[str, Any]:
    golden_path = ROOT / row["goldenPath"]
    candidate_path = ROOT / row["candidatePath"]
    reasons = list(row.get("warnings", []))
    ssim: float | None = None
    if not candidate_path.exists():
        reasons.append("candidate image missing")
    else:
        ssim = image_ssim(golden_path.read_bytes(), candidate_path.read_bytes())
        if ssim < threshold:
            reasons.append(f"SSIM {ssim:.4f} is below {threshold:.2f}")
    if row.get("fullSlideFallbackUsed"):
        reasons.append("full-slide background fallback used")
    unresolved_assets = row.get("unresolvedAssets", [])
    if unresolved_assets:
        reasons.append(f"unresolved assets: {', '.join(unresolved_assets)}")
    passed = (
        ssim is not None
        and ssim >= threshold
        and not row.get("fullSlideFallbackUsed")
        and not unresolved_assets
    )
    return {
        "name": row["name"],
        "konvaSsim": ssim,
        "passed": passed,
        "status": "passed" if passed else "vectorization_failed",
        "fallbackObjects": row.get("fallbackObjects", 0),
        "fullSlideFallbackUsed": bool(row.get("fullSlideFallbackUsed")),
        "unresolvedAssets": unresolved_assets,
        "elementCounts": row.get("elementCounts", {}),
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
        f"- Average Konva SSIM: {report['averageKonvaSsim']:.4f}",
        f"- Passed: {report['passedCount']}",
        f"- Failed: {report['failedCount']}",
        "",
        "| sample | SSIM | status | fallback objects | full-slide fallback | reasons |",
        "|---|---:|---|---:|---:|---|",
    ]
    for row in report["rows"]:
        ssim = "missing" if row["konvaSsim"] is None else f"{row['konvaSsim']:.4f}"
        reasons = "<br>".join(row["reasons"]) if row["reasons"] else ""
        lines.append(
            f"| {row['name']} | {ssim} | {row['status']} | "
            f"{row['fallbackObjects']} | {row['fullSlideFallbackUsed']} | {reasons} |"
        )
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
