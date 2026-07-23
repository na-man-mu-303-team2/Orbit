from __future__ import annotations

import base64
import importlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Literal, cast

from app.ai.pptx_design_importer import ImportedDesignAsset
from app.ai.pptx_render_resource_limits import (
    PptxRenderResourceLimitError,
    run_bitmap_decode_with_timeout,
    validate_rendered_bitmap,
)


PptxNotesRenderErrorCode = Literal[
    "PPTX_NOTES_RENDERER_UNAVAILABLE",
    "PPTX_NOTES_RENDER_TIMEOUT",
    "PPTX_NOTES_RENDER_FAILED",
    "PPTX_NOTES_PAGE_COUNT_MISMATCH",
    "PPTX_NOTES_PREVIEW_ASSET_FAILED",
    "PPTX_NOTES_PREVIEW_BYTE_LIMIT",
    "PPTX_NOTES_PREVIEW_DECODE_TIMEOUT",
    "PPTX_NOTES_PREVIEW_DIMENSION_LIMIT",
]

NOTES_EXPORT_OPTIONS = {
    "ExportNotesPages": {"type": "boolean", "value": "true"},
    "ExportOnlyNotesPages": {"type": "boolean", "value": "true"},
}
NOTES_PREVIEW_MAX_DIMENSION = 1280
NOTES_PREVIEW_MAX_BYTES = 8 * 1024 * 1024
NOTES_PREVIEW_MAX_TOTAL_BYTES = 128 * 1024 * 1024
NOTES_PREVIEW_DECODE_TIMEOUT_SECONDS = 10.0
MAX_NOTES_PREVIEW_PAGES = 1_000
DEFAULT_NOTES_RENDER_TIMEOUT_SECONDS = 120.0


class PptxNotesRenderError(RuntimeError):
    def __init__(self, code: PptxNotesRenderErrorCode) -> None:
        super().__init__(code)
        self.code = code


