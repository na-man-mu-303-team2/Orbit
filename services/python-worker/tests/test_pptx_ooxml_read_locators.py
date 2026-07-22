from __future__ import annotations

import base64
import zipfile
from io import BytesIO

import pytest

from app.ai.pptx_ooxml_read_locators import (
    PPTX_MIME_TYPE,
    PptxOoxmlReadLocator,
    load_pptx_package_locator,
    materialize_asset_locators,
)
from app.config import PythonWorkerConfig, load_config

PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_load_pptx_package_locator_validates_zip_structure() -> None:
    package = pptx_package_bytes()
    locator = read_locator(
        locator_id="source-package",
        file_name="source.pptx",
        mime_type=PPTX_MIME_TYPE,
        size=len(package),
    )

    result = load_pptx_package_locator(
        locator,
        config=build_test_config(),
        fetcher=lambda _locator: package,
    )

    assert result == package


def test_materialize_asset_locators_replaces_references_after_image_validation() -> None:
    locator = read_locator(
        locator_id="image-1",
        file_name="image.png",
        mime_type="image/png",
        size=len(PNG_1X1),
    )

    result = materialize_asset_locators(
        {"props": {"src": "orbit-storage:image-1"}},
        [locator],
        config=build_test_config(),
        fetcher=lambda _locator: PNG_1X1,
    )

    assert result == {
        "props": {
            "src": f"data:image/png;base64,{base64.b64encode(PNG_1X1).decode('ascii')}"
        }
    }


def test_locator_rejects_non_storage_hosts_without_exposing_url() -> None:
    locator = PptxOoxmlReadLocator(
        locatorId="image-1",
        readUrl="https://metadata.example.test/private?secret=value",
        fileName="image.png",
        mimeType="image/png",
        size=len(PNG_1X1),
    )

    with pytest.raises(ValueError, match="host is not allowed") as error:
        materialize_asset_locators(
            {"src": "orbit-storage:image-1"},
            [locator],
            config=build_test_config(),
            fetcher=lambda _locator: PNG_1X1,
        )

    assert "secret=value" not in str(error.value)


def test_locator_rejects_size_mismatch() -> None:
    locator = read_locator(
        locator_id="image-1",
        file_name="image.png",
        mime_type="image/png",
        size=len(PNG_1X1) + 1,
    )

    with pytest.raises(ValueError, match="size mismatch"):
        materialize_asset_locators(
            {"src": "orbit-storage:image-1"},
            [locator],
            config=build_test_config(),
            fetcher=lambda _locator: PNG_1X1,
        )


def read_locator(
    *,
    locator_id: str,
    file_name: str,
    mime_type: str,
    size: int,
) -> PptxOoxmlReadLocator:
    return PptxOoxmlReadLocator(
        locatorId=locator_id,
        readUrl=f"http://localhost:9000/orbit-local/{file_name}?signature=test",
        fileName=file_name,
        mimeType=mime_type,
        size=size,
    )


def pptx_package_bytes() -> bytes:
    output = BytesIO()
    with zipfile.ZipFile(output, "w") as package:
        package.writestr("ppt/presentation.xml", "<p:presentation/>")
    return output.getvalue()


def build_test_config() -> PythonWorkerConfig:
    return load_config(
        {
            "NODE_ENV": "test",
            "APP_ENV": "local",
            "PYTHON_WORKER_PORT": "8000",
            "PYTHON_WORKER_URL": "http://localhost:8000",
            "API_BASE_URL": "http://localhost:3000",
            "DATABASE_URL": "postgres://orbit:orbit@localhost:5432/orbit",
            "REDIS_URL": "redis://localhost:6379",
            "STORAGE_DRIVER": "minio",
            "S3_ENDPOINT": "http://localhost:9000",
            "S3_PUBLIC_ENDPOINT": "http://localhost:9000",
            "S3_BUCKET": "orbit-local",
            "S3_REGION": "ap-northeast-2",
            "S3_ACCESS_KEY_ID": "orbit",
            "S3_SECRET_ACCESS_KEY": "orbit-password",
            "S3_FORCE_PATH_STYLE": "true",
            "JOB_QUEUE_DRIVER": "bullmq",
            "LIVE_STT_PROVIDER": "sherpa",
            "REPORT_STT_PROVIDER": "openai",
            "OCR_PROVIDER": "python",
            "LLM_PROVIDER": "openai",
            "OPENAI_MODEL": "gpt-4.1-mini",
            "OPENAI_TRANSCRIPTION_MODEL": "gpt-4o-transcribe",
            "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
            "AWS_REGION": "ap-northeast-2",
            "TRANSCRIBE_LANGUAGE_CODE": "ko-KR",
            "TEXTRACT_ENABLED": "false",
        }
    )
