from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
import json
from typing import Any, Literal, Self, cast
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.ai.color_options import (
    DeckColorCustomizationRequest,
    DeckColorCustomizationResponse,
    DeckColorOptionsRequest,
    DeckColorOptionsResponse,
    customize_deck_color_palette,
    generate_deck_color_options,
)
from app.ai.deck_pptx_export import (
    DeckPptxExportRequest,
    DeckPptxExportResponse,
    export_deck_pptx,
)
from app.ai.design_agent import (
    DesignAgentGenerationError,
    DesignAgentRequest,
    DesignAgentResponse,
    generate_design_proposal,
)
from app.ai.generate_deck import (
    DeckContentGenerationError,
    GenerateDeckRequest,
    GenerateDeckResponse,
    ReferenceContext,
    generate_deck,
)
from app.ai.deck_generation.stage_runtime import (
    ContentPlanningStageInput,
    ContentPlanningStageResult,
    DesignPlanningStageInput,
    DesignPlanningStageResult,
    LayoutCompileStageInput,
    LayoutCompileStageResult,
    SlideComposeStageInput,
    SlideComposeStageResult,
    SourceGroundingStageInput,
    run_content_planning_stage,
    run_design_planning_stage,
    run_layout_compile_stage,
    run_slide_compose_stage,
    run_source_grounding_stage,
)
from app.ai.deck_generation.models import SourceGroundingResult
from app.ai.pptx_design_importer import (
    ImportedDesignAsset,
    PptxDesignImportResult,
)
from app.ai.pptx_ooxml_generation import (
    PptxOoxmlGenerationError,
    PptxOoxmlGenerationResult,
    PptxOoxmlSyncResult,
    UnsupportedPptxAspectRatioError,
    generate_pptx_ooxml,
    sync_pptx_ooxml,
)
from app.ai.pptx_ooxml_vector_importer import (
    import_pptx_design_with_optional_ooxml_vector,
)
from app.ai.visual_qa import (
    VisualQaRequest,
    VisualQaResponse,
    VisualQaUnavailableError,
    VisualRepairRequest,
    VisualRepairResponse,
    repair_deck_visuals,
    review_deck_visuals,
)
from app.ai.semantic_cues import (
    SemanticCueExtractionError,
    SemanticCueExtractionRequest,
    SemanticCueExtractionResponse,
    extract_semantic_cues,
)
from app.ai.speaker_notes import (
    SpeakerNotesSuggestionError,
    SpeakerNotesSuggestionRequest,
    SpeakerNotesSuggestionResponse,
    generate_speaker_notes_suggestion,
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
from app.audio.processing import (
    RehearsalAudioProcessingResponse,
    process_rehearsal_audio,
)
from app.audio.analysis.models import (
    RehearsalSilenceAnalysis,
    unmeasured_silence_analysis,
)
from app.challenge_qna import router as challenge_qna_router
from app.config import PythonWorkerConfig, load_config
from app.extraction import (
    ExtractConfig,
    ExtractedSection,
    ExtractionResult,
    clean_reference_text,
    extract_file,
    extract_presentation_keywords,
)
from app.focused_practice import router as focused_practice_router
from app.references import (
    PostgresReferenceRepository,
    index_reference_text,
    search_reference_chunks,
)
from app.rehearsal import (
    DeckKeyword,
    RunSeriesEntry,
    SlideTimelineEntry,
    analyze_rehearsal_metrics,
    generate_progress_comment,
    generate_rehearsal_coaching,
)
from app.semantic_rehearsal import (
    AnalyzeSemanticCuesRequest,
    AnalyzeSemanticCuesResponse,
    OpenAISemanticGrader,
    analyze_semantic_cues,
)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    app: str
    checked_at: datetime


def _planning_failure_detail(error: DeckContentGenerationError) -> dict[str, object]:
    message = str(error)
    if "SOURCE_GROUNDING_REQUIRED" in message:
        reason_code = "SOURCE_GROUNDING_REQUIRED"
    elif message.startswith("LLM deck content generation failed:"):
        reason_code = "CONTENT_LLM_PROVIDER_FAILURE"
    elif message.startswith("LLM returned empty deck content."):
        reason_code = "CONTENT_LLM_EMPTY_RESPONSE"
    elif message.startswith("LLM returned invalid deck content:"):
        reason_code = "CONTENT_LLM_INVALID_RESPONSE"
    elif message.startswith(
        (
            "LLM content plan reused content item IDs:",
            "LLM content plan referenced unavailable source IDs:",
            "UNSUPPORTED_NUMERIC_CLAIM:",
            "LLM returned fewer slides than the requested minimum",
        )
    ):
        reason_code = "CONTENT_LLM_INVALID_RESPONSE"
    elif message.startswith("LLM slide count repair failed:"):
        reason_code = "CONTENT_LLM_SLIDE_COUNT_REPAIR_FAILED"
    elif message.startswith(
        (
            "OPENAI_API_KEY is required for prompt or reference-based deck generation.",
            "LLM deck content generation is required for prompt or reference-based decks.",
        )
    ):
        reason_code = "CONTENT_LLM_PROVIDER_FAILURE"
    elif "Art Director could not create a valid design plan" in message:
        reason_code = "ART_DIRECTOR_INVALID_RESPONSE"
    elif "Art Director" in message and "unavailable" in message:
        reason_code = "ART_DIRECTOR_UNAVAILABLE"
    elif message.startswith(
        (
            "No composition supports",
            "No composition sequence satisfies",
            "Design Program slide count mismatch",
        )
    ):
        reason_code = "DESIGN_COMPOSITION_UNSUPPORTED"
    else:
        reason_code = "PLANNING_FAILURE_UNCLASSIFIED"

    detail: dict[str, object] = {"reasonCode": reason_code}
    if reason_code.startswith(("CONTENT_LLM_", "ART_DIRECTOR_")):
        detail["provider"] = "openai"
    provider_error: BaseException | None = error.__cause__
    for _ in range(3):
        if provider_error is None:
            break
        provider_status = getattr(provider_error, "status_code", None)
        if isinstance(provider_status, int) and 100 <= provider_status <= 599:
            detail["providerHttpStatus"] = provider_status
        provider_request_id = getattr(provider_error, "request_id", None)
        if (
            isinstance(provider_request_id, str)
            and 0 < len(provider_request_id) <= 256
        ):
            detail["providerRequestId"] = provider_request_id
        if "providerHttpStatus" in detail and "providerRequestId" in detail:
            break
        provider_error = provider_error.__cause__
    return detail


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


class DeckKeywordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    keyword_id: str = Field(default="", alias="keywordId")
    slide_id: str = Field(default="", alias="slideId")
    text: str
    synonyms: list[str] = Field(default_factory=list)
    abbreviations: list[str] = Field(default_factory=list)
    required: bool = False


class RehearsalSlideTimelineEntryRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    slide_id: str = Field(alias="slideId")
    entered_second: float = Field(alias="enteredSecond", ge=0)


class RehearsalAnalyzeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    deck_id: str = Field(alias="deckId")
    transcript: str
    language: str = Field(default="und", min_length=1, max_length=128)
    duration_seconds: float = Field(alias="durationSeconds", ge=0)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    deck_keywords: list[DeckKeywordRequest] = Field(
        default_factory=list,
        alias="deckKeywords",
    )
    slide_timeline: list[RehearsalSlideTimelineEntryRequest] = Field(
        default_factory=list,
        alias="slideTimeline",
    )
    silence_analysis: RehearsalSilenceAnalysis = Field(
        default_factory=lambda: unmeasured_silence_analysis(
            "LEGACY_REPORT",
            detector_version="unavailable",
        ),
        alias="silenceAnalysis",
    )


class RehearsalCoachingResponse(BaseModel):
    # 정상 응답에는 성공한 코칭 결과만 포함한다.
    status: Literal["succeeded"]
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    next_practice_focus: str = Field(default="", alias="nextPracticeFocus")
    message: str = ""


class RehearsalAiSummaryResponse(BaseModel):
    headline: str
    paragraphs: list[str]


class RehearsalSpeedSampleResponse(BaseModel):
    start_second: float = Field(alias="startSecond", ge=0)
    end_second: float = Field(alias="endSecond", ge=0)
    words_per_minute: float = Field(alias="wordsPerMinute", ge=0)


class RehearsalFillerWordDetailResponse(BaseModel):
    word: str
    count: int = Field(ge=0)


class RehearsalMissedKeywordResponse(BaseModel):
    slide_id: str = Field(alias="slideId")
    keyword_id: str = Field(alias="keywordId")
    text: str


class RehearsalSlideSpeakingRateResponse(BaseModel):
    metric_definition_version: Literal[1] = Field(alias="metricDefinitionVersion")
    measurement_state: Literal["measured", "unmeasured"] = Field(
        alias="measurementState"
    )
    reason_code: Literal[
        "UNSUPPORTED_LANGUAGE",
        "SEGMENT_TIMESTAMPS_UNAVAILABLE",
        "INSUFFICIENT_SLIDE_SPEECH",
        "BASELINE_UNAVAILABLE",
        "LEGACY_REPORT",
    ] | None = Field(alias="reasonCode")
    characters_per_second: float | None = Field(
        alias="charactersPerSecond",
        gt=0,
    )
    baseline_characters_per_second: float | None = Field(
        alias="baselineCharactersPerSecond",
        gt=0,
    )
    relative_rate_ratio: float | None = Field(alias="relativeRateRatio", gt=0)
    pace_category: Literal["slower", "similar", "faster"] | None = Field(
        alias="paceCategory"
    )
    active_speech_seconds: float = Field(alias="activeSpeechSeconds", ge=0)
    character_count: int = Field(alias="characterCount", ge=0)

    @model_validator(mode="after")
    def validate_measurement_state(self) -> Self:
        values = (
            self.characters_per_second,
            self.baseline_characters_per_second,
            self.relative_rate_ratio,
            self.pace_category,
        )
        if self.measurement_state == "measured":
            if self.reason_code is not None or any(value is None for value in values):
                raise ValueError("Measured speaking rate requires all values.")
        elif self.reason_code is None or any(value is not None for value in values):
            raise ValueError("Unmeasured speaking rate requires only a reason code.")
        return self


class RehearsalSlideInsightResponse(BaseModel):
    slide_id: str = Field(alias="slideId")
    filler_word_count: int = Field(alias="fillerWordCount", ge=0)
    long_silence_count: int | None = Field(alias="longSilenceCount", ge=0)
    speaking_rate: RehearsalSlideSpeakingRateResponse = Field(alias="speakingRate")


class RehearsalAnalyzeResponse(BaseModel):
    run_id: str = Field(alias="runId")
    words_per_minute: float = Field(alias="wordsPerMinute")
    filler_word_count: int = Field(alias="fillerWordCount")
    long_silence_count: int | None = Field(alias="longSilenceCount")
    keyword_coverage: float = Field(alias="keywordCoverage")
    speed_samples: list[RehearsalSpeedSampleResponse] = Field(
        default_factory=list,
        alias="speedSamples",
    )
    filler_word_details: list[RehearsalFillerWordDetailResponse] = Field(
        default_factory=list,
        alias="fillerWordDetails",
    )
    missed_keywords: list[RehearsalMissedKeywordResponse] = Field(
        default_factory=list,
        alias="missedKeywords",
    )
    slide_insights: list[RehearsalSlideInsightResponse] = Field(
        default_factory=list,
        alias="slideInsights",
    )
    ai_summary: RehearsalAiSummaryResponse = Field(alias="aiSummary")
    coaching: RehearsalCoachingResponse


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.config = load_config()
    yield


app = FastAPI(title="ORBIT Python Worker", version="0.1.0", lifespan=lifespan)
app.include_router(challenge_qna_router)
app.include_router(focused_practice_router)


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
    file: UploadFile = File(...),
    file_id: str = Form(...),
) -> PptxOoxmlGenerationResult:
    from pathlib import Path
    from tempfile import TemporaryDirectory

    with TemporaryDirectory(prefix="orbit-ooxml-") as temp_dir:
        source_path = Path(temp_dir) / Path(file.filename or "upload.pptx").name
        source_path.write_bytes(await file.read())
        try:
            return await run_in_threadpool(
                generate_pptx_ooxml,
                source_path,
                file_id,
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


@app.post("/audio/transcribe-private", response_model=AudioTranscribeResponse)
def transcribe_private_audio_endpoint(
    payload: AudioTranscribeRequest,
    provider: ReportSttProviderDependency,
) -> AudioTranscribeResponse:
    try:
        return transcribe_rehearsal_audio(payload, provider)
    except AudioTranscriptionError as exc:
        raise to_http_exception(exc) from exc


@app.post("/audio/transcribe", response_model=RehearsalAudioProcessingResponse)
def process_rehearsal_audio_endpoint(
    payload: AudioTranscribeRequest,
    provider: ReportSttProviderDependency,
) -> RehearsalAudioProcessingResponse:
    try:
        return process_rehearsal_audio(payload, provider)
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
            image_review_mode=(
                payload.image_review_mode or config.ai_slide_image_review_mode
            ),
        )
    except DeckContentGenerationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post(
    "/internal/ai/deck-generation/source-grounding",
    response_model=SourceGroundingResult,
)
def source_grounding_stage(
    payload: SourceGroundingStageInput,
    request: Request,
) -> SourceGroundingResult:
    config = _config(request)
    try:
        return run_source_grounding_stage(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except DeckContentGenerationError as error:
        raise HTTPException(
            status_code=503, detail=_planning_failure_detail(error)
        ) from error


@app.post(
    "/internal/ai/deck-generation/content-planning",
    response_model=ContentPlanningStageResult,
)
def content_planning_stage(
    payload: ContentPlanningStageInput,
    request: Request,
) -> ContentPlanningStageResult:
    config = _config(request)
    try:
        return run_content_planning_stage(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except DeckContentGenerationError as error:
        raise HTTPException(
            status_code=503, detail=_planning_failure_detail(error)
        ) from error


@app.post(
    "/internal/ai/deck-generation/design-planning",
    response_model=DesignPlanningStageResult,
)
def design_planning_stage(
    payload: DesignPlanningStageInput,
    request: Request,
) -> DesignPlanningStageResult:
    config = _config(request)
    try:
        return run_design_planning_stage(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except DeckContentGenerationError as error:
        raise HTTPException(
            status_code=503, detail=_planning_failure_detail(error)
        ) from error


@app.post(
    "/internal/ai/deck-generation/layout-compile",
    response_model=LayoutCompileStageResult,
)
def layout_compile_stage(
    payload: LayoutCompileStageInput,
    request: Request,
) -> LayoutCompileStageResult:
    config = _config(request)
    return run_layout_compile_stage(
        payload,
        model=config.openai_model,
        api_key=config.openai_api_key,
        image_review_mode=config.ai_slide_image_review_mode,
    )


@app.post(
    "/internal/ai/deck-generation/slide-compose",
    response_model=SlideComposeStageResult,
)
def slide_compose_stage(
    payload: SlideComposeStageInput,
    request: Request,
) -> SlideComposeStageResult:
    config = _config(request)
    try:
        return run_slide_compose_stage(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except DeckContentGenerationError as error:
        raise HTTPException(
            status_code=503, detail=_planning_failure_detail(error)
        ) from error


@app.post("/ai/deck-color-options", response_model=DeckColorOptionsResponse)
def generate_ai_deck_color_options(
    payload: DeckColorOptionsRequest,
    request: Request,
) -> DeckColorOptionsResponse:
    config = _config(request)
    return generate_deck_color_options(
        payload,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )


@app.post(
    "/ai/deck-color-customization",
    response_model=DeckColorCustomizationResponse,
)
def generate_ai_deck_color_customization(
    payload: DeckColorCustomizationRequest,
    request: Request,
) -> DeckColorCustomizationResponse:
    config = _config(request)
    return customize_deck_color_palette(
        payload,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )


@app.post(
    "/ai/design-agent/propose",
    response_model=DesignAgentResponse,
    response_model_exclude_none=True,
)
def propose_slide_design(
    payload: DesignAgentRequest,
    request: Request,
) -> DesignAgentResponse:
    config = _config(request)
    try:
        return generate_design_proposal(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except DesignAgentGenerationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/ai/export-deck-pptx", response_model=DeckPptxExportResponse)
def export_ai_deck_pptx(payload: DeckPptxExportRequest) -> DeckPptxExportResponse:
    return export_deck_pptx(payload)


@app.post("/ai/review-deck-visuals", response_model=VisualQaResponse)
def review_ai_deck_visuals(
    payload: VisualQaRequest,
    request: Request,
) -> VisualQaResponse:
    config = _config(request)
    try:
        return review_deck_visuals(
            payload,
            model=config.ai_ppt_visual_qa_model or config.openai_model,
            api_key=config.openai_api_key,
        )
    except VisualQaUnavailableError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/ai/repair-deck-visuals", response_model=VisualRepairResponse)
def repair_ai_deck_visuals(payload: VisualRepairRequest) -> VisualRepairResponse:
    return repair_deck_visuals(payload)


@app.post("/ai/extract-semantic-cues", response_model=SemanticCueExtractionResponse)
def extract_semantic_cues_endpoint(
    payload: SemanticCueExtractionRequest,
    request: Request,
) -> SemanticCueExtractionResponse:
    config = _config(request)
    try:
        return extract_semantic_cues(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except SemanticCueExtractionError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post(
    "/ai/speaker-notes/suggest",
    response_model=SpeakerNotesSuggestionResponse,
)
def suggest_speaker_notes(
    payload: SpeakerNotesSuggestionRequest,
    request: Request,
) -> SpeakerNotesSuggestionResponse:
    config = _config(request)
    try:
        return generate_speaker_notes_suggestion(
            payload,
            model=config.openai_model,
            api_key=config.openai_api_key,
        )
    except SpeakerNotesSuggestionError as error:
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
            required=keyword.required,
        )
        for keyword in payload.deck_keywords
    ]
    metrics = analyze_rehearsal_metrics(
        transcript=payload.transcript,
        language=payload.language,
        duration_seconds=payload.duration_seconds,
        segments=payload.segments,
        deck_keywords=deck_keywords,
        slide_timeline=[
            SlideTimelineEntry(
                slide_id=entry.slide_id,
                entered_second=entry.entered_second,
            )
            for entry in payload.slide_timeline
        ],
        silence_analysis=payload.silence_analysis,
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

    ai_summary_headline = (
        coaching.ai_summary_headline
        or coaching.summary
        or "리허설 총평을 생성하지 못했습니다."
    )
    ai_summary_paragraphs = [
        paragraph for paragraph in coaching.ai_summary_paragraphs if paragraph.strip()
    ] or [coaching.summary or ai_summary_headline]

    return RehearsalAnalyzeResponse(
        runId=payload.run_id,
        wordsPerMinute=metrics.words_per_minute,
        fillerWordCount=metrics.filler_word_count,
        longSilenceCount=metrics.long_silence_count,
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
        missedKeywords=[
            RehearsalMissedKeywordResponse(
                slideId=keyword.slide_id,
                keywordId=keyword.keyword_id,
                text=keyword.text,
            )
            for keyword in metrics.missed_keywords
        ],
        slideInsights=[
            RehearsalSlideInsightResponse(
                slideId=insight.slide_id,
                fillerWordCount=insight.filler_word_count,
                longSilenceCount=insight.long_silence_count,
                speakingRate=RehearsalSlideSpeakingRateResponse(
                    metricDefinitionVersion=(
                        insight.speaking_rate.metric_definition_version
                    ),
                    measurementState=insight.speaking_rate.measurement_state,
                    reasonCode=insight.speaking_rate.reason_code,
                    charactersPerSecond=(
                        insight.speaking_rate.characters_per_second
                    ),
                    baselineCharactersPerSecond=(
                        insight.speaking_rate.baseline_characters_per_second
                    ),
                    relativeRateRatio=insight.speaking_rate.relative_rate_ratio,
                    paceCategory=insight.speaking_rate.pace_category,
                    activeSpeechSeconds=insight.speaking_rate.active_speech_seconds,
                    characterCount=insight.speaking_rate.character_count,
                ),
            )
            for insight in metrics.slide_insights
        ],
        aiSummary=RehearsalAiSummaryResponse(
            headline=ai_summary_headline,
            paragraphs=ai_summary_paragraphs[:3],
        ),
        coaching=RehearsalCoachingResponse(
            status="succeeded",
            summary=coaching.summary,
            strengths=coaching.strengths,
            improvements=coaching.improvements,
            nextPracticeFocus=coaching.next_practice_focus,
            message=coaching.message,
        ),
    )


@app.post(
    "/rehearsal/analyze-semantic-cues",
    response_model=AnalyzeSemanticCuesResponse,
)
def analyze_rehearsal_semantic_cues(
    payload: AnalyzeSemanticCuesRequest,
    request: Request,
) -> AnalyzeSemanticCuesResponse:
    config = _config(request)
    return analyze_semantic_cues(
        payload,
        grader=OpenAISemanticGrader(
            model=config.openai_model,
            api_key=config.openai_api_key,
        ),
    )


class RehearsalProgressRunEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    run_id: str = Field(alias="runId")
    created_at: str = Field(alias="createdAt")
    duration_seconds: float = Field(alias="durationSeconds", ge=0)


class RehearsalProgressCommentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    run_series: list[RehearsalProgressRunEntry] = Field(alias="runSeries")


class RehearsalProgressCommentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    project_id: str = Field(alias="projectId")
    comment: str | None = None


@app.post(
    "/rehearsal/progress-comment", response_model=RehearsalProgressCommentResponse
)
def rehearsal_progress_comment(
    payload: RehearsalProgressCommentRequest,
    request: Request,
) -> RehearsalProgressCommentResponse:
    config = _config(request)
    run_series = [
        RunSeriesEntry(
            run_id=e.run_id,
            created_at=e.created_at,
            duration_seconds=e.duration_seconds,
        )
        for e in payload.run_series
    ]
    comment = generate_progress_comment(
        run_series=run_series,
        model=config.openai_model,
        api_key=config.openai_api_key,
    )
    return RehearsalProgressCommentResponse(
        projectId=payload.project_id, comment=comment
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
            file_ids=sorted(file_ids),
            model=config.openai_embedding_model,
            api_key=config.openai_api_key,
        )
    except Exception:
        return direct_context[:6]

    searched_context = [
        ReferenceContext(
            fileId=result.file_id,
            sourceId=f"uploaded:{result.file_id}:{result.chunk_id}",
            chunkId=result.chunk_id,
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
