from __future__ import annotations

import time

import pytest

from app.ai.pptx_render_resource_limits import (
    PptxRenderResourceLimitError,
    run_bitmap_decode_with_timeout,
    validate_rendered_bitmap,
)


def test_rendered_bitmap_rejects_dimension_and_byte_limits_with_codes() -> None:
    with pytest.raises(PptxRenderResourceLimitError) as dimension_error:
        validate_rendered_bitmap(
            b"png",
            width=1281,
            height=720,
            max_dimension=1280,
            max_bytes=1024,
            dimension_code="PPTX_TEST_DIMENSION_LIMIT",
            byte_code="PPTX_TEST_BYTE_LIMIT",
        )
    assert dimension_error.value.code == "PPTX_TEST_DIMENSION_LIMIT"

    with pytest.raises(PptxRenderResourceLimitError) as byte_error:
        validate_rendered_bitmap(
            b"x" * 1025,
            width=1280,
            height=720,
            max_dimension=1280,
            max_bytes=1024,
            dimension_code="PPTX_TEST_DIMENSION_LIMIT",
            byte_code="PPTX_TEST_BYTE_LIMIT",
        )
    assert byte_error.value.code == "PPTX_TEST_BYTE_LIMIT"


def test_bitmap_decode_timeout_interrupts_with_bounded_code() -> None:
    with pytest.raises(PptxRenderResourceLimitError) as error:
        run_bitmap_decode_with_timeout(
            lambda: time.sleep(0.1),
            timeout_seconds=0.01,
            timeout_code="PPTX_TEST_DECODE_TIMEOUT",
        )

    assert error.value.code == "PPTX_TEST_DECODE_TIMEOUT"
