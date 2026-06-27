from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.audio.transcribe import (
    AudioTranscribeRequest,
    AudioTranscribeResponse,
    AudioTranscriptionError,
    SttProviderDependency,
    to_http_exception,
    transcribe_rehearsal_audio,
)
from app.config import PythonWorkerConfig, load_config
from app.extraction import (
    ExtractConfig,
    ExtractedSection,
    ExtractionResult,
    clean_reference_text,
    extract_file,
    extract_presentation_keywords,
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app: str
    checked_at: datetime


class ReferenceExtractRequest(BaseModel):
    file_id: str = Field(alias="fileId")
    project_id: str = Field(alias="projectId")
    mime_type: str = Field(alias="mimeType")
    text: str = ""


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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.config = load_config()
    yield


app = FastAPI(title="ORBIT Python Worker", version="0.1.0", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app="orbit-python-worker",
        checked_at=datetime.now(UTC),
    )


@app.post("/extract/reference", response_model=ReferenceExtractResponse)
def extract_reference(payload: ReferenceExtractRequest) -> ReferenceExtractResponse:
    text = payload.text.strip()
    return ReferenceExtractResponse(
        fileId=payload.file_id,
        projectId=payload.project_id,
        text=text or f"stub extraction for {payload.file_id} ({payload.mime_type})",
    )


@app.post("/documents/parse")
async def parse_documents(
    request: Request,
    files: list[UploadFile] = File(...),
    project_id: str = Form("default"),
    file_ids: list[str] | None = Form(None),
) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    from pathlib import Path
    from tempfile import TemporaryDirectory

    worker_config = _config(request)
    extract_config = ExtractConfig()
    extracted_files: list[dict[str, Any]] = []

    with TemporaryDirectory(prefix="orbit-upload-") as temp_dir:
        temp_path = Path(temp_dir)

        for index, upload in enumerate(files):
            safe_name = Path(upload.filename or "upload").name
            source_path = temp_path / safe_name
            source_path.write_bytes(await upload.read())
            file_id = (
                file_ids[index]
                if file_ids and index < len(file_ids) and file_ids[index].strip()
                else f"file_{uuid4()}"
            )

            result = await run_in_threadpool(extract_file, source_path, extract_config)
            payload = await run_in_threadpool(
                _extract_result_payload,
                result,
                project_id,
                file_id,
                worker_config,
            )
            extracted_files.append(payload)

    return {"files": extracted_files}


@app.post("/audio/transcribe", response_model=AudioTranscribeResponse)
def transcribe_audio(
    payload: AudioTranscribeRequest,
    provider: SttProviderDependency,
) -> AudioTranscribeResponse:
    try:
        return transcribe_rehearsal_audio(payload, provider)
    except AudioTranscriptionError as exc:
        raise to_http_exception(exc) from exc


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


def _config(request: Request) -> PythonWorkerConfig:
    return cast(PythonWorkerConfig, request.app.state.config)


def _extract_result_payload(
    result: ExtractionResult,
    project_id: str,
    file_id: str,
    config: PythonWorkerConfig,
) -> dict[str, Any]:
    raw_text = _result_text(result)
    cleanup = clean_reference_text(
        raw_text,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )
    keyword_result = extract_presentation_keywords(
        cleanup.text,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )

    return {
        "projectId": project_id,
        "referenceDocumentId": file_id,
        "fileName": result.source_path.name,
        "kind": result.kind.value,
        "status": result.status.value,
        "message": result.message,
        "rawText": raw_text,
        "cleanedText": cleanup.text,
        "cleanupStatus": cleanup.status,
        "cleanupMessage": cleanup.message,
        "keywords": [
            {
                "keyword": keyword.keyword,
                "reason": keyword.reason,
                "priority": keyword.priority,
            }
            for keyword in keyword_result.keywords
        ],
        "keywordStatus": keyword_result.status,
        "keywordMessage": keyword_result.message,
        "indexingStatus": "skipped",
        "indexingMessage": "Reference indexing is handled by the RAG search branch.",
        "chunkCount": 0,
        "sections": [_section_payload(section) for section in result.sections],
    }


def _result_text(result: ExtractionResult) -> str:
    return "\n\n".join(
        section.text.strip() for section in result.sections if section.text.strip()
    )


def _section_payload(section: ExtractedSection) -> dict[str, Any]:
    return {
        "title": section.title,
        "status": section.status,
        "index": section.index,
        "text": section.text,
        "notes": section.notes,
        "metadata": section.metadata,
    }
