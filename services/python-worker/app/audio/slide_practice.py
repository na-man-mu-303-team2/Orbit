from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from app.audio.analysis.models import DecodedAudio
from app.audio.source import load_audio_content
from app.audio.transcribe import (
    AudioTranscribeRequest,
    ReportSttProvider,
    build_audio_transcribe_response,
    transcribe_audio_content,
)

FRAME_LENGTH = 2_048
HOP_LENGTH = 960
FRAME_INTERVAL_MS = 60
ACTIVE_SPEECH_THRESHOLD_DB = -48.0
RMS_FLOOR = 1e-6


class SlidePracticeVoiceMetrics(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    active_speech_ms: int = Field(alias="activeSpeechMs", ge=0, le=300_000)
    pause_ratio: float = Field(alias="pauseRatio", ge=0, le=1)
    pitch_median_hz: float | None = Field(alias="pitchMedianHz")
    pitch_span_hz: float | None = Field(alias="pitchSpanHz")
    pitch_valid_ratio: float = Field(alias="pitchValidRatio", ge=0, le=1)
    loudness_db: float | None = Field(alias="loudnessDb")
    loudness_mad_db: float | None = Field(alias="loudnessMadDb")
    syllables_per_second: float | None = Field(alias="syllablesPerSecond")
    signal_to_noise_db: float | None = Field(alias="signalToNoiseDb")
    breathiness_ratio: float | None = Field(alias="breathinessRatio")
    clarity_ratio: float | None = Field(alias="clarityRatio")
    rhythm_regularity: float | None = Field(alias="rhythmRegularity")
    clipping_ratio: float = Field(alias="clippingRatio", ge=0, le=1)


class SlidePracticeAudioResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    transcript: str
    provider: str
    mean_recognition_confidence: float | None = Field(
        default=None,
        alias="meanRecognitionConfidence",
    )
    voice: SlidePracticeVoiceMetrics


def process_slide_practice_audio(
    payload: AudioTranscribeRequest,
    provider: ReportSttProvider,
) -> SlidePracticeAudioResponse:
    """Report STT와 서버 PCM 분석을 한 원본 로드에서 수행한다."""
    from app.audio.analysis.decoder import decode_audio

    audio_content = load_audio_content(payload.audio)
    provider_transcription = transcribe_audio_content(audio_content, provider)
    transcription = build_audio_transcribe_response(payload, provider_transcription)
    try:
        voice = analyze_slide_practice_voice(decode_audio(audio_content))
    except Exception:
        voice = _unmeasured_metrics(np.asarray([], dtype=np.float32))
    return SlidePracticeAudioResponse(
        transcript=transcription.transcript,
        provider=transcription.provider,
        meanRecognitionConfidence=None,
        voice=voice,
    )


def analyze_slide_practice_voice(
    decoded_audio: DecodedAudio,
) -> SlidePracticeVoiceMetrics:
    samples = decoded_audio.samples
    if samples.size < FRAME_LENGTH:
        return _unmeasured_metrics(samples)

    frames = np.lib.stride_tricks.sliding_window_view(samples, FRAME_LENGTH)[
        ::HOP_LENGTH
    ]
    frame_rms = np.sqrt(np.mean(np.square(frames, dtype=np.float64), axis=1))
    loudness_samples = 20.0 * np.log10(np.maximum(frame_rms, RMS_FLOOR))
    active_mask = loudness_samples >= ACTIVE_SPEECH_THRESHOLD_DB
    active_loudness = loudness_samples[active_mask]
    total_frames = int(frame_rms.size)
    active_frames = int(active_mask.sum())
    active_speech_ms = min(300_000, active_frames * FRAME_INTERVAL_MS)
    pause_ratio = 1.0 if total_frames == 0 else 1.0 - active_frames / total_frames

    loudness_db = _median(active_loudness)
    loudness_mad_db = (
        None
        if loudness_db is None
        else _median(np.abs(active_loudness - loudness_db))
    )
    pitch_samples = _pitch_samples(
        frames,
        active_mask,
        decoded_audio.sample_rate_hz,
    )
    pitch_median_hz = _median(pitch_samples)
    pitch_span_hz = (
        None
        if pitch_samples.size < 4
        else _percentile(pitch_samples, 90) - _percentile(pitch_samples, 10)
    )
    pitch_valid_ratio = (
        0.0 if active_frames == 0 else min(1.0, pitch_samples.size / active_frames)
    )
    signal_to_noise_db = (
        None if loudness_db is None else max(0.0, loudness_db - -60.0)
    )
    clipping_ratio = float(np.mean(np.abs(samples) >= 0.98))
    rhythm_regularity = (
        None
        if loudness_mad_db is None
        else max(0.0, min(1.0, 1.0 - loudness_mad_db / 16.0))
    )

    return SlidePracticeVoiceMetrics(
        activeSpeechMs=active_speech_ms,
        pauseRatio=_bounded(pause_ratio),
        pitchMedianHz=_rounded(pitch_median_hz),
        pitchSpanHz=_rounded(pitch_span_hz),
        pitchValidRatio=_bounded(pitch_valid_ratio),
        loudnessDb=_rounded(loudness_db),
        loudnessMadDb=_rounded(loudness_mad_db),
        syllablesPerSecond=None,
        signalToNoiseDb=_rounded(signal_to_noise_db),
        breathinessRatio=(
            _bounded(1.0 - pitch_valid_ratio) if pitch_valid_ratio > 0 else None
        ),
        clarityRatio=(
            None
            if signal_to_noise_db is None
            else _bounded(signal_to_noise_db / 30.0)
        ),
        rhythmRegularity=_rounded(rhythm_regularity),
        clippingRatio=_bounded(clipping_ratio),
    )


def _pitch_samples(
    frames: np.ndarray,
    active_mask: np.ndarray,
    sample_rate_hz: int,
) -> np.ndarray:
    active_frames = np.asarray(frames[active_mask], dtype=np.float64)
    if active_frames.size == 0:
        return np.asarray([], dtype=np.float64)
    lags = np.arange(
        sample_rate_hz // 420,
        min(sample_rate_hz // 70, FRAME_LENGTH - 1) + 1,
        2,
    )
    detected: list[np.ndarray] = []
    for offset in range(0, active_frames.shape[0], 256):
        batch = active_frames[offset : offset + 256]
        spectrum = np.fft.rfft(batch, n=FRAME_LENGTH * 2, axis=1)
        autocorrelation = np.fft.irfft(
            spectrum * np.conjugate(spectrum),
            n=FRAME_LENGTH * 2,
            axis=1,
        )[:, lags]
        squared = np.square(batch)
        cumulative = np.concatenate(
            [np.zeros((batch.shape[0], 1)), np.cumsum(squared, axis=1)],
            axis=1,
        )
        left_energy = cumulative[:, FRAME_LENGTH - lags]
        right_energy = cumulative[:, FRAME_LENGTH:] - cumulative[:, lags]
        denominator = np.sqrt(np.maximum(left_energy * right_energy, 1e-9))
        normalized = autocorrelation / denominator
        peak_correlations = np.max(normalized, axis=1)
        candidate_thresholds = np.maximum(0.55, peak_correlations - 0.02)
        best_indices = np.argmax(
            normalized >= candidate_thresholds[:, np.newaxis],
            axis=1,
        )
        best_correlations = normalized[np.arange(batch.shape[0]), best_indices]
        best_lags = lags[best_indices]
        detected.append(
            np.where(
                best_correlations >= 0.55,
                sample_rate_hz / best_lags,
                np.nan,
            )
        )
    pitches = np.concatenate(detected)
    return np.asarray(pitches[np.isfinite(pitches)], dtype=np.float64)


def _unmeasured_metrics(samples: np.ndarray) -> SlidePracticeVoiceMetrics:
    clipping_ratio = 0.0 if samples.size == 0 else float(np.mean(np.abs(samples) >= 0.98))
    return SlidePracticeVoiceMetrics(
        activeSpeechMs=0,
        pauseRatio=1,
        pitchMedianHz=None,
        pitchSpanHz=None,
        pitchValidRatio=0,
        loudnessDb=None,
        loudnessMadDb=None,
        syllablesPerSecond=None,
        signalToNoiseDb=None,
        breathinessRatio=None,
        clarityRatio=None,
        rhythmRegularity=None,
        clippingRatio=_bounded(clipping_ratio),
    )


def _median(values: np.ndarray) -> float | None:
    if values.size == 0:
        return None
    return float(np.percentile(values, 50, method="nearest"))


def _percentile(values: np.ndarray, percentile: int) -> float:
    return float(np.percentile(values, percentile, method="nearest"))


def _rounded(value: float | None) -> float | None:
    return None if value is None else round(float(value), 4)


def _bounded(value: float) -> float:
    return round(max(0.0, min(1.0, float(value))), 6)
