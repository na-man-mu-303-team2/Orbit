import type { StoragePort } from "@orbit/storage";
import {
  type Deck,
  deckPatchSchema,
  deckSchema,
  rehearsalReportSchema,
  rehearsalRunMetaSchema,
  type Job,
  type RehearsalReport,
  type RehearsalReportSlideTiming,
  type RehearsalRunMeta
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const rehearsalSttPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  deckId: z.string().min(1),
  audioFileId: z.string().min(1)
});

const audioAssetRowSchema = z.object({
  file_id: z.string().min(1),
  project_id: z.string().min(1),
  storage_key: z.string().min(1),
  mime_type: z.string().min(1),
  original_name: z.string().min(1),
  purpose: z.literal("rehearsal-audio"),
  status: z.literal("uploaded")
});

const deckRowSchema = z.object({
  deck_json: z.record(z.unknown()),
  version: z.number().int().nonnegative()
});

const deckPatchRowSchema = z.object({
  before_version: z.number().int().nonnegative(),
  after_version: z.number().int().nonnegative(),
  source: z.enum(["user", "ai", "import", "system"]).default("user"),
  operations: z.array(z.record(z.unknown()))
});

const rehearsalRunMetaRowSchema = z.object({
  meta_json: z.record(z.unknown()).nullable().optional()
});

const transcribeResponseSchema = z.object({
  runId: z.string().min(1),
  projectId: z.string().min(1),
  fileId: z.string().min(1),
  transcript: z.string(),
  language: z.string(),
  provider: z.string(),
  model: z.string(),
  durationSeconds: z.number().nullable().optional(),
  segments: z.array(z.record(z.unknown()))
});

const analyzeSpeedSampleSchema = z
  .object({
    startSecond: z.number().nonnegative(),
    endSecond: z.number().nonnegative(),
    wordsPerMinute: z.number().nonnegative()
  })
  .strict();

const analyzeFillerWordDetailSchema = z
  .object({
    word: z.string().trim().min(1),
    count: z.number().int().nonnegative()
  })
  .strict();

const analyzePauseDetailSchema = z
  .object({
    startSecond: z.number().nonnegative(),
    endSecond: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative()
  })
  .strict();

const analyzeMissedKeywordSchema = z
  .object({
    slideId: z.string().min(1),
    keywordId: z.string().min(1),
    text: z.string().trim().min(1)
  })
  .strict();

const analyzeAiSummarySchema = z
  .object({
    headline: z.string().trim().min(1),
    paragraphs: z.array(z.string().trim().min(1)).min(1).max(3)
  })
  .strict();

const analyzeResponseSchema = z.object({
  runId: z.string().min(1),
  wordsPerMinute: z.number().nonnegative(),
  fillerWordCount: z.number().int().nonnegative(),
  pauseCount: z.number().int().nonnegative(),
  keywordCoverage: z.number().min(0).max(1),
  speedSamples: z.array(analyzeSpeedSampleSchema).default([]),
  fillerWordDetails: z.array(analyzeFillerWordDetailSchema).default([]),
  pauseDetails: z.array(analyzePauseDetailSchema).default([]),
  missedKeywords: z.array(analyzeMissedKeywordSchema).default([]),
  aiSummary: analyzeAiSummarySchema.optional(),
  coaching: z.record(z.unknown()).optional()
});

type RehearsalSttPayload = z.infer<typeof rehearsalSttPayloadSchema>;
type AudioAssetRow = z.infer<typeof audioAssetRowSchema>;

