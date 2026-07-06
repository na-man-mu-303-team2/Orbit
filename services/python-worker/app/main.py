from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
import json
from typing import Any, Literal, cast
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from app.ai.generate_deck import (
    DeckContentGenerationError,
    GenerateDeckRequest,
    GenerateDeckResponse,
    ReferenceContext,
    generate_deck,
)
from app.ai.pptx_design_importer import (
    ImportedDesignAsset,
    PptxDesignImportResult,
)
from app.ai.pptx_ooxml_generation import (
    PptxOoxmlGenerationError,
    PptxOoxmlGenerationResult,
    PptxOoxmlSyncResult,
    UnsupportedPptxAspectRatioError,
    apply_slot_texts_to_pptx_ooxml,
    generate_pptx_ooxml,
    sync_pptx_ooxml,
)
from app.ai.pptx_ooxml_vector_importer import (
    import_pptx_design_with_optional_ooxml_vector,
)
from app.audio.transcribe import (
    AudioTranscribeRequest,
    AudioTranscribeResponse,
    AudioTranscriptionError,
    ReportSttProviderDependency,
    TranscriptSegment,
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
from app.references import (
    PostgresReferenceRepository,
    ReferenceSearchResult,
    index_reference_text,
    search_reference_chunks,
)
from app.rehearsal import (
    DeckKeyword,
    analyze_rehearsal_metrics,
    generate_rehearsal_coaching,
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


class ReferenceIndexRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    project_id: str = Field(alias="projectId")
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReferenceIndexResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    file_id: str = Field(alias="fileId")
    project_id: str = Field(alias="projectId")
    status: str
    message: str = ""
    chunk_count: int = Field(alias="chunkCount")


class ReferenceSearchRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    query: str = Field(min_length=1)
    limit: int = Field(default=6, ge=1, le=20)


class ReferenceSearchChunk(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    chunk_id: str = Field(alias="chunkId")
    project_id: str = Field(alias="projectId")
    file_id: str = Field(alias="fileId")
    chunk_index: int = Field(alias="chunkIndex")
    content: str
    metadata: dict[str, Any]
    score: float


class ReferenceSearchResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    query: str
    status: Literal["succeeded", "unavailable", "failed"]
    message: str = ""
    chunks: list[ReferenceSearchChunk]


class QnaAnswerRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    session_id: str = Field(alias="sessionId")
    question_id: str = Field(alias="questionId")
    question_text: str = Field(alias="questionText", min_length=1)
    public_slide_context: str = Field(default="", alias="publicSlideContext")
    selected_reference_ids: list[str] = Field(
        default_factory=list,
        alias="selectedReferenceIds",
    )
    retrieval_limit: int = Field(default=5, alias="retrievalLimit", ge=1, le=20)
    confidence_threshold: float = Field(
        default=0.78,
        alias="confidenceThreshold",
        ge=0,
        le=1,
    )


class QnaAnswerResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Literal["answered", "failed"]
    answer_text: str | None = Field(default=None, alias="answerText")
    source_references: list[str] = Field(default_factory=list, alias="sourceReferences")
    confidence: float | None = None
    failure_reason: (
        Literal["low-confidence", "no-grounding", "timeout", "worker-error"] | None
    ) = Field(default=None, alias="failureReason")


@dataclass(frozen=True)
class QnaGroundingSource:
    source_reference: str
    content: str
    score: float


class DeckKeywordRequest(BaseModel):
    keyword_id: str = Field(default="", alias="keywordId")
    slide_id: str = Field(default="", alias="slideId")
    text: str
    synonyms: list[str] = Field(default_factory=list)
    abbreviations: list[str] = Field(default_factory=list)


class RehearsalAnalyzeRequest(BaseModel):
    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    deck_id: str = Field(alias="deckId")
    transcript: str
    duration_seconds: float = Field(alias="durationSeconds", ge=0)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    deck_keywords: list[DeckKeywordRequest] = Field(
        default_factory=list,
        alias="deckKeywords",
    )


class RehearsalCoachingResponse(BaseModel):
    # 정상 응답에는 성공한 코칭 결과만 포함한다.
    status: Literal["succeeded"]
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    next_practice_focus: str = Field(default="", alias="nextPracticeFocus")
    message: str = ""


class RehearsalSpeedSampleResponse(BaseModel):
    start_second: float = Field(alias="startSecond", ge=0)
    end_second: float = Field(alias="endSecond", ge=0)
    words_per_minute: float = Field(alias="wordsPerMinute", ge=0)


class RehearsalFillerWordDetailResponse(BaseModel):
    word: str
    count: int = Field(ge=0)


class RehearsalPauseDetailResponse(BaseModel):
    start_second: float = Field(alias="startSecond", ge=0)
    end_second: float = Field(alias="endSecond", ge=0)
    duration_seconds: float = Field(alias="durationSeconds", ge=0)


class RehearsalMissedKeywordResponse(BaseModel):
    slide_id: str = Field(alias="slideId")
    keyword_id: str = Field(alias="keywordId")
    text: str


class RehearsalAnalyzeResponse(BaseModel):
    run_id: str = Field(alias="runId")
    words_per_minute: float = Field(alias="wordsPerMinute")
    filler_word_count: int = Field(alias="fillerWordCount")
    pause_count: int = Field(alias="pauseCount")
    keyword_coverage: float = Field(alias="keywordCoverage")
    speed_samples: list[RehearsalSpeedSampleResponse] = Field(
        default_factory=list,
        alias="speedSamples",
    )
    filler_word_details: list[RehearsalFillerWordDetailResponse] = Field(
        default_factory=list,
        alias="fillerWordDetails",
    )
    pause_details: list[RehearsalPauseDetailResponse] = Field(
        default_factory=list,
        alias="pauseDetails",
    )
    missed_keywords: list[RehearsalMissedKeywordResponse] = Field(
        default_factory=list,
        alias="missedKeywords",
    )
    coaching: RehearsalCoachingResponse


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


@app.post("/qna/answer", response_model=QnaAnswerResponse)
def answer_qna(payload: QnaAnswerRequest, request: Request) -> QnaAnswerResponse:
    config = _config(request)
    public_context = payload.public_slide_context.strip()
    grounding_sources = build_qna_grounding_sources(
        config=config,
        public_context=public_context,
        project_id=payload.project_id,
        question_text=payload.question_text,
        selected_reference_ids=payload.selected_reference_ids,
        retrieval_limit=payload.retrieval_limit,
    )
    source_references = unique_source_references(grounding_sources)
    if not source_references:
        return QnaAnswerResponse(
            status="failed",
            failureReason="no-grounding",
            confidence=0,
        )

    if not config.openai_api_key:
        return QnaAnswerResponse(
            status="failed",
            failureReason="no-grounding",
            sourceReferences=source_references,
            confidence=0,
        )

    confidence = max(source.score for source in grounding_sources)
    if confidence < payload.confidence_threshold:
        return QnaAnswerResponse(
            status="failed",
            failureReason="low-confidence",
            sourceReferences=source_references,
            confidence=confidence,
        )

    answer_text = generate_grounded_qna_answer(
        question_text=payload.question_text,
        grounding_sources=grounding_sources,
        model=config.openai_model,
        api_key=config.openai_api_key,
        client=getattr(request.app.state, "qna_chat_client", None),
    )
    if not answer_text:
        return QnaAnswerResponse(
            status="failed",
            failureReason="worker-error",
            sourceReferences=source_references,
            confidence=confidence,
        )

    return QnaAnswerResponse(
        status="answered",
        answerText=answer_text,
        sourceReferences=source_references,
        confidence=confidence,
    )


def build_qna_grounding_sources(
    *,
    config: PythonWorkerConfig,
    public_context: str,
    project_id: str,
    question_text: str,
    selected_reference_ids: list[str],
    retrieval_limit: int,
) -> list[QnaGroundingSource]:
    sources: list[QnaGroundingSource] = []
    if public_context:
        sources.append(
            QnaGroundingSource(
                source_reference=f"deck-slide:{public_context_title(public_context)}",
                content=public_context,
                score=0.82,
            )
        )

    selected_ids = selected_reference_ids
    if selected_ids and config.openai_api_key:
        results, _embedding_result = search_reference_chunks(
            repository=PostgresReferenceRepository(config.database_url),
            project_id=project_id,
            query=question_text,
            limit=retrieval_limit,
            file_ids=selected_ids,
            model=config.openai_embedding_model,
            api_key=config.openai_api_key,
        )
        sources.extend(qna_sources_from_reference_results(results))
    elif selected_ids:
        sources.extend(
            QnaGroundingSource(
                source_reference=f"reference-material:{reference_id}",
                content="",
                score=0,
            )
            for reference_id in selected_ids
        )

    return sources


def qna_sources_from_reference_results(
    results: list[ReferenceSearchResult],
) -> list[QnaGroundingSource]:
    sources: list[QnaGroundingSource] = []
    for result in results:
        title = (
            str(result.metadata.get("title") or result.metadata.get("fileName") or "")
            .strip()
            or result.file_id
        )
        sources.append(
            QnaGroundingSource(
                source_reference=f"reference-material:{title[:120]}",
                content=result.content,
                score=result.score,
            )
        )
    return sources


def public_context_title(public_context: str) -> str:
    first_line = public_context.splitlines()[0].strip()
    if first_line.lower().startswith("slide:"):
        first_line = first_line.split(":", 1)[1].strip()
    return (first_line or "현재 슬라이드")[:120]


def unique_source_references(sources: list[QnaGroundingSource]) -> list[str]:
    references: list[str] = []
    for source in sources:
        if source.source_reference not in references:
            references.append(source.source_reference)
    return references


def generate_grounded_qna_answer(
    *,
    question_text: str,
    grounding_sources: list[QnaGroundingSource],
    model: str,
    api_key: str | None,
    client: Any | None = None,
) -> str | None:
    client_object = client
    if client_object is None:
        if not api_key:
            return None
        from openai import OpenAI

        client_object = OpenAI(api_key=api_key)

    context = "\n\n".join(
        f"[{source.source_reference}]\n{source.content}".strip()
        for source in grounding_sources
        if source.content.strip()
    )
    try:
        response = client_object.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer only from the provided ORBIT audience Q&A "
                        "grounding context. If the context is insufficient, "
                        "say that the presenter should answer."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Question: {question_text}\n\nGrounding:\n{context}",
                },
            ],
        )
    except Exception:
        return None

    content = response.choices[0].message.content
    return str(content).strip() if content else None


