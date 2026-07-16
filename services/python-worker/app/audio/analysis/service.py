from __future__ import annotations

from app.audio.analysis.decoder import decode_audio
from app.audio.analysis.models import (
    AudioAnalysisError,
    RehearsalVolumeAnalysis,
    unmeasured_volume_analysis,
)
from app.audio.analysis.volume import analyze_volume
from app.audio.models import AudioContent


def analyze_volume_safely(audio_content: AudioContent) -> RehearsalVolumeAnalysis:
    """음량 분석 실패를 제한된 unmeasured 결과로 변환한다."""
    try:
        decoded_audio = decode_audio(audio_content)
        return analyze_volume(decoded_audio)
    except AudioAnalysisError as exc:
        return unmeasured_volume_analysis(exc.reason_code)
    except Exception:
        return unmeasured_volume_analysis("ANALYSIS_FAILED")
