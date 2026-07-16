from __future__ import annotations

from typing import Literal, cast

from app.audio.analysis.decoder import decode_audio
from app.audio.analysis.models import (
    AudioAnalysisError,
    DecodedAudio,
    RehearsalSilenceAnalysis,
    RehearsalVolumeAnalysis,
    SilenceAnalysisReasonCode,
    VolumeAnalysisReasonCode,
    unmeasured_silence_analysis,
    unmeasured_volume_analysis,
)
from app.audio.analysis.silence import analyze_silence
from app.audio.analysis.vad import (
    VoiceActivityDetector,
    get_voice_activity_detector,
    installed_silero_version,
)
from app.audio.analysis.volume import analyze_volume
from app.audio.models import AudioContent


def analyze_audio_safely(
    audio_content: AudioContent,
    detector: VoiceActivityDetector | None = None,
) -> tuple[RehearsalVolumeAnalysis, RehearsalSilenceAnalysis]:
    """오디오를 한 번 디코딩하고 독립적인 분석 결과를 반환한다."""
    try:
        decoded_audio = decode_audio(audio_content)
    except AudioAnalysisError as exc:
        decode_reason = _decode_reason(exc)
        return (
            unmeasured_volume_analysis(decode_reason),
            unmeasured_silence_analysis(
                decode_reason,
                detector_version=installed_silero_version(),
            ),
        )
    except Exception:
        return (
            unmeasured_volume_analysis("ANALYSIS_FAILED"),
            unmeasured_silence_analysis(
                "ANALYSIS_FAILED",
                detector_version=installed_silero_version(),
            ),
        )

    return (
        analyze_decoded_volume_safely(decoded_audio),
        analyze_decoded_silence_safely(decoded_audio, detector),
    )


def analyze_volume_safely(audio_content: AudioContent) -> RehearsalVolumeAnalysis:
    """호환 호출을 위해 오디오를 디코딩하고 음량만 분석한다."""
    try:
        decoded_audio = decode_audio(audio_content)
    except AudioAnalysisError as exc:
        return unmeasured_volume_analysis(_decode_reason(exc))
    except Exception:
        return unmeasured_volume_analysis("ANALYSIS_FAILED")
    return analyze_decoded_volume_safely(decoded_audio)


def analyze_decoded_volume_safely(
    decoded_audio: DecodedAudio,
) -> RehearsalVolumeAnalysis:
    try:
        return analyze_volume(decoded_audio)
    except AudioAnalysisError as exc:
        return unmeasured_volume_analysis(_volume_reason(exc))
    except Exception:
        return unmeasured_volume_analysis("ANALYSIS_FAILED")


def analyze_decoded_silence_safely(
    decoded_audio: DecodedAudio,
    detector: VoiceActivityDetector | None = None,
) -> RehearsalSilenceAnalysis:
    detector_version = installed_silero_version()
    try:
        active_detector = detector or get_voice_activity_detector()
        detector_version = active_detector.detector_version
        return analyze_silence(decoded_audio, active_detector)
    except AudioAnalysisError as exc:
        return unmeasured_silence_analysis(
            _silence_reason(exc),
            detector_version=detector_version,
        )
    except Exception:
        return unmeasured_silence_analysis(
            "ANALYSIS_FAILED",
            detector_version=detector_version,
        )


def _decode_reason(
    error: AudioAnalysisError,
) -> Literal[
    "AUDIO_DECODE_FAILED", "NO_AUDIO_STREAM", "EMPTY_AUDIO", "ANALYSIS_FAILED"
]:
    if error.reason_code in {
        "AUDIO_DECODE_FAILED",
        "NO_AUDIO_STREAM",
        "EMPTY_AUDIO",
    }:
        return cast(
            Literal[
                "AUDIO_DECODE_FAILED",
                "NO_AUDIO_STREAM",
                "EMPTY_AUDIO",
                "ANALYSIS_FAILED",
            ],
            error.reason_code,
        )
    return "ANALYSIS_FAILED"


def _volume_reason(error: AudioAnalysisError) -> VolumeAnalysisReasonCode:
    if error.reason_code in {
        "AUDIO_DECODE_FAILED",
        "NO_AUDIO_STREAM",
        "EMPTY_AUDIO",
        "INSUFFICIENT_ACTIVE_AUDIO",
        "ANALYSIS_FAILED",
        "LEGACY_REPORT",
    }:
        return cast(VolumeAnalysisReasonCode, error.reason_code)
    return "ANALYSIS_FAILED"


def _silence_reason(error: AudioAnalysisError) -> SilenceAnalysisReasonCode:
    if error.reason_code in {
        "AUDIO_DECODE_FAILED",
        "NO_AUDIO_STREAM",
        "EMPTY_AUDIO",
        "INSUFFICIENT_SPEECH",
        "VAD_INITIALIZATION_FAILED",
        "ANALYSIS_FAILED",
        "LEGACY_REPORT",
    }:
        return cast(SilenceAnalysisReasonCode, error.reason_code)
    return "ANALYSIS_FAILED"