@app.post("/extract/reference", response_model=ReferenceExtractResponse)
def extract_reference(payload: ReferenceExtractRequest) -> ReferenceExtractResponse:
    text = payload.text.strip()
    return ReferenceExtractResponse(
        fileId=payload.file_id,
        projectId=payload.project_id,
        text=text or f"stub extraction for {payload.file_id} ({payload.mime_type})",
    )


@app.post("/references/index", response_model=ReferenceIndexResponse)
def index_reference(
    payload: ReferenceIndexRequest,
    request: Request,
) -> ReferenceIndexResponse:
    config = _config(request)
    result = index_reference_text(
        repository=PostgresReferenceRepository(config.database_url),
        project_id=payload.project_id,
        file_id=payload.file_id,
        text=payload.text,
        metadata=payload.metadata,
        model=config.openai_embedding_model,
        api_key=config.openai_api_key,
    )

    return ReferenceIndexResponse(
        fileId=payload.file_id,
        projectId=payload.project_id,
        status=result.status,
        message=result.message,
        chunkCount=result.chunk_count,
    )


@app.post("/references/search", response_model=ReferenceSearchResponse)
def search_references(
    payload: ReferenceSearchRequest,
    request: Request,
) -> ReferenceSearchResponse:
    config = _config(request)
    results, embedding_result = search_reference_chunks(
        repository=PostgresReferenceRepository(config.database_url),
        project_id=payload.project_id,
        query=payload.query,
        limit=payload.limit,
        model=config.openai_embedding_model,
        api_key=config.openai_api_key,
    )

    return ReferenceSearchResponse(
        projectId=payload.project_id,
        query=payload.query,
        status=_search_status(embedding_result.status),
        message=embedding_result.message,
        chunks=[
            ReferenceSearchChunk(
                chunkId=result.chunk_id,
                projectId=result.project_id,
                fileId=result.file_id,
                chunkIndex=result.chunk_index,
                content=result.content,
                metadata=result.metadata,
                score=result.score,
            )
            for result in results
        ],
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


@app.post("/design/import-pptx", response_model=PptxDesignImportResult)
async def import_pptx_design_endpoint(
    files: list[UploadFile] = File(...),
    project_id: str = Form("default"),
    file_ids: list[str] | None = Form(None),
) -> PptxDesignImportResult:
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    from pathlib import Path
    from tempfile import TemporaryDirectory

    slides: list[dict[str, Any]] = []
    assets: list[ImportedDesignAsset] = []
    warnings: list[str] = []
    theme: dict[str, Any] | None = None
    template_blueprint: dict[str, Any] | None = None
    quality_report: dict[str, Any] | None = None

    with TemporaryDirectory(prefix="orbit-design-") as temp_dir:
        temp_path = Path(temp_dir)

        for index, upload in enumerate(files):
            safe_name = Path(upload.filename or "upload.pptx").name
            source_path = temp_path / safe_name
            source_path.write_bytes(await upload.read())
            file_id = (
                file_ids[index]
                if file_ids and index < len(file_ids) and file_ids[index].strip()
                else f"file_{uuid4()}"
            )
            result = await run_in_threadpool(
                import_pptx_design_with_optional_ooxml_vector,
                source_path,
                file_id,
            )
            remapped = _remap_import_asset_ids(result, len(assets))
            slides.extend(
                cast(list[dict[str, Any]], remapped.blueprint.get("slides", []))
            )
            assets.extend(remapped.assets)
            warnings.extend(remapped.warnings)
            if theme is None and isinstance(remapped.blueprint.get("theme"), dict):
                theme = cast(dict[str, Any], remapped.blueprint["theme"])
            if template_blueprint is None:
                template_blueprint = remapped.template_blueprint
            if quality_report is None:
                quality_report = remapped.quality_report

    return PptxDesignImportResult(
        blueprint={
            "projectId": project_id,
            "canvas": {"width": 1920, "height": 1080},
            "theme": theme or {},
            "slides": slides,
            "warnings": warnings,
        },
        templateBlueprint=template_blueprint or {},
        qualityReport=quality_report or {},
        assets=assets,
        warnings=warnings,
    )


@app.post("/ai/pptx-ooxml-generation", response_model=PptxOoxmlGenerationResult)
async def generate_pptx_ooxml_endpoint(
    request: Request,
    file: UploadFile = File(...),
    project_id: str = Form("default"),
    file_id: str = Form(...),
    topic: str = Form(""),
    prompt: str = Form(""),
) -> PptxOoxmlGenerationResult:
    from pathlib import Path
    from tempfile import TemporaryDirectory

    del project_id

    worker_config = _config(request)
    with TemporaryDirectory(prefix="orbit-ooxml-") as temp_dir:
        source_path = Path(temp_dir) / Path(file.filename or "upload.pptx").name
        source_path.write_bytes(await file.read())
        try:
            return await run_in_threadpool(
                generate_pptx_ooxml,
                source_path,
                file_id,
                topic=topic,
                prompt=prompt,
                api_key=worker_config.openai_api_key,
                model=worker_config.openai_model,
            )
        except UnsupportedPptxAspectRatioError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except PptxOoxmlGenerationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/ai/pptx-ooxml-sync", response_model=PptxOoxmlSyncResult)
async def sync_pptx_ooxml_endpoint(
    file: UploadFile = File(...),
    template_blueprint: str = Form(...),
    operations: str = Form(...),
    deck_canvas: str = Form(...),
    synced_deck_version: int = Form(...),
    render: bool = Form(True),
) -> PptxOoxmlSyncResult:
    from pathlib import Path
    from tempfile import TemporaryDirectory

    with TemporaryDirectory(prefix="orbit-ooxml-sync-") as temp_dir:
        source_path = Path(temp_dir) / Path(file.filename or "current.pptx").name
        source_path.write_bytes(await file.read())
        try:
            return await run_in_threadpool(
                sync_pptx_ooxml,
                source_path,
                template_blueprint=json.loads(template_blueprint),
                operations=json.loads(operations),
                deck_canvas=json.loads(deck_canvas),
                synced_deck_version=synced_deck_version,
                render=render,
            )
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except PptxOoxmlGenerationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/ai/pptx-ooxml-apply-slot-texts", response_model=PptxOoxmlSyncResult)
async def apply_pptx_ooxml_slot_texts_endpoint(
    file: UploadFile = File(...),
    template_blueprint: str = Form(...),
    slot_texts: str = Form(...),
    render: bool = Form(True),
) -> PptxOoxmlSyncResult:
    from pathlib import Path
    from tempfile import TemporaryDirectory

    with TemporaryDirectory(prefix="orbit-ooxml-apply-") as temp_dir:
        source_path = Path(temp_dir) / Path(file.filename or "current.pptx").name
        source_path.write_bytes(await file.read())
        try:
            raw_slot_texts = json.loads(slot_texts)
            if not isinstance(raw_slot_texts, list):
                raise ValueError("slot_texts must be a JSON array.")
            return await run_in_threadpool(
                apply_slot_texts_to_pptx_ooxml,
                source_path,
                template_blueprint=json.loads(template_blueprint),
                slot_texts=[str(text) for text in raw_slot_texts],
                render=render,
            )
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except PptxOoxmlGenerationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/audio/transcribe", response_model=AudioTranscribeResponse)
def transcribe_audio(
    payload: AudioTranscribeRequest,
    provider: ReportSttProviderDependency,
) -> AudioTranscribeResponse:
    try:
        return transcribe_rehearsal_audio(payload, provider)
    except AudioTranscriptionError as exc:
        raise to_http_exception(exc) from exc


@app.post("/ai/generate-deck", response_model=GenerateDeckResponse)
def generate_ai_deck(
    payload: GenerateDeckRequest,
    request: Request,
) -> GenerateDeckResponse:
    config = _config(request)
    try:
        return generate_deck(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
            reference_context=_generate_deck_reference_context(payload, config),
            image_review_mode=config.ai_slide_image_review_mode,
        )
    except DeckContentGenerationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/rehearsal/analyze", response_model=RehearsalAnalyzeResponse)
def analyze_rehearsal(
    request: Request,
    payload: RehearsalAnalyzeRequest,
) -> RehearsalAnalyzeResponse:
    config = _config(request)
    deck_keywords = [
        DeckKeyword(
            keyword_id=keyword.keyword_id,
            slide_id=keyword.slide_id,
            text=keyword.text,
            synonyms=keyword.synonyms,
            abbreviations=keyword.abbreviations,
        )
        for keyword in payload.deck_keywords
    ]
    metrics = analyze_rehearsal_metrics(
        transcript=payload.transcript,
        duration_seconds=payload.duration_seconds,
        segments=payload.segments,
        deck_keywords=deck_keywords,
    )
    coaching = generate_rehearsal_coaching(
        transcript=payload.transcript,
        metrics=metrics,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )
    # 코칭 생성 실패는 부분 성공으로 숨기지 않고 API 오류로 반환한다.
    if coaching.status != "succeeded":
        raise _coaching_http_exception(coaching.status, coaching.message)

    return RehearsalAnalyzeResponse(
        runId=payload.run_id,
        wordsPerMinute=metrics.words_per_minute,
        fillerWordCount=metrics.filler_word_count,
        pauseCount=metrics.pause_count,
        keywordCoverage=metrics.keyword_coverage,
        speedSamples=[
            RehearsalSpeedSampleResponse(
                startSecond=sample.start_second,
                endSecond=sample.end_second,
                wordsPerMinute=sample.words_per_minute,
            )
            for sample in metrics.speed_samples
        ],
        fillerWordDetails=[
            RehearsalFillerWordDetailResponse(
                word=detail.word,
                count=detail.count,
            )
            for detail in metrics.filler_word_details
        ],
        pauseDetails=[
            RehearsalPauseDetailResponse(
                startSecond=detail.start_second,
                endSecond=detail.end_second,
                durationSeconds=detail.duration_seconds,
            )
            for detail in metrics.pause_details
        ],
        missedKeywords=[
            RehearsalMissedKeywordResponse(
                slideId=keyword.slide_id,
                keywordId=keyword.keyword_id,
                text=keyword.text,
            )
            for keyword in metrics.missed_keywords
        ],
        coaching=RehearsalCoachingResponse(
            status="succeeded",
            summary=coaching.summary,
            strengths=coaching.strengths,
            improvements=coaching.improvements,
            nextPracticeFocus=coaching.next_practice_focus,
            message=coaching.message,
        ),
    )


def _remap_import_asset_ids(
    result: PptxDesignImportResult,
    offset: int,
) -> PptxDesignImportResult:
    if offset == 0:
        return result

    replacements: dict[str, str] = {}
    assets: list[ImportedDesignAsset] = []
    for index, asset in enumerate(result.assets, start=1):
        next_id = f"image_{offset + index}"
        replacements[f"asset:{asset.asset_id}"] = f"asset:{next_id}"
        assets.append(
            ImportedDesignAsset(
                assetId=next_id,
                fileName=asset.file_name.replace(asset.asset_id, next_id, 1),
                mimeType=asset.mime_type,
                contentBase64=asset.content_base64,
            )
        )

    return PptxDesignImportResult(
        blueprint=cast(
            dict[str, Any],
            _replace_import_asset_refs(result.blueprint, replacements),
        ),
        templateBlueprint=result.template_blueprint,
        qualityReport=result.quality_report,
        assets=assets,
        warnings=result.warnings,
    )


def _replace_import_asset_refs(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, str):
        return replacements.get(value, value)
    if isinstance(value, list):
        return [_replace_import_asset_refs(item, replacements) for item in value]
    if isinstance(value, dict):
        return {
            key: _replace_import_asset_refs(item, replacements)
            for key, item in value.items()
        }
    return value


def _config(request: Request) -> PythonWorkerConfig:
    return cast(PythonWorkerConfig, request.app.state.config)


def _search_status(status: str) -> Literal["succeeded", "unavailable", "failed"]:
    if status in {"succeeded", "unavailable"}:
        return cast(Literal["succeeded", "unavailable"], status)
    return "failed"


def _coaching_http_exception(status: str, message: str) -> HTTPException:
    # 코칭 실패 원인을 클라이언트가 구분할 수 있는 HTTP 상태로 변환한다.
    detail = message or "Rehearsal coaching failed."
    if status == "skipped":
        return HTTPException(status_code=400, detail=detail)
    if status == "unavailable":
        return HTTPException(status_code=503, detail=detail)
    return HTTPException(status_code=502, detail=detail)


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
    index_result = index_reference_text(
        repository=PostgresReferenceRepository(config.database_url),
        project_id=project_id,
        file_id=file_id,
        text=cleanup.text,
        metadata={
            "fileName": result.source_path.name,
            "kind": result.kind.value,
            "status": result.status.value,
        },
        model=config.openai_embedding_model,
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
        "indexingStatus": index_result.status,
        "indexingMessage": index_result.message,
        "chunkCount": index_result.chunk_count,
        "sections": [_section_payload(section) for section in result.sections],
    }


def _generate_deck_reference_context(
    payload: GenerateDeckRequest,
    config: PythonWorkerConfig,
) -> list[ReferenceContext]:
    file_ids = {reference.file_id for reference in payload.references}
    if not file_ids:
        return []

    direct_context = [
        item
        for item in payload.reference_context
        if item.file_id in file_ids and item.content.strip()
    ]

    query = " ".join(
        [
            payload.topic,
            payload.prompt,
            *[keyword.text for keyword in payload.reference_keywords],
        ]
    ).strip()

    try:
        results, _embedding_result = search_reference_chunks(
            repository=PostgresReferenceRepository(config.database_url),
            project_id=payload.project_id,
            query=query or payload.topic,
            limit=20,
            model=config.openai_embedding_model,
            api_key=config.openai_api_key,
        )
    except Exception:
        return direct_context[:6]

    searched_context = [
        ReferenceContext(
            fileId=result.file_id,
            title=str(result.metadata.get("fileName", "")),
            content=result.content,
        )
        for result in results
        if result.file_id in file_ids and result.content.strip()
    ]
    return unique_reference_context([*direct_context, *searched_context])[:6]


def unique_reference_context(items: list[ReferenceContext]) -> list[ReferenceContext]:
    seen: set[tuple[str, str]] = set()
    unique: list[ReferenceContext] = []
    for item in items:
        content = item.content.strip()
        key = (item.file_id, content)
        if not content or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


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
