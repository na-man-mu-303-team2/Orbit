from __future__ import annotations

from pydantic import ConfigDict, Field

from app.audio.analysis.models import RehearsalVolumeAnalysis
from app.audio.analysis.service import analyze_volume_safely
from app.audio.source import load_audio_content
from app.audio.transcribe import (
    AudioTranscribeRequest,
    AudioTranscribeResponse,
    ReportSttProvider,
    build_audio_transcribe_response,
    transcribe_audio_content,
)


class RehearsalAudioProcessingResponse(AudioTranscribeResponse):
    model_config = ConfigDict(populate_by_name=True)

    volume_analysis: RehearsalVolumeAnalysis = Field(alias="volumeAnalysis")


def process_rehearsal_audio(
    payload: AudioTranscribeRequest,
    provider: ReportSttProvider,
) -> RehearsalAudioProcessingResponse:
    """원본 음성을 한 번 로드해 STT와 음량 분석에 공유한다."""
    audio_content = load_audio_content(payload.audio)
    provider_transcription = transcribe_audio_content(audio_content, provider)
    volume_analysis = analyze_volume_safely(audio_content)
    transcription_response = build_audio_transcribe_response(
        payload,
        provider_transcription,
    )

    return RehearsalAudioProcessingResponse(
        **transcription_response.model_dump(),
        volumeAnalysis=volume_analysis,
    )
