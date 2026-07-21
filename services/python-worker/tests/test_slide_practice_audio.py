import numpy as np
import pytest

from app.audio import slide_practice
from app.audio.analysis.models import DecodedAudio
from app.audio.models import AudioContent
from app.audio.slide_practice import (
    SlidePracticeAudioRequest,
    analyze_slide_practice_voice,
    build_slide_practice_loudness_samples,
    build_slide_practice_pause_segments,
    build_slide_practice_speed_samples,
    build_slide_practice_transcript_segments,
    process_slide_practice_audio,
)
from app.audio.transcribe import (
    AudioTranscriptionError,
    ProviderTranscription,
    TranscriptSegment,
)


class FakeProvider:
    name = "fake"

    def __init__(self, transcript: str, *, model: str) -> None:
        self.transcript = transcript
        self.model = model
        self.calls: list[AudioContent] = []

    def transcribe(self, audio: AudioContent, pronunciation_context=None):
        self.calls.append(audio)
        return ProviderTranscription(
            transcript=self.transcript,
            language="ko",
            provider=self.name,
            model=self.model,
            duration_seconds=4,
            segments=[TranscriptSegment(text=self.transcript, startSeconds=0, endSeconds=4)],
        )


class FailingProvider:
    name = "fake"
    model = "failing-model"

    def transcribe(self, audio: AudioContent, pronunciation_context=None):
        raise RuntimeError(f"failed for {audio.file_name}")


def _slide_request() -> SlidePracticeAudioRequest:
    return SlidePracticeAudioRequest.model_validate({
        "runId": "run-1",
        "projectId": "project-1",
        "audio": {
            "fileId": "file-1",
            "storageUrl": "/unused/rehearsal.webm",
            "mimeType": "audio/webm",
        },
        "fillerVerbatim": {
            "model": "gpt-4o-mini-transcribe",
            "prompt": "음, 어, 반복과 말더듬을 그대로 보존하세요.",
            "promptVersion": "korean-filler-verbatim-v1",
        },
    })


def test_runs_primary_and_filler_transcription_once_from_one_audio_load(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    audio = AudioContent(
        data=b"shared audio",
        file_name="rehearsal.webm",
        mime_type="audio/webm",
    )
    load_calls = 0

    def fake_load(_reference):
        nonlocal load_calls
        load_calls += 1
        return audio

    monkeypatch.setattr(slide_practice, "load_audio_content", fake_load)
    monkeypatch.setattr(
        "app.audio.analysis.decoder.decode_audio",
        lambda _audio: DecodedAudio(
            samples=np.asarray([], dtype=np.float32),
            sample_rate_hz=16_000,
            duration_seconds=4,
        ),
    )
    primary = FakeProvider("발표를 시작합니다", model="whisper-1")
    filler = FakeProvider("음 어 발표를 시작합니다", model="gpt-4o-mini-transcribe")

    result = process_slide_practice_audio(
        _slide_request(),
        primary,
        filler_provider=filler,
    )

    assert load_calls == 1
    assert primary.calls == [audio]
    assert filler.calls == [audio]
    assert result.transcript == "발표를 시작합니다"
    assert result.filler_verbatim.transcript == "음 어 발표를 시작합니다"
    assert result.filler_verbatim.state == "succeeded"


def test_keeps_primary_analysis_when_filler_transcription_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        slide_practice,
        "load_audio_content",
        lambda _reference: AudioContent(
            data=b"shared audio",
            file_name="rehearsal.webm",
            mime_type="audio/webm",
        ),
    )
    primary = FakeProvider("발표를 시작합니다", model="whisper-1")

    result = process_slide_practice_audio(
        _slide_request(),
        primary,
        filler_provider=FailingProvider(),
    )

    assert result.transcript == "발표를 시작합니다"
    assert result.filler_verbatim.state == "unavailable"
    assert result.filler_verbatim.transcript is None
    assert result.filler_verbatim.reason_code == "FILLER_VERBATIM_UNAVAILABLE"


def test_primary_transcription_failure_still_fails_the_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        slide_practice,
        "load_audio_content",
        lambda _reference: AudioContent(
            data=b"shared audio",
            file_name="rehearsal.webm",
            mime_type="audio/webm",
        ),
    )

    with pytest.raises(AudioTranscriptionError):
        process_slide_practice_audio(
            _slide_request(),
            FailingProvider(),
            filler_provider=FakeProvider(
                "음 어 발표를 시작합니다",
                model="gpt-4o-mini-transcribe",
            ),
        )


def test_analyzes_server_pcm_with_browser_compatible_metric_ranges() -> None:
    sample_rate = 16_000
    seconds = 4
    timeline = np.arange(sample_rate * seconds, dtype=np.float32) / sample_rate
    samples = (0.03 * np.sin(2 * np.pi * 180 * timeline)).astype(np.float32)

    metrics = analyze_slide_practice_voice(
        DecodedAudio(
            samples=samples,
            sample_rate_hz=sample_rate,
            duration_seconds=float(seconds),
        )
    )

    assert metrics.active_speech_ms > 3_000
    assert metrics.loudness_db is not None
    assert metrics.pitch_median_hz is not None
    assert 160 <= metrics.pitch_median_hz <= 200
    assert metrics.syllables_per_second is None


def test_builds_bounded_one_second_loudness_bars() -> None:
    sample_rate = 16_000
    seconds = 4
    timeline = np.arange(sample_rate * seconds, dtype=np.float32) / sample_rate
    samples = (0.03 * np.sin(2 * np.pi * 180 * timeline)).astype(np.float32)

    result = build_slide_practice_loudness_samples(
        DecodedAudio(
            samples=samples,
            sample_rate_hz=sample_rate,
            duration_seconds=float(seconds),
        )
    )

    assert 3 <= len(result) <= 4
    assert result[0].start_ms == 0
    assert result[-1].end_ms <= 4_000
    assert all(-100 <= sample.loudness_db <= 0 for sample in result)


def test_builds_five_second_speed_samples_without_returning_transcript() -> None:
    result = build_slide_practice_speed_samples(
        [
            TranscriptSegment(
                text="발표를 시작합니다",
                startSeconds=0,
                endSeconds=4,
            ),
            TranscriptSegment(
                text="핵심 내용을 설명합니다",
                startSeconds=6,
                endSeconds=10,
            ),
        ],
        10_000,
    )

    assert [(sample.start_ms, sample.end_ms) for sample in result] == [
        (0, 5_000),
        (5_000, 10_000),
    ]
    assert all(sample.syllables_per_second > 0 for sample in result)
    assert "text" not in result[0].model_dump(by_alias=True)


def test_builds_bounded_transcript_memory_segments_and_pause_ranges() -> None:
    transcript_segments = build_slide_practice_transcript_segments(
        [
            TranscriptSegment(
                text="첫 문장을 설명합니다",
                startSeconds=0,
                endSeconds=2,
            ),
            TranscriptSegment(
                text="두 번째 문장을 설명합니다",
                startSeconds=3.2,
                endSeconds=5,
            ),
        ]
    )
    pauses = build_slide_practice_pause_segments(transcript_segments)

    assert transcript_segments[0].model_dump(by_alias=True) == {
        "text": "첫 문장을 설명합니다",
        "startMs": 0,
        "endMs": 2_000,
    }
    assert pauses[0].model_dump(by_alias=True) == {
        "startMs": 2_000,
        "endMs": 3_200,
        "durationMs": 1_200,
    }
