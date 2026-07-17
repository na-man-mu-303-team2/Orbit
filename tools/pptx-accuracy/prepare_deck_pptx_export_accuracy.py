from __future__ import annotations

# ruff: noqa: E402

import argparse
import base64
import importlib.metadata
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "services" / "python-worker"
DEFAULT_FIXTURE = (
    ROOT / "tools" / "pptx-accuracy" / "fixtures" / "export-fidelity-deck.json"
)
DEFAULT_RUN_DIR = ROOT / "tmp" / "pptx-export-accuracy" / "run"
EXPORTER_SOURCE = WORKER / "app" / "ai" / "deck_pptx_export.py"

sys.path.insert(0, str(WORKER))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from export_diagnostics import (
    ExportDiagnostic,
    diagnostics_for_deck,
    ensure_tmp_output_path,
    sha256_file,
    summarize_diagnostics,
    warning_reconciliation,
)


class AccuracyPreflightError(RuntimeError):
    pass


def main() -> None:
    args = parse_args()
    fixture_path = resolve_repo_path(args.fixture)
    preflight = build_preflight(fixture_path)
    if args.preflight:
        print(json.dumps(preflight, ensure_ascii=False, indent=2, sort_keys=True))
        return
    if not preflight["ready"]:
        raise AccuracyPreflightError(
            "PPTX export accuracy prerequisites are unavailable: "
            + ", ".join(preflight["missing"])
            + ". Run with --preflight for structured details."
        )

    run_dir = ensure_tmp_output_path(ROOT, args.run_dir)
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    deck = fixture["deck"]
    expectations = fixture.get("semanticExpectations", {})

    directories = create_output_directories(run_dir)
    pptx_path, exporter_warnings = export_deck(deck, directories["export"])
    pdf_path, libreoffice_version = render_pdf(
        pptx_path,
        directories["libreoffice"],
        directories["profile"],
        str(preflight["commands"]["libreoffice"]),
    )
    libreoffice_images = render_pdf_slides(
        pdf_path,
        directories["libreoffice"],
        int(deck["canvas"]["width"]),
        int(deck["canvas"]["height"]),
    )
    if len(libreoffice_images) != len(deck["slides"]):
        raise RuntimeError(
            "LibreOffice page count does not match Deck slide count: "
            f"{len(libreoffice_images)} != {len(deck['slides'])}"
        )

    diagnostics = diagnostics_for_deck(deck)
    observed_warning_codes = probe_exporter_warning_codes(deck, diagnostics)
    payload_rows = write_browser_payloads(
        deck,
        libreoffice_images,
        directories["payloads"],
        directories["browser"],
    )
    manifest = {
        "schemaVersion": 2,
        "kind": "deck-pptx-export",
        "route": "/__deck-render",
        "fixturePath": relative_to_root(fixture_path),
        "fixtureSha256": sha256_file(fixture_path),
        "exporterSourceSha256": sha256_file(EXPORTER_SOURCE),
        "pptxPath": relative_to_root(pptx_path),
        "pdfPath": relative_to_root(pdf_path),
        "rows": payload_rows,
        "render": {
            "viewport": {
                "width": int(deck["canvas"]["width"]),
                "height": int(deck["canvas"]["height"]),
            },
            "deviceScaleFactor": 1,
            "locale": "ko-KR",
            "timezoneId": "UTC",
            "waitPolicy": "document.fonts.ready+all-images+2-requestAnimationFrame",
        },
        "fontFiles": font_manifest(str(deck["theme"]["fontFamily"])),
        "toolVersions": {
            "harnessSchema": "2",
            "python": sys.version.split()[0],
            "pillow": package_version("Pillow"),
            "pythonPptx": package_version("python-pptx"),
            "pyMuPDF": package_version("PyMuPDF"),
            "libreOffice": libreoffice_version,
        },
        "diagnostics": [row.to_dict() for row in diagnostics],
        "diagnosticSummary": summarize_diagnostics(diagnostics),
        "exporterWarningReconciliation": warning_reconciliation(
            diagnostics,
            observed_warning_codes,
            len(exporter_warnings),
        ),
        "semanticExpectations": expectations,
    }
    manifest_path = run_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "code": "PPTX_EXPORT_ACCURACY_PREPARED",
                "manifestPath": relative_to_root(manifest_path),
                "slideCount": len(payload_rows),
                "diagnosticSummary": manifest["diagnosticSummary"],
                "exporterWarningReconciliation": manifest[
                    "exporterWarningReconciliation"
                ],
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare deterministic Deck-to-PPTX accuracy artifacts."
    )
    parser.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    parser.add_argument("--run-dir", type=Path, default=DEFAULT_RUN_DIR)
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Print structured prerequisite status without creating artifacts.",
    )
    return parser.parse_args()


