from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Any, Protocol
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.config import PythonWorkerConfig

SUPPORTED_AUDIO_MIME_TYPES = {
    "audio/flac",
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/mp4",
}


class AudioTranscriptionError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class AudioReference(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId", min_length=1)
    object_key: str | None = Field(default=None, alias="objectKey", min_length=1)
    storage_url: str | None = Field(default=None, alias="storageUrl", min_length=1)
    mime_type: str = Field(alias="mimeType", min_length=1)

    @model_validator(mode="after")
    def validate_reference(self) -> AudioReference:
        if not self.object_key and not self.storage_url:
            raise ValueError("audio reference requires objectKey or storageUrl")

        if self.mime_type not in SUPPORTED_AUDIO_MIME_TYPES:
            raise ValueError(f"unsupported audio mime type: {self.mime_type}")

        return self


class AudioTranscribeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId", min_length=1)
    project_id: str = Field(alias="projectId", min_length=1)
    audio: AudioReference


class TranscriptSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str
    start_seconds: float | None = Field(default=None, alias="startSeconds", ge=0)
    end_seconds: float | None = Field(default=None, alias="endSeconds", ge=0)


class AudioTranscribeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    file_id: str = Field(alias="fileId")
    transcript: str
    language: str
    provider: str
    model: str
    duration_seconds: float | None = Field(default=None, alias="durationSeconds")
    segments: list[TranscriptSegment]


class AudioContent(BaseModel):
    data: bytes
    file_name: str
    mime_type: str


class ProviderTranscription(BaseModel):
    transcript: str
    language: str
    provider: str
    model: str
    duration_seconds: float | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)


class SpeechToTextProvider(Protocol):
    name: str
    model: str

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        pass


class OpenAISpeechToTextProvider:
    name = "openai"

    def __init__(self, *, api_key: str, model: str, language: str) -> None:
        self.model = model
        self._api_key = api_key
        self._language = language

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        try:
            from io import BytesIO

            from openai import OpenAI

            client: Any = OpenAI(api_key=self._api_key)
            result: Any = client.audio.transcriptions.create(
                model=self.model,
                file=(audio.file_name, BytesIO(audio.data), audio.mime_type),
                language=_openai_language(self._language),
                response_format="verbose_json",
            )
        except Exception as exc:  # pragma: no cover - exercised via fake provider.
            raise AudioTranscriptionError(
                "stt_provider_failed",
                "OpenAI transcription request failed",
                502,
            ) from exc

        transcript = _read_field(result, "text", "")
        if not isinstance(transcript, str) or not transcript.strip():
            raise AudioTranscriptionError(
                "empty_transcript",
                "STT provider returned an empty transcript",
                502,
            )

        provider_language = _read_field(result, "language", None)
        duration = _read_optional_float(result, "duration")

        return ProviderTranscription(
            transcript=transcript,
            language=provider_language
            if isinstance(provider_language, str) and provider_language
            else self._language,
            provider=self.name,
            model=self.model,
            duration_seconds=duration,
            segments=_read_segments(result),
        )


def get_speech_to_text_provider(
    request: Request,
) -> SpeechToTextProvider:
    config = getattr(request.app.state, "config", None)
    if not isinstance(config, PythonWorkerConfig):
        raise to_http_exception(
            AudioTranscriptionError(
                "worker_config_missing",
                "Python worker configuration is not loaded",
                500,
            )
        )

    try:
        return create_speech_to_text_provider(config)
    except AudioTranscriptionError as exc:
        raise to_http_exception(exc) from exc


def create_speech_to_text_provider(
    config: PythonWorkerConfig,
) -> SpeechToTextProvider:
    if config.stt_provider != "openai":
        raise AudioTranscriptionError(
            "unsupported_provider",
            f"STT_PROVIDER={config.stt_provider} is not supported for /audio/transcribe",
            400,
        )

    if not config.openai_api_key:
        raise AudioTranscriptionError(
            "provider_not_configured",
            "OPENAI_API_KEY is required when STT_PROVIDER=openai",
            500,
        )

    return OpenAISpeechToTextProvider(
        api_key=config.openai_api_key,
        model=config.openai_transcription_model,
        language=config.transcribe_language_code,
    )


