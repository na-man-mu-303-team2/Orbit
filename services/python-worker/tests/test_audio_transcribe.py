from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.audio.transcribe import (
    AudioTranscribeRequest,
    AudioTranscriptionError,
    AudioContent,
    ProviderTranscription,
    SpeechToTextProvider,
    TranscriptSegment,
    create_speech_to_text_provider,
    get_speech_to_text_provider,
    transcribe_rehearsal_audio,
)
from app.config import load_config
from app.main import app
from tests.test_config import VALID_ENV


class FakeSpeechToTextProvider:
    name = "fake"
    model = "fake-transcriber"

    def __init__(self, transcript: str = "안녕하세요 ORBIT 리허설입니다") -> None:
        self.transcript = transcript
        self.last_audio: AudioContent | None = None

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        self.last_audio = audio
        return ProviderTranscription(
            transcript=self.transcript,
            language="ko-KR",
            provider=self.name,
            model=self.model,
            duration_seconds=3.5,
            segments=[
                TranscriptSegment(
                    text=self.transcript,
                    startSeconds=0,
                    endSeconds=3.5,
                )
            ],
        )


class FailingSpeechToTextProvider:
    name = "fake"
    model = "failing-transcriber"

    def transcribe(self, audio: AudioContent) -> ProviderTranscription:
        raise RuntimeError(f"failed for {audio.file_name}")


def test_transcribe_audio_returns_fixture_transcript(tmp_path: Path) -> None:
    audio_path = tmp_path / "rehearsal.wav"
    audio_path.write_bytes(b"fake wav bytes")
    provider = FakeSpeechToTextProvider()

    response = transcribe_rehearsal_audio(
        _request(audio_path),
        provider,
    )

    assert response.run_id == "run_demo_1"
    assert response.project_id == "project_demo_1"
    assert response.file_id == "file_demo_1"
    assert response.transcript == "안녕하세요 ORBIT 리허설입니다"
    assert response.language == "ko-KR"
    assert response.provider == "fake"
    assert response.model == "fake-transcriber"
    assert response.duration_seconds == 3.5
    assert len(response.segments) == 1
    assert provider.last_audio is not None
    assert provider.last_audio.data == b"fake wav bytes"


def test_transcribe_audio_wraps_provider_failure(tmp_path: Path) -> None:
    audio_path = tmp_path / "rehearsal.wav"
    audio_path.write_bytes(b"fake wav bytes")

    with pytest.raises(AudioTranscriptionError) as error:
        transcribe_rehearsal_audio(_request(audio_path), FailingSpeechToTextProvider())

    assert error.value.code == "stt_provider_failed"
    assert error.value.status_code == 502


def test_invalid_audio_reference_requires_readable_source() -> None:
    with pytest.raises(ValidationError, match="objectKey or storageUrl"):
        AudioTranscribeRequest.model_validate(
            {
                "runId": "run_demo_1",
                "projectId": "project_demo_1",
                "audio": {
                    "fileId": "file_demo_1",
                    "mimeType": "audio/wav",
                },
            }
        )


def test_missing_audio_file_returns_predictable_error(tmp_path: Path) -> None:
    with pytest.raises(AudioTranscriptionError) as error:
        transcribe_rehearsal_audio(
            _request(tmp_path / "missing.wav"),
            FakeSpeechToTextProvider(),
        )

    assert error.value.code == "file_access_failed"
    assert error.value.status_code == 404


def test_unsupported_stt_provider_is_explicit() -> None:
    config = load_config(VALID_ENV)

    with pytest.raises(AudioTranscriptionError) as error:
        create_speech_to_text_provider(config)

    assert error.value.code == "unsupported_provider"
    assert "STT_PROVIDER=sherpa" in error.value.message


def test_audio_transcribe_endpoint_uses_injected_provider(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    audio_path = tmp_path / "rehearsal.webm"
    audio_path.write_bytes(b"fake webm bytes")

    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)

    def provider_override() -> SpeechToTextProvider:
        return FakeSpeechToTextProvider("발표 키워드를 확인했습니다")

    app.dependency_overrides[get_speech_to_text_provider] = provider_override

    try:
        with TestClient(app) as client:
            response = client.post(
                "/audio/transcribe",
                json={
                    "runId": "run_demo_1",
                    "projectId": "project_demo_1",
                    "audio": {
                        "fileId": "file_demo_1",
                        "storageUrl": str(audio_path),
                        "mimeType": "audio/webm",
                    },
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["transcript"] == "발표 키워드를 확인했습니다"
    assert response.json()["segments"] == [
        {
            "text": "발표 키워드를 확인했습니다",
            "startSeconds": 0.0,
            "endSeconds": 3.5,
        }
    ]


def _request(audio_path: Path) -> AudioTranscribeRequest:
    return AudioTranscribeRequest.model_validate(
        {
            "runId": "run_demo_1",
            "projectId": "project_demo_1",
            "audio": {
                "fileId": "file_demo_1",
                "storageUrl": str(audio_path),
                "mimeType": "audio/wav",
            },
        }
    )