def build_preflight(fixture_path: Path = DEFAULT_FIXTURE) -> dict[str, Any]:
    commands = {
        "libreoffice": find_executable(
            os.environ.get("LIBREOFFICE_BIN"), ("libreoffice", "soffice")
        ),
        "fcMatch": find_executable(os.environ.get("FC_MATCH_BIN"), ("fc-match",)),
    }
    python_modules = {
        "Pillow": "PIL",
        "PyMuPDF": "fitz",
        "python-pptx": "pptx",
        "worker-exporter": "app.ai.deck_pptx_export",
    }
    missing = [
        f"python:{name}"
        for name, module in python_modules.items()
        if importlib.util.find_spec(module) is None
    ]
    if commands["libreoffice"] is None:
        missing.append("command:libreoffice-or-soffice")
    if commands["fcMatch"] is None:
        missing.append("command:fc-match")
    if not browser_font_path().exists():
        missing.append("font:browser-pretendard")
    fixture_path = fixture_path.resolve()
    if not fixture_path.exists():
        try:
            fixture_label = fixture_path.relative_to(ROOT).as_posix()
        except ValueError:
            fixture_label = str(fixture_path)
        missing.append(f"fixture:{fixture_label}")
    return {
        "code": "PPTX_EXPORT_ACCURACY_PREFLIGHT",
        "ready": not missing,
        "missing": sorted(missing),
        "commands": commands,
        "fixture": str(fixture_path),
        "outputRoot": "tmp/pptx-export-accuracy",
    }


def find_executable(explicit: str | None, candidates: tuple[str, ...]) -> str | None:
    if explicit:
        explicit_path = Path(explicit).expanduser()
        if explicit_path.is_file() and os.access(explicit_path, os.X_OK):
            return str(explicit_path.resolve())
        return None
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    return None


def create_output_directories(run_dir: Path) -> dict[str, Path]:
    directories = {
        "run": run_dir,
        "export": run_dir / "export",
        "libreoffice": run_dir / "libreoffice",
        "profile": run_dir / "libreoffice-profile",
        "payloads": run_dir / "payloads",
        "browser": run_dir / "browser",
    }
    for path in directories.values():
        path.mkdir(parents=True, exist_ok=True)
    return directories


def export_deck(deck: dict[str, Any], output_dir: Path) -> tuple[Path, list[str]]:
    from app.ai.deck_pptx_export import DeckPptxExportRequest, export_deck_pptx

    response = export_deck_pptx(DeckPptxExportRequest(deck=deck))
    pptx_path = output_dir / "export-fidelity-deck.pptx"
    pptx_path.write_bytes(base64.b64decode(response.content_base64))
    if not pptx_path.read_bytes().startswith(b"PK"):
        raise RuntimeError("Exporter output is not an OOXML ZIP package.")
    return pptx_path, list(response.warnings)


def probe_exporter_warning_codes(
    deck: dict[str, Any], diagnostics: list[ExportDiagnostic]
) -> list[str]:
    from app.ai.deck_pptx_export import DeckPptxExportRequest, export_deck_pptx

    diagnostics_by_code: dict[str, ExportDiagnostic] = {}
    for diagnostic in diagnostics:
        if diagnostic.reported_by_exporter:
            diagnostics_by_code.setdefault(diagnostic.code, diagnostic)

    slides_by_id = {
        str(slide.get("slideId")): slide for slide in deck.get("slides", [])
    }
    observed_codes: list[str] = []
    for code, diagnostic in sorted(diagnostics_by_code.items()):
        slide = slides_by_id.get(diagnostic.slide_id)
        if slide is None:
            continue
        element = next(
            (
                candidate
                for candidate in slide.get("elements", [])
                if str(candidate.get("elementId")) == diagnostic.element_id
            ),
            None,
        )
        if element is None:
            continue
        probe_deck = {
            "canvas": deck["canvas"],
            "theme": deck.get("theme", {}),
            "slides": [
                {
                    "slideId": diagnostic.slide_id,
                    "order": 1,
                    "style": slide.get("style", {}),
                    "speakerNotes": "",
                    "elements": [element],
                }
            ],
        }
        response = export_deck_pptx(DeckPptxExportRequest(deck=probe_deck))
        if response.warnings:
            observed_codes.append(code)

    return observed_codes


