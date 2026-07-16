from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from threading import Lock
from typing import Any, Literal, Protocol

from app.audio.analysis.models import AudioAnalysisError, DecodedAudio

SPEECH_THRESHOLD = 0.5
MINIMUM_SPEECH_DURATION_MS = 250
MINIMUM_SILENCE_DURATION_MS: Literal[250] = 250
SPEECH_PADDING_MS = 30


@dataclass(frozen=True)
class SpeechRange:
    start_sample: int
    end_sample: int


class VoiceActivityDetector(Protocol):
    detector_version: str

    def detect_speech(self, decoded_audio: DecodedAudio) -> list[SpeechRange]:
        """디코딩된 파형의 발화 구간을 sample 단위로 반환한다."""
        ...


class SileroVoiceActivityDetector:
    """공식 Silero VAD 모델을 프로세스에서 재사용한다."""

    def __init__(self) -> None:
        try:
            import torch
            from silero_vad import (  # type: ignore[import-untyped]
                get_speech_timestamps,
                load_silero_vad,
            )

            torch.set_num_threads(1)
            self._torch = torch
            self._get_speech_timestamps = get_speech_timestamps
            self._model = load_silero_vad()
        except Exception as exc:
            raise AudioAnalysisError("VAD_INITIALIZATION_FAILED") from exc

        self.detector_version = _silero_version()
        self._inference_lock = Lock()

    def detect_speech(self, decoded_audio: DecodedAudio) -> list[SpeechRange]:
        audio_tensor = self._torch.from_numpy(decoded_audio.samples)
        try:
            with self._inference_lock:
                timestamps: list[dict[str, Any]] = self._get_speech_timestamps(
                    audio_tensor,
                    self._model,
                    threshold=SPEECH_THRESHOLD,
                    sampling_rate=decoded_audio.sample_rate_hz,
                    min_speech_duration_ms=MINIMUM_SPEECH_DURATION_MS,
                    min_silence_duration_ms=MINIMUM_SILENCE_DURATION_MS,
                    speech_pad_ms=SPEECH_PADDING_MS,
                    return_seconds=False,
                )
        except Exception as exc:
            raise AudioAnalysisError("ANALYSIS_FAILED") from exc

        return [_parse_speech_range(timestamp) for timestamp in timestamps]


@lru_cache(maxsize=1)
def get_voice_activity_detector() -> VoiceActivityDetector:
    """프로세스 공용 Silero VAD 인스턴스를 반환한다."""
    return SileroVoiceActivityDetector()


def installed_silero_version() -> str:
    """측정 불가 응답에도 사용할 설치 버전을 반환한다."""
    return _silero_version()


def _silero_version() -> str:
    try:
        return version("silero-vad")
    except PackageNotFoundError:
        return "unavailable"


def _parse_speech_range(timestamp: dict[str, Any]) -> SpeechRange:
    start_sample = timestamp.get("start")
    end_sample = timestamp.get("end")
    if not isinstance(start_sample, int) or not isinstance(end_sample, int):
        raise AudioAnalysisError("ANALYSIS_FAILED")
    if start_sample < 0 or end_sample <= start_sample:
        raise AudioAnalysisError("ANALYSIS_FAILED")
    return SpeechRange(start_sample=start_sample, end_sample=end_sample)
