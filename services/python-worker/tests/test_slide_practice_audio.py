import numpy as np

from app.audio.analysis.models import DecodedAudio
from app.audio.slide_practice import (
    analyze_slide_practice_voice,
    build_slide_practice_loudness_samples,
    build_slide_practice_speed_samples,
)
from app.audio.transcribe import TranscriptSegment


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
