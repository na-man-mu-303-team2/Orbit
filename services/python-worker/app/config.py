from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Literal, Self
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

AppEnv = Literal["local", "test", "staging", "production"]
NodeEnv = Literal["development", "test", "production"]

ENV_KEYS = {
    "NODE_ENV",
    "APP_ENV",
    "PYTHON_WORKER_PORT",
    "PYTHON_WORKER_URL",
    "API_BASE_URL",
    "DATABASE_URL",
    "REDIS_URL",
    "STORAGE_DRIVER",
    "S3_ENDPOINT",
    "S3_PUBLIC_ENDPOINT",
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "S3_FORCE_PATH_STYLE",
    "JOB_QUEUE_DRIVER",
    "STT_PROVIDER",
    "OCR_PROVIDER",
    "LLM_PROVIDER",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "OPENAI_TRANSCRIPTION_MODEL",
    "OPENAI_EMBEDDING_MODEL",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "TRANSCRIBE_LANGUAGE_CODE",
    "TEXTRACT_ENABLED",
}

LOCAL_DEFAULTS = {
    "PYTHON_WORKER_URL": "http://localhost:8000",
    "API_BASE_URL": "http://localhost:3000",
    "DATABASE_URL": "postgres://orbit:orbit@localhost:5432/orbit",
    "REDIS_URL": "redis://localhost:6379",
    "S3_ENDPOINT": "http://localhost:9000",
    "S3_PUBLIC_ENDPOINT": "http://localhost:9000",
    "S3_BUCKET": "orbit-local",
}


class ConfigError(RuntimeError):
    pass


class PythonWorkerConfig(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, populate_by_name=True)

    node_env: NodeEnv = Field(alias="NODE_ENV")
    app_env: AppEnv = Field(alias="APP_ENV")
    python_worker_port: int = Field(alias="PYTHON_WORKER_PORT", ge=1, le=65535)
    python_worker_url: str = Field(alias="PYTHON_WORKER_URL", min_length=1)
    api_base_url: str = Field(alias="API_BASE_URL", min_length=1)
    database_url: str = Field(alias="DATABASE_URL", min_length=1)
    redis_url: str = Field(alias="REDIS_URL", min_length=1)
    storage_driver: Literal["minio", "s3"] = Field(alias="STORAGE_DRIVER")
    s3_endpoint: str | None = Field(default=None, alias="S3_ENDPOINT")
    s3_public_endpoint: str | None = Field(default=None, alias="S3_PUBLIC_ENDPOINT")
    s3_bucket: str = Field(alias="S3_BUCKET", min_length=1)
    s3_region: str = Field(alias="S3_REGION", min_length=1)
    s3_access_key_id: str | None = Field(default=None, alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str | None = Field(default=None, alias="S3_SECRET_ACCESS_KEY")
    s3_force_path_style: bool = Field(alias="S3_FORCE_PATH_STYLE")
    job_queue_driver: Literal["bullmq", "sqs"] = Field(alias="JOB_QUEUE_DRIVER")
    stt_provider: Literal["sherpa", "transcribe", "openai"] = Field(
        alias="STT_PROVIDER"
    )
    ocr_provider: Literal["python", "textract"] = Field(alias="OCR_PROVIDER")
    llm_provider: Literal["openai"] = Field(alias="LLM_PROVIDER")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(alias="OPENAI_MODEL", min_length=1)
    openai_transcription_model: str = Field(
        alias="OPENAI_TRANSCRIPTION_MODEL", min_length=1
    )
    openai_embedding_model: str = Field(alias="OPENAI_EMBEDDING_MODEL", min_length=1)
    aws_region: str = Field(alias="AWS_REGION", min_length=1)
    aws_access_key_id: str | None = Field(default=None, alias="AWS_ACCESS_KEY_ID")
    aws_secret_access_key: str | None = Field(default=None, alias="AWS_SECRET_ACCESS_KEY")
    transcribe_language_code: str = Field(alias="TRANSCRIBE_LANGUAGE_CODE", min_length=1)
    textract_enabled: bool = Field(alias="TEXTRACT_ENABLED")

    @model_validator(mode="after")
    def validate_runtime_contract(self) -> Self:
        errors: list[str] = []

        for key in ["PYTHON_WORKER_URL", "API_BASE_URL"]:
            value = self.model_dump(by_alias=True).get(key)
            if not isinstance(value, str) or not _is_url(value):
                errors.append(f"{key} must be a valid URL")

        if self.storage_driver == "minio":
            for key in [
                "S3_ENDPOINT",
                "S3_PUBLIC_ENDPOINT",
                "S3_ACCESS_KEY_ID",
                "S3_SECRET_ACCESS_KEY",
            ]:
                if not self.model_dump(by_alias=True).get(key):
                    errors.append(f"{key} is required when STORAGE_DRIVER=minio")

        if self.app_env in {"staging", "production"}:
            data = self.model_dump(by_alias=True)
            for key, local_value in LOCAL_DEFAULTS.items():
                if data.get(key) == local_value:
                    errors.append(
                        f"{key} must not use the local default in {self.app_env}"
                    )

            if not self.openai_api_key:
                errors.append(f"OPENAI_API_KEY is required in {self.app_env}")

        if errors:
            raise ValueError("; ".join(errors))

        return self


def load_config(environ: Mapping[str, str] | None = None) -> PythonWorkerConfig:
    source = os.environ if environ is None else environ
    data = {
        key: value.strip()
        for key, value in source.items()
        if key in ENV_KEYS and value.strip()
    }

    try:
        return PythonWorkerConfig.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(format_config_error(exc)) from exc


def format_config_error(error: ValidationError) -> str:
    lines = []
    for issue in error.errors():
        path = ".".join(str(part) for part in issue["loc"]) or "env"
        lines.append(f"- {path}: {issue['msg']}")

    return "\n".join(
        [
            "Invalid ORBIT environment for python-worker.",
            "Fix the variables below or copy .env.example to .env.local for local development.",
            *lines,
        ]
    )


def _is_url(value: str) -> bool:
    parsed = urlparse(value)
    return bool(parsed.scheme and parsed.netloc)
