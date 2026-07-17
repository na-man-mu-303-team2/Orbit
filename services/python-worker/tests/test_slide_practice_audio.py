import numpy as np

from app.audio.analysis.models import DecodedAudio
from app.audio.slide_practice import analyze_slide_practice_voice


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