def render_pdf(
    pptx_path: Path,
    output_dir: Path,
    profile_dir: Path,
    libreoffice: str,
) -> tuple[Path, str]:
    version = command_version([libreoffice, "--version"])
    command = [
        libreoffice,
        "--headless",
        "--nologo",
        "--nodefault",
        "--nolockcheck",
        "--nofirststartwizard",
        f"-env:UserInstallation={profile_dir.resolve().as_uri()}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(output_dir),
        str(pptx_path),
    ]
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if completed.returncode != 0:
        details = (completed.stderr or completed.stdout).strip()
        raise RuntimeError(
            f"LibreOffice conversion failed with exit {completed.returncode}: {details}"
        )
    pdf_path = output_dir / f"{pptx_path.stem}.pdf"
    if not pdf_path.exists():
        raise RuntimeError("LibreOffice did not create the expected PDF.")
    return pdf_path, version


def render_pdf_slides(
    pdf_path: Path,
    output_dir: Path,
    expected_width: int,
    expected_height: int,
) -> list[Path]:
    import fitz

    fitz.TOOLS.mupdf_display_errors(False)
    fitz.TOOLS.mupdf_display_warnings(False)

    images: list[Path] = []
    with fitz.open(pdf_path) as document:
        for index, page in enumerate(document, start=1):
            zoom_x = expected_width / float(page.rect.width)
            zoom_y = expected_height / float(page.rect.height)
            if abs(zoom_x - zoom_y) > 0.0001:
                raise RuntimeError(
                    "PDF aspect ratio does not match Deck canvas; refusing to resize."
                )
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom_x, zoom_y), alpha=False)
            if (pixmap.width, pixmap.height) != (expected_width, expected_height):
                raise RuntimeError(
                    "LibreOffice render dimensions do not match Deck canvas: "
                    f"{pixmap.width}x{pixmap.height} != "
                    f"{expected_width}x{expected_height}"
                )
            image_path = output_dir / f"slide-{index:03d}.png"
            pixmap.save(image_path)
            images.append(image_path)
    return images


def write_browser_payloads(
    deck: dict[str, Any],
    libreoffice_images: list[Path],
    payload_dir: Path,
    browser_dir: Path,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, (slide, libreoffice_image) in enumerate(
        zip(deck["slides"], libreoffice_images, strict=True)
    ):
        name = f"slide-{index + 1:03d}-{slide['slideId']}"
        payload_path = payload_dir / f"{name}.json"
        browser_path = browser_dir / f"{name}.png"
        payload_path.write_text(
            json.dumps(
                {"deck": deck, "slideIndex": index},
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        rows.append(
            {
                "name": name,
                "slideId": slide["slideId"],
                "payloadPath": relative_to_root(payload_path),
                "libreOfficePath": relative_to_root(libreoffice_image),
                "candidatePath": relative_to_root(browser_path),
            }
        )
    return rows


def font_manifest(font_family: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    browser_font = browser_font_path()
    if browser_font.exists():
        rows.append(font_row("browser-package", font_family, browser_font))

    fc_match = find_executable(os.environ.get("FC_MATCH_BIN"), ("fc-match",))
    if fc_match:
        completed = subprocess.run(
            [fc_match, "-f", "%{file}\n", font_family],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        matched = next(
            (
                Path(line.strip())
                for line in completed.stdout.splitlines()
                if line.strip() and Path(line.strip()).is_file()
            ),
            None,
        )
        if matched:
            rows.append(font_row("libreoffice-resolved", font_family, matched))
    return rows


def font_row(role: str, family: str, path: Path) -> dict[str, Any]:
    return {
        "role": role,
        "family": family,
        "fileName": path.name,
        "sha256": sha256_file(path),
    }


def browser_font_path() -> Path:
    return (
        ROOT
        / "apps"
        / "web"
        / "node_modules"
        / "pretendard"
        / "dist"
        / "web"
        / "variable"
        / "woff2"
        / "PretendardVariable.woff2"
    )


def package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "unavailable"


def command_version(command: list[str]) -> str:
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=15,
    )
    output = (completed.stdout or completed.stderr).strip()
    return output.splitlines()[0] if output else "unavailable"


def relative_to_root(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def resolve_repo_path(path: Path) -> Path:
    return (path if path.is_absolute() else ROOT / path).resolve()


if __name__ == "__main__":
    try:
        main()
    except AccuracyPreflightError as error:
        print(
            json.dumps(
                {
                    "code": "PPTX_EXPORT_ACCURACY_PREFLIGHT_FAILED",
                    "message": str(error),
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        raise SystemExit(2) from error
