import pytest

from app.config import ConfigError, load_config


VALID_ENV = {
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
    "STT_PROVIDER": "sherpa",
    "OCR_PROVIDER": "python",
    "LLM_PROVIDER": "openai",
    "OPENAI_API_KEY": "",
    "OPENAI_MODEL": "gpt-4.1-mini",
    "OPENAI_TRANSCRIPTION_MODEL": "gpt-4o-transcribe",
    "OPENAI_EMBEDDING_MODEL": "text-embedding-3-small",
    "AWS_REGION": "ap-northeast-2",
    "AWS_ACCESS_KEY_ID": "",
    "AWS_SECRET_ACCESS_KEY": "",
    "TRANSCRIBE_LANGUAGE_CODE": "ko-KR",
    "TEXTRACT_ENABLED": "false",
}


def test_openai_model_defaults_are_loaded_from_env() -> None:
    config = load_config(
        {
            **VALID_ENV,
            "OPENAI_MODEL": "gpt-4.1",
            "OPENAI_TRANSCRIPTION_MODEL": "gpt-4o-mini-transcribe",
            "OPENAI_EMBEDDING_MODEL": "text-embedding-3-large",
        }
    )

    assert config.openai_model == "gpt-4.1"
    assert config.openai_transcription_model == "gpt-4o-mini-transcribe"
    assert config.openai_embedding_model == "text-embedding-3-large"


def test_missing_required_env_fails_with_readable_error() -> None:
    env = dict(VALID_ENV)
    del env["DATABASE_URL"]

    with pytest.raises(ConfigError, match="DATABASE_URL"):
        load_config(env)


def test_empty_strings_are_treated_as_missing() -> None:
    with pytest.raises(ConfigError, match="OPENAI_MODEL"):
        load_config({**VALID_ENV, "OPENAI_MODEL": " "})


def test_staging_rejects_local_defaults() -> None:
    with pytest.raises(ConfigError, match="DATABASE_URL must not use"):
        load_config(
            {
                **VALID_ENV,
                "APP_ENV": "staging",
                "OPENAI_API_KEY": "sk-staging-placeholder",
            }
        )
