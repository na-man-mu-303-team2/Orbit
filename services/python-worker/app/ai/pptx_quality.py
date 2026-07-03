from __future__ import annotations

from io import BytesIO
from statistics import fmean
from typing import Any

from PIL import Image

SSIM_PASS_THRESHOLD = 0.95
SSIM_WINDOW_SIZE = 16


def image_ssim(golden_png: bytes, candidate_png: bytes) -> float:
    with Image.open(BytesIO(golden_png)) as golden_image:
        golden = golden_image.convert("L")
    with Image.open(BytesIO(candidate_png)) as candidate_image:
        candidate = candidate_image.convert("L")

    if candidate.size != golden.size:
        candidate = candidate.resize(golden.size)

    scores: list[float] = []
    weights: list[int] = []
    for box in ssim_windows(golden.size):
        golden_window = golden.crop(box)
        candidate_window = candidate.crop(box)
        area = (box[2] - box[0]) * (box[3] - box[1])
        scores.append(
            image_ssim_for_pixels(
                list(golden_window.getdata()),
                list(candidate_window.getdata()),
            )
            * area
        )
        weights.append(area)

    if not scores:
        return 0.0
    return round(max(0.0, min(1.0, sum(scores) / sum(weights))), 4)


def ssim_windows(size: tuple[int, int]) -> list[tuple[int, int, int, int]]:
    width, height = size
    return [
        (
            x,
            y,
            min(width, x + SSIM_WINDOW_SIZE),
            min(height, y + SSIM_WINDOW_SIZE),
        )
        for y in range(0, height, SSIM_WINDOW_SIZE)
        for x in range(0, width, SSIM_WINDOW_SIZE)
    ]


def image_ssim_for_pixels(golden_pixels: list[int], candidate_pixels: list[int]) -> float:
    if not golden_pixels or len(golden_pixels) != len(candidate_pixels):
        return 0.0

    mean_golden = fmean(golden_pixels)
    mean_candidate = fmean(candidate_pixels)
    variance_golden = fmean(
        (pixel - mean_golden) ** 2 for pixel in golden_pixels
    )
    variance_candidate = fmean(
        (pixel - mean_candidate) ** 2 for pixel in candidate_pixels
    )
    covariance = fmean(
        (golden_value - mean_golden) * (candidate_value - mean_candidate)
        for golden_value, candidate_value in zip(golden_pixels, candidate_pixels)
    )
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    numerator = (2 * mean_golden * mean_candidate + c1) * (2 * covariance + c2)
    denominator = (
        (mean_golden**2 + mean_candidate**2 + c1)
        * (variance_golden + variance_candidate + c2)
    )
    if denominator == 0:
        return 1.0 if golden_pixels == candidate_pixels else 0.0
    return max(0.0, min(1.0, numerator / denominator))


def pixel_similarity_quality(
    golden_images: list[bytes],
    candidate_images: list[bytes],
    *,
    threshold: float = SSIM_PASS_THRESHOLD,
) -> dict[str, Any]:
    slide_reports: list[dict[str, Any]] = []
    scores: list[float] = []
    slide_count = max(len(golden_images), len(candidate_images))

    for index in range(slide_count):
        if index >= len(golden_images):
            slide_reports.append(
                not_evaluated_slide_report(index + 1, "golden image missing")
            )
            continue
        if index >= len(candidate_images):
            slide_reports.append(
                not_evaluated_slide_report(index + 1, "candidate image missing")
            )
            continue

        score = image_ssim(golden_images[index], candidate_images[index])
        scores.append(score)
        if score >= threshold:
            slide_reports.append(
                {
                    "slideIndex": index + 1,
                    "status": "passed",
                    "ssim": score,
                    "reasons": [],
                    "fallback": "none",
                }
            )
        else:
            slide_reports.append(
                {
                    "slideIndex": index + 1,
                    "status": "vectorization_failed",
                    "ssim": score,
                    "reasons": [f"SSIM {score:.4f} is below {threshold:.2f}"],
                    "fallback": "rendered-background",
                }
            )

    return {
        "pixelSimilarity": round(fmean(scores) * 100) if scores else None,
        "slideReports": slide_reports,
    }


def not_evaluated_slide_reports(
    slide_count: int,
    reason: str,
) -> list[dict[str, Any]]:
    return [
        not_evaluated_slide_report(slide_index, reason)
        for slide_index in range(1, max(0, slide_count) + 1)
    ]


def not_evaluated_slide_report(slide_index: int, reason: str) -> dict[str, Any]:
    return {
        "slideIndex": slide_index,
        "status": "not_evaluated",
        "ssim": None,
        "reasons": [reason],
        "fallback": "none",
    }
