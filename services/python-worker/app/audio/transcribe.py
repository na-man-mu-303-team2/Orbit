from __future__ import annotations

import json
import math
import re
import uuid
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
    "audio/m4a",
    "audio/mp3",
    "audio/mp4",
    "audio/mpeg",
    "audio/mpga",
    "audio/flac",
    "audio/wav",
    "audio/webm",
    "audio/x-m4a",
    "audio/x-wav",
    "video/mp4",
}

_MULTIPART_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


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


class ReportSttProvider(Protocol):
    name: str
    model: str

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        pass


SpeechToTextProvider = ReportSttProvider


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
                response_format=_openai_response_format(self.model),
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


class WhisperXSpeechToTextProvider:
    name = "whisperx"

    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        model: str,
        language: str,
        timeout_ms: int,
        opener: Any = urlopen,
    ) -> None:
        self.model = model
        self._api_url = api_url
        self._api_key = api_key
        self._language = language
        self._timeout_seconds = timeout_ms / 1000
        self._opener = opener

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        body, content_type = _build_whisperx_multipart_body(
            audio,
            {
                "language": _openai_language(self._language),
                "model": self.model,
                "diarization": "false",
            },
        )
        request = UrlRequest(
            self._api_url,
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": content_type,
                "User-Agent": "orbit-python-worker",
            },
            method="POST",
        )

        try:
            with self._opener(request, timeout=self._timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # pragma: no cover - concrete paths use fakes.
            raise AudioTranscriptionError(
                "stt_provider_failed",
                "WhisperX transcription request failed",
                502,
            ) from exc

        return _parse_whisperx_response(
            payload,
            fallback_language=self._language,
            fallback_model=self.model,
        )


def get_speech_to_text_provider(
    request: Request,
) -> ReportSttProvider:
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
) -> ReportSttProvider:
    if config.report_stt_provider == "whisperx":
        if not (
            config.whisperx_api_url
            and config.whisperx_api_key
            and config.whisperx_model
        ):
            raise AudioTranscriptionError(
                "provider_not_configured",
                "REPORT_STT_PROVIDER=whisperx일 때 WHISPERX_API_URL, WHISPERX_API_KEY, WHISPERX_MODEL이 필요합니다.",
                500,
            )

        return WhisperXSpeechToTextProvider(
            api_url=config.whisperx_api_url,
            api_key=config.whisperx_api_key,
            model=config.whisperx_model,
            language=config.transcribe_language_code,
            timeout_ms=config.whisperx_timeout_ms,
        )

    if not config.openai_api_key:
        raise AudioTranscriptionError(
            "provider_not_configured",
            "REPORT_STT_PROVIDER=openai일 때 OPENAI_API_KEY가 필요합니다.",
            500,
        )

    return OpenAISpeechToTextProvider(
        api_key=config.openai_api_key,
        model=config.openai_transcription_model,
        language=config.transcribe_language_code,
    )


def transcribe_rehearsal_audio(
    payload: AudioTranscribeRequest,
    provider: ReportSttProvider,
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


ReportSttProviderDependency = Annotated[
    ReportSttProvider,
    Depends(get_speech_to_text_provider),
]


def _openai_language(language_code: str) -> str:
    return language_code.split("-", maxsplit=1)[0]


def _openai_response_format(model: str) -> str:
    if model.strip().lower() in {"gpt-4o-transcribe", "gpt-4o-mini-transcribe"}:
        return "json"

    return "verbose_json"


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
        "audio/flac": ".flac",
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


def _parse_whisperx_response(
    payload: Any, *, fallback_language: str, fallback_model: str
) -> ProviderTranscription:
    transcript = _read_field(payload, "transcript", "")
    if not isinstance(transcript, str) or not transcript.strip():
        raise AudioTranscriptionError(
            "empty_transcript",
            "WhisperX provider returned an empty transcript",
            502,
        )

    language = _read_field(payload, "language", fallback_language)
    provider = _read_field(payload, "provider", "whisperx")
    model = _read_field(payload, "model", fallback_model)
    duration = _read_optional_float(payload, "durationSeconds")

    if not isinstance(language, str) or not language:
        language = fallback_language
    if not isinstance(provider, str) or not provider:
        provider = "whisperx"
    if not isinstance(model, str) or not model:
        model = fallback_model

    return ProviderTranscription(
        transcript=transcript,
        language=language,
        provider=provider,
        model=model,
        duration_seconds=duration,
        segments=_read_whisperx_segments(payload),
    )


def _read_whisperx_segments(data: Any) -> list[TranscriptSegment]:
    raw_segments = _read_field(data, "segments", [])
    if not isinstance(raw_segments, list):
        raise _malformed_whisperx_segments_error()

    segments: list[TranscriptSegment] = []
    for raw_segment in raw_segments:
        text = _read_field(raw_segment, "text", None)
        if not isinstance(text, str) or not text.strip():
            raise _malformed_whisperx_segments_error()

        start_seconds = _read_required_whisperx_float(raw_segment, "startSeconds")
        end_seconds = _read_required_whisperx_float(raw_segment, "endSeconds")
        if end_seconds < start_seconds:
            raise _malformed_whisperx_segments_error()

        segments.append(
            TranscriptSegment(
                text=text,
                startSeconds=start_seconds,
                endSeconds=end_seconds,
            )
        )

    return segments


def _read_required_whisperx_float(data: Any, field: str) -> float:
    value = _read_field(data, field, None)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _malformed_whisperx_segments_error()

    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise _malformed_whisperx_segments_error()

    return number


def _malformed_whisperx_segments_error() -> AudioTranscriptionError:
    return AudioTranscriptionError(
        "malformed_provider_response",
        "WhisperX provider returned malformed segments",
        502,
    )


def _build_whisperx_multipart_body(
    audio: AudioContent, fields: Mapping[str, str]
) -> tuple[bytes, str]:
    boundary = f"orbit-whisperx-{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for key, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
                value.encode(),
                b"\r\n",
            ]
        )

    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            (
                'Content-Disposition: form-data; name="file"; '
                f'filename="{_sanitize_multipart_filename(audio.file_name)}"\r\n'
            ).encode(),
            f"Content-Type: {audio.mime_type}\r\n\r\n".encode(),
            audio.data,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )

    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _sanitize_multipart_filename(file_name: str) -> str:
    base_name = Path(file_name.replace("\\", "_")).name.replace("\x00", "")
    safe_name = re.sub(
        r"_+",
        "_",
        _MULTIPART_SAFE_FILENAME_RE.sub("_", base_name),
    ).strip("._-")
    return safe_name or "audio.audio"