export async function processRehearsalSttJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "removeObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = rehearsalSttPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId =
      rawPayload &&
      typeof rawPayload === "object" &&
      "jobId" in rawPayload &&
      typeof rawPayload.jobId === "string"
        ? rawPayload.jobId
        : "";

    if (!jobId) {
      throw new Error(payloadResult.error.message);
    }

    return failJobOnly(
      dataSource,
      jobId,
      0,
      "REHEARSAL_STT_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "입력 데이터 확인 중",
    result: null,
    error: null
  });

  try {
    await updateRun(dataSource, payload, {
      status: "processing",
      error: null,
      jobId: payload.jobId
    });
  } catch (error) {
    return failJobOnly(
      dataSource,
      payload.jobId,
      10,
      "REHEARSAL_RUN_UNAVAILABLE",
      error instanceof Error ? error.message : "Rehearsal run unavailable."
    );
  }

  let asset: AudioAssetRow;
  let deckContext: DeckAnalysisContext;
  let runMeta: RehearsalRunMeta;
  let storageUrl: string;
  try {
    asset = await loadAudioAsset(dataSource, payload);
    deckContext = await loadDeckAnalysisContext(dataSource, payload.projectId, payload.deckId);
    runMeta = await loadRehearsalRunMeta(dataSource, payload);
    storageUrl = await storage.getSignedReadUrl(asset.storage_key);
  } catch (error) {
    return failJobAndRun(
      dataSource,
      payload,
      10,
      "REHEARSAL_STT_INPUT_UNAVAILABLE",
      error instanceof Error ? error.message : "Rehearsal STT input unavailable."
    );
  }

  await progressJob(dataSource, payload.jobId, 30, "음성 변환 중");

  let transcribePayload: z.infer<typeof transcribeResponseSchema>;
  try {
    const response = await fetch(workerUrl(pythonWorkerUrl, "/audio/transcribe"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        runId: payload.runId,
        projectId: payload.projectId,
        audio: {
          fileId: payload.audioFileId,
          storageUrl,
          mimeType: asset.mime_type
        }
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      return failAfterDelete(
        dataSource,
        storage,
        asset,
        payload,
        30,
        "PYTHON_WORKER_STT_FAILED",
        (await response.text()) || "Python worker STT failed."
      );
    }

    transcribePayload = transcribeResponseSchema.parse(await response.json());
  } catch (error) {
    return failAfterDelete(
      dataSource,
      storage,
      asset,
      payload,
      30,
      "PYTHON_WORKER_STT_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker STT unavailable."
    );
  }

  await progressJob(dataSource, payload.jobId, 65, "발화 지표 분석 중");

  let analysis: z.infer<typeof analyzeResponseSchema>;
  try {
    analysis = await analyzeTranscript(
      pythonWorkerUrl,
      payload,
      deckContext.deckKeywords,
      transcribePayload
    );
  } catch (error) {
    return failAfterDelete(
      dataSource,
      storage,
      asset,
      payload,
      65,
      "PYTHON_WORKER_ANALYZE_FAILED",
      error instanceof Error ? error.message : "Python worker analysis failed."
    );
  }

  await progressJob(dataSource, payload.jobId, 85, "리포트 생성 중");

  let rawAudioDeletedAt: string;
  try {
    rawAudioDeletedAt = await deleteRawAudio(dataSource, storage, asset);
  } catch (error) {
    return failJobAndRun(
      dataSource,
      payload,
      85,
      "RAW_AUDIO_DELETE_FAILED",
      error instanceof Error ? error.message : "Raw audio deletion failed."
    );
  }

  let report: RehearsalReport;
  try {
    report = buildRehearsalReport(
      payload,
      transcribePayload,
      analysis,
      rawAudioDeletedAt,
      deckContext,
      runMeta
    );
  } catch (error) {
    return failJobAndRun(
      dataSource,
      payload,
      85,
      "REHEARSAL_REPORT_INVALID",
      error instanceof Error ? error.message : "Rehearsal report validation failed.",
      { rawAudioDeletedAt }
    );
  }

  await updateRun(dataSource, payload, {
    status: "succeeded",
    error: null,
    rawAudioDeletedAt,
    rehearsalReport: report,
    transcriptRetained: report.transcriptRetained
  });

  return updateJob(dataSource, payload.jobId, {
    status: "succeeded",
    progress: 100,
    message: "리포트 생성 완료",
    result: buildReportGenerationRecord(payload, transcribePayload, report, rawAudioDeletedAt),
    error: null
  });
}