def transcribe_rehearsal_audio(
    payload: AudioTranscribeRequest,
    provider: SpeechToTextProvider,
) -> AudioTranscribeResponse:
    audio = read_audio_content(payload.audio)

    try:
        result = provider.transcribe(audio)
    except AudioTranscriptionError:
        raise
    except Exception as exc:
        raise AudioTranscriptionError(
            "stt_provider_failed",
            "STT provider failed while transcribing rehearsal audio",
            502,
        ) from exc

    return AudioTranscribeResponse(
        runId=payload.run_id,
        projectId=payload.project_id,
        fileId=payload.audio.file_id,
        transcript=result.transcript,
        language=result.language,
        provider=result.provider,
        model=result.model,
        durationSeconds=result.duration_seconds,
        segments=result.segments,
    )


def read_audio_content(reference: AudioReference) -> AudioContent:
    source = reference.storage_url or reference.object_key
    if not source:
        raise AudioTranscriptionError(
            "invalid_audio_reference",
            "audio reference requires objectKey or storageUrl",
            400,
        )

    parsed = urlparse(source)
    file_name = _file_name(reference)

    try:
        if parsed.scheme in {"http", "https"}:
            request = UrlRequest(source, headers={"User-Agent": "orbit-python-worker"})
            with urlopen(request, timeout=15) as response:
                return AudioContent(
                    data=response.read(),
                    file_name=file_name,
                    mime_type=reference.mime_type,
                )

        if parsed.scheme == "file":
            data = Path(parsed.path).read_bytes()
        else:
            data = Path(source).read_bytes()
    except (OSError, URLError) as exc:
        raise AudioTranscriptionError(
            "file_access_failed",
            "Could not read rehearsal audio from the supplied reference",
            404,
        ) from exc

    if not data:
        raise AudioTranscriptionError(
            "empty_audio",
            "Rehearsal audio is empty",
            400,
        )

    return AudioContent(data=data, file_name=file_name, mime_type=reference.mime_type)


def to_http_exception(error: AudioTranscriptionError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    )


SttProviderDependency = Annotated[
    SpeechToTextProvider,
    Depends(get_speech_to_text_provider),
]


def _openai_language(language_code: str) -> str:
    return language_code.split("-", maxsplit=1)[0]


def _file_name(reference: AudioReference) -> str:
    source = reference.storage_url or reference.object_key or reference.file_id
    name = Path(urlparse(source).path).name
    return name or f"{reference.file_id}{_extension_for_mime(reference.mime_type)}"


def _extension_for_mime(mime_type: str) -> str:
    return {
        "audio/m4a": ".m4a",
        "audio/mp3": ".mp3",
        "audio/mp4": ".mp4",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/webm": ".webm",
        "audio/x-m4a": ".m4a",
        "audio/x-wav": ".wav",
        "video/mp4": ".mp4",
    }.get(mime_type, ".audio")


def _read_field(data: Any, field: str, default: Any) -> Any:
    if isinstance(data, Mapping):
        return data.get(field, default)

    return getattr(data, field, default)


def _read_optional_float(data: Any, field: str) -> float | None:
    value = _read_field(data, field, None)
    if isinstance(value, (int, float)):
        return float(value)

    return None


def _read_segments(data: Any) -> list[TranscriptSegment]:
    raw_segments = _read_field(data, "segments", [])
    if not isinstance(raw_segments, list):
        return []

    segments: list[TranscriptSegment] = []
    for raw_segment in raw_segments:
        text = _read_field(raw_segment, "text", "")
        if not isinstance(text, str) or not text:
            continue

        segments.append(
            TranscriptSegment(
                text=text,
                startSeconds=_read_optional_float(raw_segment, "start"),
                endSeconds=_read_optional_float(raw_segment, "end"),
            )
        )

    return segments
