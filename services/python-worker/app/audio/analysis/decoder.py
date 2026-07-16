from __future__ import annotations

from io import BytesIO
from typing import Any

import av
import numpy as np

from app.audio.analysis.models import AudioAnalysisError, DecodedAudio
from app.audio.models import AudioContent

TARGET_SAMPLE_RATE_HZ = 16_000


def decode_audio(audio_content: AudioContent) -> DecodedAudio:
    """오디오 컨테이너를 mono float32 16kHz PCM으로 디코딩한다."""
    if not audio_content.data:
        raise AudioAnalysisError("EMPTY_AUDIO")

    try:
        with av.open(BytesIO(audio_content.data)) as container:
            audio_stream = next(
                (stream for stream in container.streams if stream.type == "audio"),
                None,
            )
            if audio_stream is None:
                raise AudioAnalysisError("NO_AUDIO_STREAM")

            resampler = av.AudioResampler(
                format="fltp",
                layout="mono",
                rate=TARGET_SAMPLE_RATE_HZ,
            )
            sample_chunks = _decode_sample_chunks(container, audio_stream, resampler)
    except AudioAnalysisError:
        raise
    except Exception as exc:
        raise AudioAnalysisError("AUDIO_DECODE_FAILED") from exc

    if not sample_chunks:
        raise AudioAnalysisError("EMPTY_AUDIO")

    samples = np.concatenate(sample_chunks).astype(np.float32, copy=False)
    if samples.size == 0:
        raise AudioAnalysisError("EMPTY_AUDIO")

    return DecodedAudio(
        samples=samples,
        sample_rate_hz=TARGET_SAMPLE_RATE_HZ,
        duration_seconds=float(samples.size / TARGET_SAMPLE_RATE_HZ),
    )


def _decode_sample_chunks(
    container: Any,
    audio_stream: Any,
    resampler: Any,
) -> list[np.ndarray[Any, np.dtype[np.float32]]]:
    sample_chunks: list[np.ndarray[Any, np.dtype[np.float32]]] = []
    for frame in container.decode(audio_stream):
        _append_resampled_frames(sample_chunks, resampler.resample(frame))

    _append_resampled_frames(sample_chunks, resampler.resample(None))
    return sample_chunks


def _append_resampled_frames(
    sample_chunks: list[np.ndarray[Any, np.dtype[np.float32]]],
    resampled_frames: Any,
) -> None:
    if resampled_frames is None:
        return
    frames = resampled_frames if isinstance(resampled_frames, list) else [resampled_frames]
    for frame in frames:
        frame_samples = np.asarray(frame.to_ndarray(), dtype=np.float32).reshape(-1)
        if frame_samples.size > 0:
            sample_chunks.append(frame_samples)
