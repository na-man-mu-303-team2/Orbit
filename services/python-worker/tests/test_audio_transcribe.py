import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.audio.transcribe import (
    AudioTranscribeRequest,
    AudioTranscriptionError,
    AudioContent,
    OpenAISpeechToTextProvider,
    ProviderTranscription,
    SpeechToTextProvider,
    TranscriptSegment,
    create_speech_to_text_provider,
    get_speech_to_text_provider,
    transcribe_rehearsal_audio,
)
from app.config import ConfigError, load_config
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


def test_audio_reference_accepts_flac_mime_type(tmp_path: Path) -> None:
    audio_path = tmp_path / "rehearsal.flac"
    audio_path.write_bytes(b"fake flac bytes")

    request = AudioTranscribeRequest.model_validate(
        {
            "runId": "run_demo_1",
            "projectId": "project_demo_1",
            "audio": {
                "fileId": "file_demo_1",
                "storageUrl": str(audio_path),
                "mimeType": "audio/flac",
            },
        }
    )

    assert request.audio.mime_type == "audio/flac"


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


def test_report_stt_provider_rejects_non_openai_values() -> None:
    with pytest.raises(ConfigError, match="REPORT_STT_PROVIDER"):
        load_config({**VALID_ENV, "REPORT_STT_PROVIDER": "sherpa"})


def test_whisperx_report_stt_provider_is_not_implemented_yet() -> None:
    config = load_config(
        {
            **VALID_ENV,
            "REPORT_STT_PROVIDER": "whisperx",
            "WHISPERX_API_URL": "https://whisperx.example.test/transcribe",
            "WHISPERX_API_KEY": "whisperx-test-key",
        }
    )

    with pytest.raises(AudioTranscriptionError) as error:
        create_speech_to_text_provider(config)

    assert error.value.code == "unsupported_provider"
    assert "아직 지원하지 않습니다" in error.value.message


def test_openai_stt_requires_api_key() -> None:
    config = load_config(VALID_ENV)

    with pytest.raises(AudioTranscriptionError) as error:
        create_speech_to_text_provider(config)

    assert error.value.code == "provider_not_configured"
    assert "OPENAI_API_KEY" in error.value.message


def test_gpt4o_transcribe_uses_json_response_format(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[dict[str, object]] = []

    class FakeTranscriptions:
        def create(self, **kwargs: object) -> dict[str, str]:
            calls.append(kwargs)
            return {"text": "테스트 전사"}

    class FakeOpenAI:
        def __init__(self, *, api_key: str) -> None:
            self.api_key = api_key
            self.audio = SimpleNamespace(transcriptions=FakeTranscriptions())

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeOpenAI))

    provider = OpenAISpeechToTextProvider(
        api_key="test-key",
        model="gpt-4o-transcribe",
        language="ko-KR",
    )
    result = provider.transcribe(
        AudioContent(
            data=b"fake webm bytes",
            file_name="rehearsal.webm",
            mime_type="audio/webm",
        )
    )

    assert result.transcript == "테스트 전사"
    assert calls[0]["response_format"] == "json"


def test_audio_reference_rejects_unsupported_openai_mime_type(
    tmp_path: Path,
) -> None:
    audio_path = tmp_path / "rehearsal.ogg"
    audio_path.write_bytes(b"fake ogg bytes")

    with pytest.raises(ValidationError, match="unsupported audio mime type"):
        AudioTranscribeRequest.model_validate(
            {
                "runId": "run_demo_1",
                "projectId": "project_demo_1",
                "audio": {
                    "fileId": "file_demo_1",
                    "storageUrl": str(audio_path),
                    "mimeType": "audio/ogg",
                },
            }
        )


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
