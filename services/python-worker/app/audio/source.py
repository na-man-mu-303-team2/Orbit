from __future__ import annotations

from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from app.audio.models import AudioContent, AudioReference


class AudioProcessingError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def load_audio_content(reference: AudioReference) -> AudioContent:
    """음성 참조를 메모리의 공통 오디오 입력으로 변환한다."""
    source = reference.storage_url or reference.object_key
    if not source:
        raise AudioProcessingError(
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
                data = response.read()
        elif parsed.scheme == "file":
            data = Path(parsed.path).read_bytes()
        else:
            data = Path(source).read_bytes()
    except (OSError, URLError) as exc:
        raise AudioProcessingError(
            "file_access_failed",
            "Could not read rehearsal audio from the supplied reference",
            404,
        ) from exc

    if not data:
        raise AudioProcessingError(
            "empty_audio",
            "Rehearsal audio is empty",
            400,
        )

    return AudioContent(data=data, file_name=file_name, mime_type=reference.mime_type)


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
