from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import shutil
import subprocess
import time
import zipfile
from pathlib import Path
from typing import Any

NOTES_EXPORT_OPTIONS = {
    "ExportNotesPages": {"type": "boolean", "value": "true"},
    "ExportOnlyNotesPages": {"type": "boolean", "value": "true"},
}
NOTES_RELATIONSHIP = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
)


def main() -> None:
    args = parse_args()
    source = args.source.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    inventory = package_inventory(source)
    renderer = find_required_command((os.environ.get("LIBREOFFICE_BIN"), "soffice", "libreoffice"))
    profile = output / "libreoffice-profile"

    cold = render_notes_pdf(source, output / "cold", profile, renderer, args.timeout)
    warm = render_notes_pdf(source, output / "warm", profile, renderer, args.timeout)
    expected_pages = inventory["notesPartCount"]
    page_count_proven = (
        expected_pages > 0
        and cold["pageCount"] == expected_pages
        and warm["pageCount"] == expected_pages
    )
    report = {
        "source": {
            "path": str(source),
            "sha256": sha256_file(source),
            "sizeBytes": source.stat().st_size,
        },
        "inventory": inventory,
        "libreOffice": {
            "binary": renderer,
            "version": command_version(renderer, "--version"),
            "filterOptions": NOTES_EXPORT_OPTIONS,
            "cold": cold,
            "warm": warm,
            "pageCountProven": page_count_proven,
            "decision": "candidate" if page_count_proven else "reject",
        },
    }
    report_path = output / "renderer-risk-report.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not page_count_proven:
        raise SystemExit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=120.0)
    return parser.parse_args()


def package_inventory(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path, "r") as package:
        names = package.namelist()
        slide_parts = sorted(
            name
            for name in names
            if name.startswith("ppt/slides/slide") and name.endswith(".xml")
        )
        notes_parts = sorted(
            name
            for name in names
            if name.startswith("ppt/notesSlides/notesSlide")
            and name.endswith(".xml")
        )
        media_parts = sorted(name for name in names if name.startswith("ppt/media/"))
        linked_notes = 0
        for slide_part in slide_parts:
            slide_name = Path(slide_part).name
            relationships = f"ppt/slides/_rels/{slide_name}.rels"
            if relationships not in names:
                continue
            relationship_xml = package.read(relationships)
            if NOTES_RELATIONSHIP.encode("utf-8") in relationship_xml:
                linked_notes += 1
    return {
        "slidePartCount": len(slide_parts),
        "notesPartCount": len(notes_parts),
        "slideNotesRelationshipCount": linked_notes,
        "mediaPartCount": len(media_parts),
    }


def render_notes_pdf(
    source: Path,
    output: Path,
    profile: Path,
    renderer: str,
    timeout: float,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    profile.mkdir(parents=True, exist_ok=True)
    filter_spec = "pdf:impress_pdf_Export:" + json.dumps(
        NOTES_EXPORT_OPTIONS, separators=(",", ":")
    )
    command = [
        renderer,
        "--headless",
        f"-env:UserInstallation={profile.resolve().as_uri()}",
        "--convert-to",
        filter_spec,
        "--outdir",
        str(output),
        str(source),
    ]
    started = time.perf_counter()
    completed = subprocess.run(
        command,
        capture_output=True,
        check=False,
        text=True,
        timeout=timeout,
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    if completed.returncode != 0:
        raise RuntimeError(
            f"LibreOffice notes export failed with exit {completed.returncode}"
        )
    pdf_path = output / f"{source.stem}.pdf"
    if not pdf_path.exists():
        raise RuntimeError("LibreOffice notes export did not create a PDF")
    page_count = pdf_page_count(pdf_path, timeout)
    png_count = render_pdf_pages(pdf_path, output / "page", timeout)
    usage = resource.getrusage(resource.RUSAGE_CHILDREN)
    return {
        "elapsedMs": elapsed_ms,
        "childPeakRssBytes": child_peak_rss_bytes(usage.ru_maxrss),
        "pageCount": page_count,
        "pngCount": png_count,
        "pdfBytes": pdf_path.stat().st_size,
    }


def pdf_page_count(pdf_path: Path, timeout: float) -> int:
    pdfinfo = find_required_command(("pdfinfo",))
    completed = subprocess.run(
        [pdfinfo, str(pdf_path)],
        capture_output=True,
        check=True,
        text=True,
        timeout=timeout,
    )
    for line in completed.stdout.splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", maxsplit=1)[1].strip())
    raise RuntimeError("pdfinfo did not report a page count")


def render_pdf_pages(pdf_path: Path, prefix: Path, timeout: float) -> int:
    pdftoppm = find_required_command(("pdftoppm",))
    subprocess.run(
        [pdftoppm, "-png", "-r", "96", str(pdf_path), str(prefix)],
        capture_output=True,
        check=True,
        timeout=timeout,
    )
    return len(list(prefix.parent.glob(f"{prefix.name}-*.png")))


def child_peak_rss_bytes(value: int) -> int:
    if os.uname().sysname == "Darwin":
        return value
    return value * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_version(command: str, argument: str) -> str:
    completed = subprocess.run(
        [command, argument], capture_output=True, check=True, text=True, timeout=10
    )
    return (completed.stdout or completed.stderr).strip().splitlines()[0]


def find_required_command(candidates: tuple[str | None, ...]) -> str:
    for candidate in candidates:
        if not candidate:
            continue
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise RuntimeError("required renderer command is unavailable")


if __name__ == "__main__":
    main()
