from __future__ import annotations

import math
import re

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from app.audio.analysis.models import DecodedAudio
from app.audio.source import load_audio_content
from app.audio.transcribe import (
    AudioTranscribeRequest,
    ReportSttProvider,
    TranscriptSegment,
    build_audio_transcribe_response,
    transcribe_audio_content,
)

FRAME_LENGTH = 2_048
HOP_LENGTH = 960
FRAME_INTERVAL_MS = 60
LOUDNESS_BUCKET_MS = 1_000
SPEED_BUCKET_MS = 5_000
ACTIVE_SPEECH_THRESHOLD_DB = -48.0
MINIMUM_PAUSE_MS = 250
MAXIMUM_TRANSCRIPT_SEGMENTS = 100
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


class SlidePracticeLoudnessSample(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    start_ms: int = Field(alias="startMs", ge=0, le=300_000)
    end_ms: int = Field(alias="endMs", gt=0, le=300_000)
    loudness_db: float = Field(alias="loudnessDb", ge=-100, le=0)


class SlidePracticeSpeedSample(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    start_ms: int = Field(alias="startMs", ge=0, le=300_000)
    end_ms: int = Field(alias="endMs", gt=0, le=300_000)
    syllables_per_second: float = Field(
        alias="syllablesPerSecond",
        ge=0,
        le=100,
    )


class SlidePracticeTranscriptSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    text: str = Field(min_length=1, max_length=1_000)
    start_ms: int = Field(alias="startMs", ge=0, le=300_000)
    end_ms: int = Field(alias="endMs", gt=0, le=300_000)


class SlidePracticePauseSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    start_ms: int = Field(alias="startMs", ge=0, le=300_000)
    end_ms: int = Field(alias="endMs", gt=0, le=300_000)
    duration_ms: int = Field(alias="durationMs", gt=0, le=300_000)


class SlidePracticeAudioResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    transcript: str
    provider: str
    mean_recognition_confidence: float | None = Field(
        default=None,
        alias="meanRecognitionConfidence",
    )
    voice: SlidePracticeVoiceMetrics
    loudness_samples: list[SlidePracticeLoudnessSample] = Field(
        alias="loudnessSamples",
        max_length=300,
    )
    speed_samples: list[SlidePracticeSpeedSample] = Field(
        alias="speedSamples",
        max_length=60,
    )
    transcript_segments: list[SlidePracticeTranscriptSegment] = Field(
        alias="transcriptSegments",
        max_length=MAXIMUM_TRANSCRIPT_SEGMENTS,
    )
    pause_segments: list[SlidePracticePauseSegment] = Field(
        alias="pauseSegments",
        max_length=MAXIMUM_TRANSCRIPT_SEGMENTS,
    )


def process_slide_practice_audio(
    payload: AudioTranscribeRequest,
    provider: ReportSttProvider,
) -> SlidePracticeAudioResponse:
    """Report STT와 서버 PCM 분석을 한 원본 로드에서 수행한다."""
    from app.audio.analysis.decoder import decode_audio

    audio_content = load_audio_content(payload.audio)
    provider_transcription = transcribe_audio_content(audio_content, provider)
    transcription = build_audio_transcribe_response(payload, provider_transcription)
    loudness_samples: list[SlidePracticeLoudnessSample] = []
    duration_ms = int(round((transcription.duration_seconds or 0) * 1_000))
    try:
        decoded_audio = decode_audio(audio_content)
        duration_ms = int(round(decoded_audio.duration_seconds * 1_000))
        voice = analyze_slide_practice_voice(decoded_audio)
        loudness_samples = build_slide_practice_loudness_samples(decoded_audio)
    except Exception:
        voice = _unmeasured_metrics(np.asarray([], dtype=np.float32))
    transcript_segments = build_slide_practice_transcript_segments(
        transcription.segments
    )
    return SlidePracticeAudioResponse(
        transcript=transcription.transcript,
        provider=transcription.provider,
        meanRecognitionConfidence=None,
        voice=voice,
        loudnessSamples=loudness_samples,
        speedSamples=build_slide_practice_speed_samples(
            transcription.segments,
            duration_ms,
        ),
        transcriptSegments=transcript_segments,
        pauseSegments=build_slide_practice_pause_segments(transcript_segments),
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


def build_slide_practice_loudness_samples(
    decoded_audio: DecodedAudio,
) -> list[SlidePracticeLoudnessSample]:
    samples = decoded_audio.samples
    if samples.size < FRAME_LENGTH:
        return []

    frames = np.lib.stride_tricks.sliding_window_view(samples, FRAME_LENGTH)[
        ::HOP_LENGTH
    ]
    frame_rms = np.sqrt(np.mean(np.square(frames, dtype=np.float64), axis=1))
    loudness = 20.0 * np.log10(np.maximum(frame_rms, RMS_FLOOR))
    frames_per_bucket = max(1, round(LOUDNESS_BUCKET_MS / FRAME_INTERVAL_MS))
    result: list[SlidePracticeLoudnessSample] = []
    for offset in range(0, loudness.size, frames_per_bucket):
        if len(result) >= 300:
            break
        bucket = loudness[offset : offset + frames_per_bucket]
        start_ms = offset * FRAME_INTERVAL_MS
        end_ms = min(
            300_000,
            int(round(decoded_audio.duration_seconds * 1_000)),
            (offset + bucket.size) * FRAME_INTERVAL_MS,
        )
        if end_ms <= start_ms:
            continue
        result.append(
            SlidePracticeLoudnessSample(
                startMs=start_ms,
                endMs=end_ms,
                loudnessDb=round(
                    max(-100.0, min(0.0, float(np.median(bucket)))),
                    4,
                ),
            )
        )
    return result


def build_slide_practice_speed_samples(
    segments: list[TranscriptSegment],
    duration_ms: int,
) -> list[SlidePracticeSpeedSample]:
    valid_segments = [
        segment
        for segment in segments
        if segment.start_seconds is not None
        and segment.end_seconds is not None
        and segment.end_seconds > segment.start_seconds
    ]
    if not valid_segments:
        return []

    resolved_duration_ms = min(
        300_000,
        max(
            duration_ms,
            int(math.ceil(max(segment.end_seconds or 0 for segment in valid_segments) * 1_000)),
        ),
    )
    bucket_count = min(60, math.ceil(resolved_duration_ms / SPEED_BUCKET_MS))
    syllables_by_bucket = [0.0] * bucket_count
    for segment in valid_segments:
        start_ms = float(segment.start_seconds or 0) * 1_000
        end_ms = float(segment.end_seconds or 0) * 1_000
        segment_duration_ms = end_ms - start_ms
        syllable_count = _count_spoken_syllables(segment.text)
        if syllable_count <= 0 or segment_duration_ms <= 0:
            continue
        first_bucket = max(0, int(start_ms // SPEED_BUCKET_MS))
        last_bucket = min(bucket_count - 1, int((end_ms - 1) // SPEED_BUCKET_MS))
        for bucket_index in range(first_bucket, last_bucket + 1):
            bucket_start = bucket_index * SPEED_BUCKET_MS
            bucket_end = min(resolved_duration_ms, bucket_start + SPEED_BUCKET_MS)
            overlap_ms = max(
                0.0,
                min(end_ms, bucket_end) - max(start_ms, bucket_start),
            )
            syllables_by_bucket[bucket_index] += (
                syllable_count * overlap_ms / segment_duration_ms
            )

    return [
        SlidePracticeSpeedSample(
            startMs=index * SPEED_BUCKET_MS,
            endMs=min(resolved_duration_ms, (index + 1) * SPEED_BUCKET_MS),
            syllablesPerSecond=round(
                syllables / (
                    (min(resolved_duration_ms, (index + 1) * SPEED_BUCKET_MS)
                    - index * SPEED_BUCKET_MS) / 1_000
                ),
                4,
            ),
        )
        for index, syllables in enumerate(syllables_by_bucket)
        if min(resolved_duration_ms, (index + 1) * SPEED_BUCKET_MS)
        > index * SPEED_BUCKET_MS
    ]


def build_slide_practice_transcript_segments(
    segments: list[TranscriptSegment],
) -> list[SlidePracticeTranscriptSegment]:
    result: list[SlidePracticeTranscriptSegment] = []
    for segment in segments:
        text = segment.text.strip()
        if (
            not text
            or segment.start_seconds is None
            or segment.end_seconds is None
            or segment.end_seconds <= segment.start_seconds
        ):
            continue
        start_ms = max(0, min(300_000, int(round(segment.start_seconds * 1_000))))
        end_ms = max(0, min(300_000, int(round(segment.end_seconds * 1_000))))
        if end_ms <= start_ms:
            continue
        result.append(
            SlidePracticeTranscriptSegment(
                text=text[:1_000],
                startMs=start_ms,
                endMs=end_ms,
            )
        )
        if len(result) >= MAXIMUM_TRANSCRIPT_SEGMENTS:
            break
    return sorted(result, key=lambda segment: (segment.start_ms, segment.end_ms))


def build_slide_practice_pause_segments(
    segments: list[SlidePracticeTranscriptSegment],
) -> list[SlidePracticePauseSegment]:
    result: list[SlidePracticePauseSegment] = []
    for previous, current in zip(segments, segments[1:], strict=False):
        duration_ms = current.start_ms - previous.end_ms
        if duration_ms < MINIMUM_PAUSE_MS:
            continue
        result.append(
            SlidePracticePauseSegment(
                startMs=previous.end_ms,
                endMs=current.start_ms,
                durationMs=duration_ms,
            )
        )
        if len(result) >= MAXIMUM_TRANSCRIPT_SEGMENTS:
            break
    return result


def _count_spoken_syllables(text: str) -> int:
    korean_syllables = len(re.findall(r"[가-힣]", text))
    remaining = re.sub(r"[가-힣]", " ", text)
    other_words = len(re.findall(r"[^\W_]+", remaining, flags=re.UNICODE))
    return korean_syllables + other_words


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
