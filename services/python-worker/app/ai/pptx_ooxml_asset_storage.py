from __future__ import annotations

import base64
import binascii
import hashlib
import re
from collections.abc import Callable
from typing import Any, Literal, Protocol, cast

from pydantic import BaseModel, ConfigDict, Field

from app.ai.pptx_design_importer import ImportedDesignAsset
from app.ai.pptx_ooxml_generation import (
    PptxOoxmlGenerationResult,
    PptxOoxmlSyncResult,
)
from app.config import PythonWorkerConfig

PPTX_OOXML_ASSET_TRANSPORT_VERSION: Literal["storage-manifest-v1"] = (
    "storage-manifest-v1"
)


class ObjectStorageClient(Protocol):
    def put_object(self, **kwargs: Any) -> Any: ...

    def delete_object(self, **kwargs: Any) -> Any: ...


class StoredPptxOoxmlAsset(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    asset_id: str = Field(alias="assetId", min_length=1, max_length=512)
    file_name: str = Field(alias="fileName", min_length=1, max_length=512)
    mime_type: str = Field(alias="mimeType", min_length=1, max_length=255)
    storage_key: str = Field(alias="storageKey", min_length=1, max_length=1024)
    size: int = Field(gt=0, le=1_073_741_824)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class StoredPptxOoxmlGenerationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    canvas: dict[str, Any]
    blueprint: dict[str, Any]
    template_blueprint: dict[str, Any] = Field(alias="templateBlueprint")
    quality_report: dict[str, Any] = Field(alias="qualityReport")
    asset_transport: Literal["storage-manifest-v1"] = Field(
        default=PPTX_OOXML_ASSET_TRANSPORT_VERSION,
        alias="assetTransport",
    )
    assets: list[StoredPptxOoxmlAsset] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class StoredPptxOoxmlSyncResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    asset_transport: Literal["storage-manifest-v1"] = Field(
        default=PPTX_OOXML_ASSET_TRANSPORT_VERSION,
        alias="assetTransport",
    )
    assets: list[StoredPptxOoxmlAsset] = Field(default_factory=list)
    element_sources: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="elementSources",
    )
    applied_operations: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="appliedOperations",
    )
    unsupported_operations: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="unsupportedOperations",
    )
    notes_pages: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="notesPages",
    )
    applied_slide_motion: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="appliedSlideMotion",
    )
    unsupported_slide_motion: list[dict[str, Any]] = Field(
        default_factory=list,
        alias="unsupportedSlideMotion",
    )
    warnings: list[str] = Field(default_factory=list)


def store_generation_assets(
    generated: PptxOoxmlGenerationResult,
    *,
    config: PythonWorkerConfig,
    storage_prefix: str,
    client_factory: Callable[[PythonWorkerConfig], ObjectStorageClient] | None = None,
) -> StoredPptxOoxmlGenerationResult:
    stored_assets = store_assets(
        generated.assets,
        config=config,
        storage_prefix=storage_prefix,
        client_factory=client_factory,
    )
    return StoredPptxOoxmlGenerationResult(
        canvas=generated.canvas,
        blueprint=generated.blueprint,
        templateBlueprint=generated.template_blueprint,
        qualityReport=generated.quality_report,
        assets=stored_assets,
        warnings=generated.warnings,
    )


def store_sync_assets(
    synced: PptxOoxmlSyncResult,
    *,
    config: PythonWorkerConfig,
    storage_prefix: str,
    client_factory: Callable[[PythonWorkerConfig], ObjectStorageClient] | None = None,
) -> StoredPptxOoxmlSyncResult:
    stored_assets = store_assets(
        synced.assets,
        config=config,
        storage_prefix=storage_prefix,
        client_factory=client_factory,
    )
    return StoredPptxOoxmlSyncResult(
        assets=stored_assets,
        elementSources=synced.element_sources,
        appliedOperations=[
            item.model_dump(by_alias=True, exclude_none=True)
            for item in synced.applied_operations
        ],
        unsupportedOperations=[
            item.model_dump(by_alias=True, exclude_none=True)
            for item in synced.unsupported_operations
        ],
        notesPages=[
            item.model_dump(by_alias=True, exclude_none=True)
            for item in synced.notes_pages
        ],
        appliedSlideMotion=[
            item.model_dump(by_alias=True, exclude_none=True)
            for item in synced.applied_slide_motion
        ],
        unsupportedSlideMotion=[
            item.model_dump(by_alias=True, exclude_none=True)
            for item in synced.unsupported_slide_motion
        ],
        warnings=synced.warnings,
    )


def store_assets(
    assets: list[ImportedDesignAsset],
    *,
    config: PythonWorkerConfig,
    storage_prefix: str,
    client_factory: Callable[[PythonWorkerConfig], ObjectStorageClient] | None = None,
) -> list[StoredPptxOoxmlAsset]:
    prefix = normalized_storage_prefix(storage_prefix)
    client = (client_factory or create_storage_client)(config)
    stored: list[StoredPptxOoxmlAsset] = []
    uploaded_keys: list[str] = []

    try:
        for asset in assets:
            try:
                body = base64.b64decode(asset.content_base64, validate=True)
            except (binascii.Error, ValueError) as error:
                raise ValueError(f"invalid base64 asset: {asset.asset_id}") from error
            if not body:
                raise ValueError(f"empty OOXML asset: {asset.asset_id}")

            digest = hashlib.sha256(body).hexdigest()
            file_name = safe_file_name(asset.file_name)
            storage_key = f"{prefix}{digest}-{file_name}"
            client.put_object(
                Bucket=config.s3_bucket,
                Key=storage_key,
                Body=body,
                ContentType=asset.mime_type,
                Metadata={"orbit-sha256": digest},
            )
            uploaded_keys.append(storage_key)
            stored.append(
                StoredPptxOoxmlAsset(
                    assetId=asset.asset_id,
                    fileName=file_name,
                    mimeType=asset.mime_type,
                    storageKey=storage_key,
                    size=len(body),
                    sha256=digest,
                )
            )
            asset.content_base64 = ""
            del body
    except Exception:
        for storage_key in reversed(uploaded_keys):
            try:
                client.delete_object(Bucket=config.s3_bucket, Key=storage_key)
            except Exception:
                pass
        raise

    return stored


def normalized_storage_prefix(value: str) -> str:
    if (
        not value
        or value.startswith("/")
        or not value.endswith("/")
        or re.search(r"[\x00-\x1f\x7f]", value)
    ):
        raise ValueError("invalid OOXML storage prefix")
    segments = value[:-1].split("/")
    if any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("invalid OOXML storage prefix")
    return value


def safe_file_name(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip(".-")
    return normalized[:180] or "asset.bin"


def create_storage_client(config: PythonWorkerConfig) -> ObjectStorageClient:
    import boto3  # type: ignore[import-untyped]
    from botocore.config import Config  # type: ignore[import-untyped]

    client_options: dict[str, Any] = {
        "service_name": "s3",
        "region_name": config.s3_region,
        "config": Config(
            s3={
                "addressing_style": "path" if config.s3_force_path_style else "auto"
            }
        ),
    }
    if config.s3_endpoint:
        client_options["endpoint_url"] = config.s3_endpoint
    if config.s3_access_key_id and config.s3_secret_access_key:
        client_options["aws_access_key_id"] = config.s3_access_key_id
        client_options["aws_secret_access_key"] = config.s3_secret_access_key
    return cast(ObjectStorageClient, boto3.client(**client_options))
