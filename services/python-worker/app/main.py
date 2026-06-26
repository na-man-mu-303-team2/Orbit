from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app: str
    checked_at: datetime


class ReferenceExtractRequest(BaseModel):
    file_id: str = Field(alias="fileId")
    project_id: str = Field(alias="projectId")
    mime_type: str = Field(alias="mimeType")


class ReferenceExtractResponse(BaseModel):
    file_id: str = Field(alias="fileId")
    project_id: str = Field(alias="projectId")
    text: str


class RehearsalAnalyzeRequest(BaseModel):
    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    deck_id: str = Field(alias="deckId")
    transcript: str
    duration_seconds: float = Field(alias="durationSeconds", ge=0)


class RehearsalAnalyzeResponse(BaseModel):
    run_id: str = Field(alias="runId")
    words_per_minute: float = Field(alias="wordsPerMinute")
    filler_word_count: int = Field(alias="fillerWordCount")
    pause_count: int = Field(alias="pauseCount")
    keyword_coverage: float = Field(alias="keywordCoverage")


app = FastAPI(title="ORBIT Python Worker", version="0.1.0")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app="orbit-python-worker",
        checked_at=datetime.now(UTC),
    )


@app.post("/extract/reference", response_model=ReferenceExtractResponse)
def extract_reference(payload: ReferenceExtractRequest) -> ReferenceExtractResponse:
    return ReferenceExtractResponse(
        fileId=payload.file_id,
        projectId=payload.project_id,
        text=f"stub extraction for {payload.file_id} ({payload.mime_type})",
    )


@app.post("/rehearsal/analyze", response_model=RehearsalAnalyzeResponse)
def analyze_rehearsal(
    payload: RehearsalAnalyzeRequest,
) -> RehearsalAnalyzeResponse:
    words = [word for word in payload.transcript.split() if word.strip()]
    minutes = max(payload.duration_seconds / 60, 1 / 60)

    return RehearsalAnalyzeResponse(
        runId=payload.run_id,
        wordsPerMinute=round(len(words) / minutes, 2),
        fillerWordCount=0,
        pauseCount=0,
        keywordCoverage=0.0,
    )