def render_pptx_notes_to_png_assets(
    package_bytes: bytes,
    *,
    notes_width_emu: int,
    notes_height_emu: int,
    expected_page_count: int,
    timeout_seconds: float = DEFAULT_NOTES_RENDER_TIMEOUT_SECONDS,
) -> list[ImportedDesignAsset]:
    executable = find_libreoffice_executable()
    if executable is None:
        raise PptxNotesRenderError("PPTX_NOTES_RENDERER_UNAVAILABLE")
    if (
        notes_width_emu <= 0
        or notes_height_emu <= 0
        or expected_page_count <= 0
        or expected_page_count > MAX_NOTES_PREVIEW_PAGES
    ):
        raise PptxNotesRenderError("PPTX_NOTES_PREVIEW_ASSET_FAILED")

    with TemporaryDirectory(prefix="orbit-pptx-notes-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        source_path = temporary_path / "source.pptx"
        output_path = temporary_path / "output"
        profile_path = temporary_path / "profile"
        output_path.mkdir()
        profile_path.mkdir()
        source_path.write_bytes(package_bytes)

        command = notes_export_command(
            executable,
            source_path,
            output_path,
            profile_path,
        )
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise PptxNotesRenderError("PPTX_NOTES_RENDER_TIMEOUT") from error
        except OSError as error:
            raise PptxNotesRenderError(
                "PPTX_NOTES_RENDERER_UNAVAILABLE"
            ) from error

        if completed.returncode != 0:
            raise PptxNotesRenderError("PPTX_NOTES_RENDER_FAILED")
        pdf_path = output_path / "source.pdf"
        if not pdf_path.is_file():
            raise PptxNotesRenderError("PPTX_NOTES_RENDER_FAILED")
        return render_notes_pdf_to_png_assets(
            pdf_path,
            notes_width_emu=notes_width_emu,
            notes_height_emu=notes_height_emu,
            expected_page_count=expected_page_count,
        )


def find_libreoffice_executable() -> str | None:
    configured = os.environ.get("LIBREOFFICE_BIN")
    for candidate in (configured, "libreoffice", "soffice"):
        if candidate and (resolved := shutil.which(candidate)):
            return resolved
    return None


def notes_export_command(
    executable: str,
    source_path: Path,
    output_path: Path,
    profile_path: Path,
) -> list[str]:
    filter_specification = "pdf:impress_pdf_Export:" + json.dumps(
        NOTES_EXPORT_OPTIONS,
        separators=(",", ":"),
    )
    return [
        executable,
        "--headless",
        f"-env:UserInstallation={profile_path.resolve().as_uri()}",
        "--convert-to",
        filter_specification,
        "--outdir",
        str(output_path),
        str(source_path),
    ]


def render_notes_pdf_to_png_assets(
    pdf_path: Path,
    *,
    notes_width_emu: int,
    notes_height_emu: int,
    expected_page_count: int,
) -> list[ImportedDesignAsset]:
    fitz: Any = importlib.import_module("fitz")
    try:
        document = fitz.open(str(pdf_path))
    except Exception as error:
        raise PptxNotesRenderError("PPTX_NOTES_RENDER_FAILED") from error

    try:
        if document.page_count != expected_page_count:
            raise PptxNotesRenderError("PPTX_NOTES_PAGE_COUNT_MISMATCH")
        target_width, target_height = notes_preview_dimensions(
            notes_width_emu,
            notes_height_emu,
        )
        assets: list[ImportedDesignAsset] = []
        total_bytes = 0
        for page_index in range(document.page_count):
            page = document.load_page(page_index)
            matrix = fitz.Matrix(
                target_width / float(page.rect.width),
                target_height / float(page.rect.height),
            )
            try:
                png_bytes, pixel_width, pixel_height = (
                    run_bitmap_decode_with_timeout(
                        lambda: render_pdf_page_png(page, matrix),
                        timeout_seconds=NOTES_PREVIEW_DECODE_TIMEOUT_SECONDS,
                        timeout_code="PPTX_NOTES_PREVIEW_DECODE_TIMEOUT",
                    )
                )
                validate_rendered_bitmap(
                    png_bytes,
                    width=pixel_width,
                    height=pixel_height,
                    max_dimension=NOTES_PREVIEW_MAX_DIMENSION,
                    max_bytes=NOTES_PREVIEW_MAX_BYTES,
                    dimension_code="PPTX_NOTES_PREVIEW_DIMENSION_LIMIT",
                    byte_code="PPTX_NOTES_PREVIEW_BYTE_LIMIT",
                )
                total_bytes += len(png_bytes)
                if total_bytes > NOTES_PREVIEW_MAX_TOTAL_BYTES:
                    raise PptxRenderResourceLimitError(
                        "PPTX_NOTES_PREVIEW_BYTE_LIMIT"
                    )
            except PptxRenderResourceLimitError as error:
                raise PptxNotesRenderError(
                    cast(PptxNotesRenderErrorCode, error.code)
                ) from error
            assets.append(
                ImportedDesignAsset(
                    assetId=f"notes_render_{page_index + 1}",
                    fileName=f"notes-{page_index + 1:02d}.png",
                    mimeType="image/png",
                    contentBase64=base64.b64encode(png_bytes).decode("ascii"),
                )
            )
        return assets
    except PptxNotesRenderError:
        raise
    except Exception as error:
        raise PptxNotesRenderError(
            "PPTX_NOTES_PREVIEW_ASSET_FAILED"
        ) from error
    finally:
        document.close()


def render_pdf_page_png(page: Any, matrix: Any) -> tuple[bytes, int, int]:
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)
    return pixmap.tobytes("png"), int(pixmap.width), int(pixmap.height)


def notes_preview_dimensions(
    notes_width_emu: int,
    notes_height_emu: int,
) -> tuple[int, int]:
    scale = NOTES_PREVIEW_MAX_DIMENSION / max(notes_width_emu, notes_height_emu)
    return (
        max(1, round(notes_width_emu * scale)),
        max(1, round(notes_height_emu * scale)),
    )
