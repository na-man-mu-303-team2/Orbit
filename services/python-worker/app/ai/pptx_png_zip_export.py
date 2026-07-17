from __future__ import annotations

import base64
import binascii
from io import BytesIO
import zipfile

from pptx import Presentation
from pydantic import BaseModel, ConfigDict, Field

from app.ai.pptx_ooxml_generation import (
    CanvasSpec,
    PptxRenderUnavailableError,
    render_pptx_to_png_assets,
)


class PptxPngZipExportError(RuntimeError):
    pass


class PptxPngZipExportRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content_base64: str = Field(alias="contentBase64", min_length=1)


class PptxPngZipExportResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    content_base64: str = Field(alias="contentBase64")
    warnings: list[str] = Field(default_factory=list)


def export_pptx_png_zip(
    request: PptxPngZipExportRequest,
) -> PptxPngZipExportResponse:
    try:
        package_bytes = base64.b64decode(request.content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise PptxPngZipExportError("PPTX content is not valid base64.") from error

    canvas = _render_canvas(package_bytes)
    try:
        assets = render_pptx_to_png_assets(package_bytes, canvas)
    except PptxRenderUnavailableError:
        raise
    except Exception as error:
        raise PptxPngZipExportError("PPTX slide rendering failed.") from error

    output = BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, asset in enumerate(assets, start=1):
            try:
                image_bytes = base64.b64decode(asset.content_base64, validate=True)
            except (binascii.Error, ValueError) as error:
                raise PptxPngZipExportError(
                    f"Rendered slide {index} is not valid base64."
                ) from error
            archive.writestr(f"slide-{index:03d}.png", image_bytes)

    return PptxPngZipExportResponse(
        contentBase64=base64.b64encode(output.getvalue()).decode("ascii")
    )


def _render_canvas(package_bytes: bytes) -> CanvasSpec:
    try:
        presentation = Presentation(BytesIO(package_bytes))
    except Exception as error:
        raise PptxPngZipExportError("PPTX package is invalid.") from error
    width = int(presentation.slide_width or 1)
    height = int(presentation.slide_height or 1)
    render_width = 1920
    render_height = max(1, round(render_width * height / width))
    return CanvasSpec(
        preset="export",
        width=render_width,
        height=render_height,
        aspect_ratio=f"{width}:{height}",
    )