function buildRehearsalReport(
  payload: RehearsalSttPayload,
  transcription: z.infer<typeof transcribeResponseSchema>,
  analysis: z.infer<typeof analyzeResponseSchema>,
  generatedAt: string,
  deckContext: DeckAnalysisContext,
  runMeta: RehearsalRunMeta
): RehearsalReport {
  return rehearsalReportSchema.parse({
    reportId: `report_${payload.runId}`,
    runId: payload.runId,
    projectId: payload.projectId,
    deckId: payload.deckId,
    transcriptRetained: false,
    transcript: null,
    metrics: {
      durationSeconds: transcription.durationSeconds ?? 0,
      wordsPerMinute: analysis.wordsPerMinute,
      fillerWordCount: analysis.fillerWordCount,
      pauseCount: analysis.pauseCount,
      keywordCoverage: analysis.keywordCoverage
    },
    speedSamples: analysis.speedSamples,
    fillerWordDetails: analysis.fillerWordDetails,
    pauseDetails: analysis.pauseDetails,
    missedKeywords: buildReportMissedKeywords(analysis.missedKeywords),
    slideTimings: buildSlideTimings(deckContext.deck, runMeta),
    qnaSummary: {
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    },
    aiSummary: analysis.aiSummary ?? null,
    coaching: analysis.coaching ?? null,
    generatedAt
  });
}

function buildReportGenerationRecord(
  payload: RehearsalSttPayload,
  transcription: z.infer<typeof transcribeResponseSchema>,
  report: RehearsalReport,
  rawAudioDeletedAt: string
) {
  return {
    runId: payload.runId,
    projectId: payload.projectId,
    deckId: payload.deckId,
    audioFileId: payload.audioFileId,
    transcriptRetained: report.transcriptRetained,
    transcript: report.transcript,
    language: transcription.language,
    provider: transcription.provider,
    model: transcription.model,
    durationSeconds: report.metrics.durationSeconds,
    segmentCount: transcription.segments.length,
    metrics: report.metrics,
    coaching: report.coaching,
    report,
    rawAudioDeletedAt
  };
}

async function analyzeTranscript(
  pythonWorkerUrl: string,
  payload: RehearsalSttPayload,
  deckKeywords: DeckKeywordPayload[],
  transcription: z.infer<typeof transcribeResponseSchema>
) {
  const response = await fetch(workerUrl(pythonWorkerUrl, "/rehearsal/analyze"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runId: payload.runId,
      projectId: payload.projectId,
      deckId: payload.deckId,
      transcript: transcription.transcript,
      durationSeconds: transcription.durationSeconds ?? 0,
      segments: transcription.segments,
      deckKeywords
    }),
    signal: AbortSignal.timeout(120_000)
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Python worker analysis failed.");
  }

  return analyzeResponseSchema.parse(await response.json());
}

async function loadAudioAsset(dataSource: DataSource, payload: RehearsalSttPayload) {
  const rows = await dataSource.query(
    `
      SELECT file_id, project_id, storage_key, mime_type, original_name, purpose, status
      FROM project_assets
      WHERE file_id = $1 AND project_id = $2
    `,
    [payload.audioFileId, payload.projectId]
  );

  const row = readFirstQueryRow<unknown>(rows);
  if (!row) {
    throw new Error(`Rehearsal audio asset not found: ${payload.audioFileId}`);
  }

  return audioAssetRowSchema.parse(row);
}

