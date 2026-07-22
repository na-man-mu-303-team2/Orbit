from __future__ import annotations

import base64
from typing import Any

import pytest

from app.ai.pptx_design_importer import ImportedDesignAsset
from app.ai.pptx_ooxml_asset_storage import store_assets, store_sync_assets
from app.ai.pptx_ooxml_generation import PptxOoxmlSyncResult
from app.config import PythonWorkerConfig, load_config


class FakeStorageClient:
    def __init__(self, *, fail_on_put: int | None = None) -> None:
        self.fail_on_put = fail_on_put
        self.puts: list[dict[str, Any]] = []
        self.deletes: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> None:
        if self.fail_on_put == len(self.puts) + 1:
            raise RuntimeError("storage unavailable")
        self.puts.append(kwargs)

    def delete_object(self, **kwargs: Any) -> None:
        self.deletes.append(kwargs)


def test_store_assets_uploads_content_and_returns_manifest() -> None:
    client = FakeStorageClient()
    raw = b"OOXML-package"
    asset = imported_asset("current_package", "deck.pptx", raw)

    result = store_assets(
        [asset],
        config=build_test_config(),
        storage_prefix="projects/project-1/jobs/job-1/pptx-ooxml/",
        client_factory=lambda _config: client,
    )

    assert len(result) == 1
    assert result[0].asset_id == "current_package"
    assert result[0].size == len(raw)
    assert result[0].storage_key.startswith(
        "projects/project-1/jobs/job-1/pptx-ooxml/"
    )
    assert result[0].storage_key.endswith("-deck.pptx")
    assert client.puts[0]["Body"] == raw
    assert client.puts[0]["Metadata"] == {
        "orbit-sha256": result[0].sha256
    }
    assert asset.content_base64 == ""


def test_store_assets_removes_uploaded_objects_after_partial_failure() -> None:
    client = FakeStorageClient(fail_on_put=2)
    assets = [
        imported_asset("first", "first.png", b"first"),
        imported_asset("second", "second.png", b"second"),
    ]

    with pytest.raises(RuntimeError, match="storage unavailable"):
        store_assets(
            assets,
            config=build_test_config(),
            storage_prefix="projects/project-1/jobs/job-1/pptx-ooxml/",
            client_factory=lambda _config: client,
        )

    assert client.deletes == [
        {
            "Bucket": "orbit-local",
            "Key": client.puts[0]["Key"],
        }
    ]


def test_store_assets_rejects_non_normalized_prefix() -> None:
    with pytest.raises(ValueError, match="invalid OOXML storage prefix"):
        store_assets(
            [imported_asset("asset", "asset.png", b"asset")],
            config=build_test_config(),
            storage_prefix="projects/project-1/../project-2/",
            client_factory=lambda _config: FakeStorageClient(),
        )


def test_store_sync_assets_omits_optional_nulls_and_preserves_notes_pages() -> None:
    synced = PptxOoxmlSyncResult(
        appliedOperations=[{"operationType": "reorder_slides"}],
        notesPages=[
            {
                "slideId": "slide_1",
                "notesPage": {
                    "status": "preserved",
                    "sourceNotesPart": "ppt/notesSlides/notesSlide1.xml",
                    "sourceNotesMasterPart": "ppt/notesMasters/notesMaster1.xml",
                    "bodyShapeId": "2",
                    "bodyWritable": True,
                    "notesWidthEmu": 9_144_000,
                    "notesHeightEmu": 6_858_000,
                    "hasNonBodyContent": False,
                },
            }
        ],
    )

    result = store_sync_assets(
        synced,
        config=build_test_config(),
        storage_prefix="projects/project-1/jobs/job-1/pptx-ooxml/",
        client_factory=lambda _config: FakeStorageClient(),
    ).model_dump(by_alias=True)

    assert result["appliedOperations"] == [
        {"operationType": "reorder_slides"}
    ]
    assert result["notesPages"] == [
        {
            "slideId": "slide_1",
            "notesPage": {
                "status": "preserved",
                "sourceNotesPart": "ppt/notesSlides/notesSlide1.xml",
                "sourceNotesMasterPart": "ppt/notesMasters/notesMaster1.xml",
                "bodyShapeId": "2",
                "bodyWritable": True,
                "notesWidthEmu": 9_144_000,
                "notesHeightEmu": 6_858_000,
                "hasNonBodyContent": False,
            },
        }
    ]


def imported_asset(asset_id: str, file_name: str, content: bytes) -> ImportedDesignAsset:
    return ImportedDesignAsset(
        assetId=asset_id,
        fileName=file_name,
        mimeType="application/octet-stream",
        contentBase64=base64.b64encode(content).decode("ascii"),
    )


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
