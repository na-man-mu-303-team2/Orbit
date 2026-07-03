from __future__ import annotations

from io import BytesIO

from PIL import Image

from app.ai.pptx_quality import image_ssim, pixel_similarity_quality


def test_image_ssim_scores_identical_images_as_one() -> None:
    image = png("#2563EB")

    assert image_ssim(image, image) == 1.0


def test_image_ssim_uses_local_windows_for_sparse_text_like_differences() -> None:
    golden = sparse_text_like_png(offset_x=4)
    candidate = sparse_text_like_png(offset_x=5)

    assert image_ssim(golden, candidate) >= 0.8


def test_pixel_similarity_quality_marks_failed_slides() -> None:
    result = pixel_similarity_quality(
        [png("#2563EB"), png("#FFFFFF")],
        [png("#2563EB"), png("#111827")],
        threshold=0.95,
    )

    assert result["pixelSimilarity"] is not None
    assert result["slideReports"][0]["status"] == "passed"
    assert result["slideReports"][1]["status"] == "vectorization_failed"
    assert result["slideReports"][1]["fallback"] == "rendered-background"


def test_pixel_similarity_quality_marks_missing_candidate_as_not_evaluated() -> None:
    result = pixel_similarity_quality([png("#FFFFFF")], [], threshold=0.95)

    assert result["pixelSimilarity"] is None
    assert result["slideReports"] == [
        {
            "slideIndex": 1,
            "status": "not_evaluated",
            "ssim": None,
            "reasons": ["candidate image missing"],
            "fallback": "none",
        }
    ]


def png(color: str) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (16, 16), color).save(buffer, format="PNG")
    return buffer.getvalue()


def sparse_text_like_png(*, offset_x: int) -> bytes:
    image = Image.new("RGB", (256, 128), "#FFFFFF")
    for x in range(offset_x, 180, 12):
        for y in range(28, 44):
            image.putpixel((x, y), (17, 24, 39))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