async function loadDeckAnalysisContext(
  dataSource: DataSource,
  projectId: string,
  deckId: string
) {
  const rows = await dataSource.query(
    `SELECT deck_json, version FROM decks WHERE project_id = $1 AND deck_id = $2`,
    [projectId, deckId]
  );

  const row = readFirstQueryRow<unknown>(rows);
  if (!row) {
    throw new Error(`Deck not found: ${deckId}`);
  }

  const checkpoint = deckRowSchema.parse(row);
  const checkpointDeck = deckSchema.parse(checkpoint.deck_json);
  const patchRows = await dataSource.query(
    `
      SELECT before_version, after_version, source, operations
      FROM deck_patches
      WHERE project_id = $1 AND deck_id = $2 AND after_version > $3
      ORDER BY after_version ASC, created_at ASC, change_id ASC
    `,
    [projectId, deckId, checkpoint.version]
  );

  let workingDeck = checkpointDeck;
  let expectedBeforeVersion = checkpointDeck.version;
  for (const rawPatchRow of patchRows) {
    const patchRow = deckPatchRowSchema.parse(rawPatchRow);

    if (patchRow.before_version !== expectedBeforeVersion) {
      throw new Error(
        `Stored patch chain does not start from the checkpoint version: expected=${expectedBeforeVersion}, actual=${patchRow.before_version}`
      );
    }

    if (patchRow.after_version !== patchRow.before_version + 1) {
      throw new Error(
        `Stored patch history has a non-sequential version transition: before=${patchRow.before_version}, after=${patchRow.after_version}`
      );
    }

    const patch = deckPatchSchema.parse({
      deckId: workingDeck.deckId,
      baseVersion: patchRow.before_version,
      source: patchRow.source,
      operations: patchRow.operations
    });
    workingDeck = applyReportDeckPatch(workingDeck, patch, patchRow.after_version);

    if (workingDeck.version !== patchRow.after_version) {
      throw new Error(
        `Stored patch history has an unexpected version transition: deck=${workingDeck.version}, patch=${patchRow.after_version}`
      );
    }

    expectedBeforeVersion = patchRow.after_version;
  }

  return {
    deck: workingDeck,
    deckKeywords: workingDeck.slides.flatMap((slide) =>
      slide.keywords.map((keyword) => ({ ...keyword, slideId: slide.slideId }))
    )
  };
}

function applyReportDeckPatch(
  deck: Deck,
  patch: ReturnType<typeof deckPatchSchema.parse>,
  afterVersion: number
) {
  let nextDeck: Deck = { ...deck, version: afterVersion, slides: [...deck.slides] };

  for (const operation of patch.operations) {
    switch (operation.type) {
      case "update_deck": {
        nextDeck = {
          ...nextDeck,
          ...(operation.title !== undefined ? { title: operation.title } : {}),
          ...(operation.metadata
            ? {
                metadata: applyReportDeckMetadataPatch(
                  nextDeck.metadata,
                  operation.metadata
                )
              }
            : {})
        };
        break;
      }
      case "add_slide":
        nextDeck = {
          ...nextDeck,
          slides: [...nextDeck.slides, operation.slide].sort((a, b) => a.order - b.order)
        };
        break;
      case "delete_slide":
        nextDeck = {
          ...nextDeck,
          slides: nextDeck.slides.filter((slide) => slide.slideId !== operation.slideId)
        };
        break;
      case "reorder_slides": {
        const orderBySlideId = new Map(
          operation.slideOrders.map((slideOrder) => [slideOrder.slideId, slideOrder.order])
        );
        nextDeck = {
          ...nextDeck,
          slides: nextDeck.slides
            .map((slide) => ({
              ...slide,
              order: orderBySlideId.get(slide.slideId) ?? slide.order
            }))
            .sort((a, b) => a.order - b.order)
        };
        break;
      }
      case "replace_keywords":
        nextDeck = {
          ...nextDeck,
          slides: nextDeck.slides.map((slide) =>
            slide.slideId === operation.slideId
              ? { ...slide, keywords: operation.keywords }
              : slide
          )
        };
        break;
      default:
        break;
    }
  }

  return deckSchema.parse(nextDeck);
}

function applyReportDeckMetadataPatch(
  metadata: Deck["metadata"],
  patch: { thumbnailSource?: Deck["metadata"]["thumbnailSource"] | null }
) {
  const nextMetadata = { ...metadata };

  if (patch.thumbnailSource === null) {
    delete nextMetadata.thumbnailSource;
  } else if (patch.thumbnailSource !== undefined) {
    nextMetadata.thumbnailSource = patch.thumbnailSource;
  }

  return nextMetadata;
}

