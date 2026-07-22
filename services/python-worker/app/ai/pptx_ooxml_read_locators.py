from __future__ import annotations

import base64
import re
import zipfile
from collections.abc import Callable
from io import BytesIO
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.config import PythonWorkerConfig

PPTX_MIME_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)
MAX_LOCATOR_TOTAL_BYTES = 256 * 1024 * 1024
LOCATOR_REFERENCE_PREFIX = "orbit-storage:"


class PptxOoxmlReadLocator(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    locator_id: str = Field(
        alias="locatorId",
        pattern=r"^[A-Za-z0-9_-]{1,128}$",
    )
    read_url: HttpUrl = Field(alias="readUrl", max_length=8192)
    file_name: str = Field(alias="fileName", min_length=1, max_length=512)
    mime_type: str = Field(alias="mimeType", min_length=1, max_length=255)
    size: int = Field(gt=0, le=536_870_912)


LocatorFetcher = Callable[[PptxOoxmlReadLocator], bytes]


def load_pptx_package_locator(
    locator: PptxOoxmlReadLocator,
    *,
    config: PythonWorkerConfig,
    fetcher: LocatorFetcher | None = None,
) -> bytes:
    if locator.mime_type != PPTX_MIME_TYPE:
        raise ValueError("OOXML source locator MIME type must be PPTX")
    validate_storage_read_url(locator, config)
    content = (fetcher or fetch_locator_bytes)(locator)
    validate_declared_size(locator, content)
    try:
        with zipfile.ZipFile(BytesIO(content)) as package:
            if "ppt/presentation.xml" not in package.namelist():
                raise ValueError("OOXML source locator is not a PPTX package")
    except zipfile.BadZipFile as error:
        raise ValueError("OOXML source locator is not a PPTX package") from error
    return content


def materialize_asset_locators(
    payload: Any,
    locators: list[PptxOoxmlReadLocator],
    *,
    config: PythonWorkerConfig,
    fetcher: LocatorFetcher | None = None,
) -> Any:
    if len(locators) > 500:
        raise ValueError("too many OOXML asset locators")

    data_urls: dict[str, str] = {}
    total_bytes = 0
    for locator in locators:
        reference = f"{LOCATOR_REFERENCE_PREFIX}{locator.locator_id}"
        if reference in data_urls:
            raise ValueError(f"duplicate OOXML asset locator: {locator.locator_id}")
        validate_storage_read_url(locator, config)
        content = (fetcher or fetch_locator_bytes)(locator)
        validate_declared_size(locator, content)
        validate_image_content(locator, content)
        total_bytes += len(content)
        if total_bytes > MAX_LOCATOR_TOTAL_BYTES:
            raise ValueError("OOXML asset locators exceed the total byte limit")
        encoded = base64.b64encode(content).decode("ascii")
        data_urls[reference] = f"data:{locator.mime_type};base64,{encoded}"

    return replace_locator_references(payload, data_urls)


def fetch_locator_bytes(locator: PptxOoxmlReadLocator) -> bytes:
    request = Request(
        str(locator.read_url),
        headers={"Accept-Encoding": "identity"},
        method="GET",
    )
    with urlopen(request, timeout=60) as response:  # noqa: S310
        content = bytes(response.read(locator.size + 1))
    if len(content) > locator.size:
        raise ValueError(f"OOXML locator exceeds declared size: {locator.locator_id}")
    return content


def validate_storage_read_url(
    locator: PptxOoxmlReadLocator,
    config: PythonWorkerConfig,
) -> None:
    parsed = urlparse(str(locator.read_url))
    for endpoint_value in (config.s3_endpoint, config.s3_public_endpoint):
        endpoint = urlparse(endpoint_value) if endpoint_value else None
        if (
            endpoint
            and parsed.scheme == endpoint.scheme
            and parsed.netloc == endpoint.netloc
        ):
            return

    hostname = parsed.hostname or ""
    if config.storage_driver == "s3" and hostname.endswith(".amazonaws.com"):
        bucket_in_host = hostname.startswith(f"{config.s3_bucket}.")
        bucket_in_path = parsed.path.startswith(f"/{config.s3_bucket}/")
        if bucket_in_host or bucket_in_path:
            return
    raise ValueError(f"OOXML locator host is not allowed: {locator.locator_id}")


def validate_declared_size(
    locator: PptxOoxmlReadLocator,
    content: bytes,
) -> None:
    if len(content) != locator.size:
        raise ValueError(f"OOXML locator size mismatch: {locator.locator_id}")


def validate_image_content(locator: PptxOoxmlReadLocator, content: bytes) -> None:
    expected_format = {
        "image/png": "PNG",
        "image/jpeg": "JPEG",
        "image/webp": "WEBP",
    }.get(locator.mime_type)
    if expected_format:
        try:
            with Image.open(BytesIO(content)) as image:
                image.verify()
                actual_format = str(image.format or "").upper()
        except (OSError, SyntaxError, ValueError) as error:
            raise ValueError(
                f"OOXML locator image is invalid: {locator.locator_id}"
            ) from error
        if actual_format != expected_format:
            raise ValueError(
                f"OOXML locator image format mismatch: {locator.locator_id}"
            )
        return

    if locator.mime_type == "image/svg+xml":
        try:
            source = content.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(
                f"OOXML locator SVG is invalid: {locator.locator_id}"
            ) from error
        if not re.search(r"<svg(?:\s|>)", source, flags=re.IGNORECASE):
            raise ValueError(f"OOXML locator SVG is invalid: {locator.locator_id}")
        return

    raise ValueError(f"OOXML locator MIME type is unsupported: {locator.locator_id}")


def replace_locator_references(value: Any, data_urls: dict[str, str]) -> Any:
    if isinstance(value, str):
        if value.startswith(LOCATOR_REFERENCE_PREFIX) and value not in data_urls:
            raise ValueError("OOXML asset locator reference is missing")
        return data_urls.get(value, value)
    if isinstance(value, list):
        return [replace_locator_references(item, data_urls) for item in value]
    if isinstance(value, dict):
        return {
            key: replace_locator_references(item, data_urls)
            for key, item in value.items()
        }
    return value