async function loadRehearsalRunMeta(dataSource: DataSource, payload: RehearsalSttPayload) {
  const rows = await dataSource.query(
    `
      SELECT meta_json
      FROM rehearsal_runs
      WHERE run_id = $1 AND project_id = $2
    `,
    [payload.runId, payload.projectId]
  );

  const row = readFirstQueryRow<unknown>(rows);
  if (!row) {
    throw new Error(`Rehearsal run not found: ${payload.runId}`);
  }

  const parsedRow = rehearsalRunMetaRowSchema.parse(row);
  return rehearsalRunMetaSchema.parse(parsedRow.meta_json ?? {});
}

function buildReportMissedKeywords(
  analysisKeywords: z.infer<typeof analyzeMissedKeywordSchema>[]
) {
  const byKey = new Map<string, z.infer<typeof analyzeMissedKeywordSchema>>();

  for (const keyword of analysisKeywords) {
    byKey.set(`${keyword.slideId}:${keyword.keywordId}`, keyword);
  }

  return Array.from(byKey.values());
}

function buildSlideTimings(
  deck: Deck,
  runMeta: RehearsalRunMeta
): RehearsalReportSlideTiming[] {
  const slideIds = new Set(deck.slides.map((slide) => slide.slideId));
  const timeline = runMeta.slideTimeline.filter((entry) => slideIds.has(entry.slideId));
  const timings: RehearsalReportSlideTiming[] = [];

  for (let index = 0; index < timeline.length; index += 1) {
    const entry = timeline[index];
    const nextEntry = timeline[index + 1];
    if (!entry || !nextEntry) {
      continue;
    }

    const enteredAt = Date.parse(entry.enteredAt);
    const exitedAt = Date.parse(nextEntry.enteredAt);
    if (
      Number.isNaN(enteredAt) ||
      Number.isNaN(exitedAt) ||
      exitedAt <= enteredAt
    ) {
      continue;
    }

    if (nextEntry && entry.slideId === nextEntry.slideId) {
      continue;
    }

    const slide = deck.slides.find((candidate) => candidate.slideId === entry.slideId);
    if (!slide) {
      continue;
    }

    timings.push({
      slideId: entry.slideId,
      targetSeconds: getSlideTargetSeconds(deck, slide),
      actualSeconds: Math.round((exitedAt - enteredAt) / 1000)
    });
  }

  return timings;
}

function getSlideTargetSeconds(deck: Deck, slide: Deck["slides"][number]) {
  if (slide.estimatedSeconds) {
    return slide.estimatedSeconds;
  }

  return Math.max(1, Math.round((deck.targetDurationMinutes * 60) / deck.slides.length));
}

async function failAfterDelete(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  asset: AudioAssetRow,
  payload: RehearsalSttPayload,
  progress: number,
  code: string,
  message: string
) {
  try {
    const rawAudioDeletedAt = await deleteRawAudio(dataSource, storage, asset);
    return failJobAndRun(dataSource, payload, progress, code, message, {
      rawAudioDeletedAt
    });
  } catch (error) {
    return failJobAndRun(
      dataSource,
      payload,
      progress,
      "RAW_AUDIO_DELETE_FAILED",
      error instanceof Error ? error.message : "Raw audio deletion failed."
    );
  }
}

async function deleteRawAudio(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  asset: AudioAssetRow
) {
  await storage.removeObject(asset.storage_key);
  const deletedAt = new Date().toISOString();
  await dataSource.query(
    `
      UPDATE project_assets
      SET status = 'deleted',
          deleted_at = $3
      WHERE file_id = $1 AND project_id = $2
    `,
    [asset.file_id, asset.project_id, deletedAt]
  );
  return deletedAt;
}

async function failJobAndRun(
  dataSource: DataSource,
  payload: RehearsalSttPayload,
  progress: number,
  code: string,
  message: string,
  options: { rawAudioDeletedAt?: string } = {}
): Promise<Job> {
  await updateRun(dataSource, payload, {
    status: "failed",
    error: { code, message },
    rawAudioDeletedAt: options.rawAudioDeletedAt
  });
  return failJobOnly(dataSource, payload.jobId, progress, code, message);
}

async function failJobOnly(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "Rehearsal STT failed.",
    result: null,
    error: { code, message }
  });
}

async function updateRun(
  dataSource: DataSource,
  payload: RehearsalSttPayload,
  patch: {
    status: "processing" | "succeeded" | "failed";
    error: { code: string; message: string } | null;
    jobId?: string;
    rawAudioDeletedAt?: string;
    rehearsalReport?: RehearsalReport;
    transcriptRetained?: boolean;
  }
): Promise<void> {
  const rows = await dataSource.query(
    `
      UPDATE rehearsal_runs
      SET status = $2,
          job_id = COALESCE($3, job_id),
          error = $4,
          raw_audio_deleted_at = COALESCE($5::timestamptz, raw_audio_deleted_at),
          report_json = COALESCE($6::jsonb, report_json),
          transcript_retained = COALESCE($7::boolean, transcript_retained),
          updated_at = now()
      WHERE run_id = $1 AND project_id = $8
      RETURNING run_id
    `,
    [
      payload.runId,
      patch.status,
      patch.jobId ?? null,
      patch.error,
      patch.rawAudioDeletedAt ?? null,
      patch.rehearsalReport ? JSON.stringify(patch.rehearsalReport) : null,
      patch.transcriptRetained ?? null,
      payload.projectId
    ]
  );

  if (!readFirstQueryRow(rows)) {
    throw new Error(`Rehearsal run not found: ${payload.runId}`);
  }
}

async function progressJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  message: string
): Promise<void> {
  await updateJob(dataSource, jobId, {
    status: "running",
    progress,
    message,
    result: null,
    error: null
  });
}

async function updateJob(
  dataSource: DataSource,
  jobId: string,
  patch: {
    status: "running" | "succeeded" | "failed";
    progress: number;
    message: string;
    result: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
  }
): Promise<Job> {
  const rows = await dataSource.query(
    `
      UPDATE jobs
      SET status = $2,
          progress = $3,
          message = $4,
          result = $5,
          error = $6,
          updated_at = now()
      WHERE job_id = $1
      RETURNING *
    `,
    [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error]
  );

  const row = readFirstQueryRow<JobRow>(rows);
  if (!row) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return rowToJob(row);
}

type JobRow = {
  job_id?: string;
  jobId?: string;
  project_id?: string;
  projectId?: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  created_at?: Date | string;
  createdAt?: Date | string;
  updated_at?: Date | string;
  updatedAt?: Date | string;
};

function rowToJob(row: JobRow): Job {
  return {
    jobId: readRequiredString(row.jobId ?? row.job_id, "jobId"),
    projectId: readRequiredString(row.projectId ?? row.project_id, "projectId"),
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.createdAt ?? row.created_at),
    updatedAt: toIso(row.updatedAt ?? row.updated_at)
  };
}

function readFirstQueryRow<T>(queryResult: unknown): T | null {
  if (!Array.isArray(queryResult)) {
    return null;
  }

  const first = queryResult[0];
  if (Array.isArray(first)) {
    return (first[0] as T | undefined) ?? null;
  }

  return (first as T | undefined) ?? null;
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing ${field} in job row.`);
  }

  return value;
}

function toIso(value: Date | string | undefined): string {
  if (value === undefined) {
    throw new Error("Missing timestamp in job row.");
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${String(value)}`);
  }

  return date.toISOString();
}

type DeckKeywordPayload = {
  slideId: string;
  keywordId: string;
  text: string;
  synonyms: string[];
  abbreviations: string[];
  required: boolean;
};

type DeckAnalysisContext = {
  deck: Deck;
  deckKeywords: DeckKeywordPayload[];
};

function workerUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
