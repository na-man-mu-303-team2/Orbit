import type { StoragePort } from "@orbit/storage";
import {
  analyzeKoreanFillers,
  classifyVoiceStyle,
  countSpokenSyllables,
  createUnmeasuredVoiceStyleResult,
  jobSchema,
  slidePracticeAnalysisJobPayloadSchema,
  slidePracticeAnalysisJobResultSchema,
  slidePracticeReportSchema,
  slidePracticeServerAudioResponseSchema,
  voiceBaselineMetricsSchema,
  type Job,
  type SlidePracticeReport,
} from "@orbit/shared";
import { createHash, randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const reportRetentionMs = 90 * 24 * 60 * 60 * 1_000;

const inputRowSchema = z.object({
  analysis_id: z.string(),
  project_id: z.string(),
  created_by: z.string(),
  client_request_id: z.string(),
  practice_session_id: z.string(),
  deck_id: z.string(),
  deck_version: z.number().int().positive(),
  slide_id: z.string(),
  slide_order: z.number().int().nonnegative(),
  started_at: z.union([z.date(), z.string()]),
  duration_ms: z.number().int().positive(),
  device_id_hash: z.string().nullable(),
  status: z.enum(["queued", "processing", "succeeded", "failed", "cancelled"]),
  audio_file_id: z.string(),
  storage_key: z.string(),
  mime_type: z.string(),
  asset_status: z.literal("uploaded"),
  purpose: z.literal("slide-practice-audio"),
});

export async function processSlidePracticeAnalysisJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "removeObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payload = slidePracticeAnalysisJobPayloadSchema.parse(rawPayload);
  const rows = await dataSource.query(
    `SELECT analyses.*, assets.storage_key, assets.mime_type,
      assets.status AS asset_status, assets.purpose
     FROM slide_practice_audio_analyses analyses
     JOIN project_assets assets
       ON assets.project_id = analyses.project_id
      AND assets.file_id = analyses.audio_file_id
     WHERE analyses.analysis_id = $1 AND analyses.project_id = $2`,
    [payload.analysisId, payload.projectId],
  );
  const row = inputRowSchema.parse(firstQueryRow(rows));
  if (row.status !== "queued") return currentJob(dataSource, payload.jobId);

  await updateJob(dataSource, payload.jobId, "running", 10, "슬라이드 연습 분석 준비 중", null, null);
  await dataSource.query(
    `UPDATE slide_practice_audio_analyses
     SET status = 'processing', updated_at = now()
     WHERE analysis_id = $1 AND status = 'queued'`,
    [payload.analysisId],
  );

  try {
    let storageUrl: string;
    try {
      storageUrl = await storage.getSignedReadUrl(row.storage_key);
    } catch {
      throw new SlidePracticeProcessingError("AUDIO_ANALYSIS_FAILED");
    }
    let response: Response;
    try {
      response = await fetch(new URL("/slide-practice/analyze-audio", pythonWorkerUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: payload.analysisId,
          projectId: payload.projectId,
          audio: {
            fileId: row.audio_file_id,
            storageUrl,
            mimeType: row.mime_type,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new SlidePracticeProcessingError("TRANSCRIPTION_FAILED");
    }
    if (!response.ok) throw new SlidePracticeProcessingError("TRANSCRIPTION_FAILED");
    let evidence: z.infer<typeof slidePracticeServerAudioResponseSchema>;
    try {
      evidence = slidePracticeServerAudioResponseSchema.parse(await response.json());
    } catch {
      throw new SlidePracticeProcessingError("AUDIO_ANALYSIS_FAILED");
    }
    const syllableCount = countSpokenSyllables(evidence.transcript);
    const fillers = analyzeKoreanFillers(evidence.transcript);
    const voice = {
      ...evidence.voice,
      syllablesPerSecond: evidence.voice.activeSpeechMs >= 1_000
        ? syllableCount / (evidence.voice.activeSpeechMs / 1_000)
        : null,
    };
    const baselineRow = row.device_id_hash
      ? firstQueryRowOrNull(await dataSource.query(
        `SELECT baseline_version, metrics_json FROM user_voice_baselines
         WHERE user_id = $1 AND device_id_hash = $2 AND expires_at > now()`,
        [row.created_by, row.device_id_hash],
      ))
      : null;
    const baseline = baselineRow ? voiceBaselineMetricsSchema.parse(baselineRow.metrics_json) : null;
    const baselineVersion = baselineRow ? Number(baselineRow.baseline_version) : null;
    const qualityReasons: SlidePracticeReport["quality"]["reasons"] = [];
    if (syllableCount < 5 || row.duration_ms < 3_000 || voice.activeSpeechMs < 1_000) {
      qualityReasons.push("insufficient-speech");
    }
    if (voice.loudnessDb === null) qualityReasons.push("audio-analysis-unavailable");
    if (voice.pitchMedianHz === null) qualityReasons.push("pitch-unavailable");
    const qualityState = qualityReasons.includes("insufficient-speech")
      ? "unmeasured"
      : qualityReasons.length > 0 ? "partial" : "measured";
    const report = slidePracticeReportSchema.parse({
      reportVersion: 1,
      metricDefinitionVersion: 2,
      classifierVersion: 4,
      practiceSessionId: row.practice_session_id,
      projectId: row.project_id,
      deckId: row.deck_id,
      deckVersion: row.deck_version,
      slideId: row.slide_id,
      slideOrder: row.slide_order,
      startedAt: toIso(row.started_at),
      durationMs: row.duration_ms,
      syllableCount,
      meanRecognitionConfidence: evidence.meanRecognitionConfidence,
      fillers: {
        policyVersion: 1,
        totalCount: fillers.totalCount,
        details: fillers.details,
      },
      voice,
      style: qualityState === "unmeasured"
        ? createUnmeasuredVoiceStyleResult()
        : classifyVoiceStyle(voice, baseline),
      quality: { state: qualityState, reasons: Array.from(new Set(qualityReasons)) },
      source: {
        kind: "server",
        sttEngine: "report-stt",
        deviceIdHash: row.device_id_hash,
        baselineVersion,
      },
    });
    const reportId = await persistDerivedReport(dataSource, row, report);
    const cleanup = await deleteRawAudio(dataSource, storage, row);
    await dataSource.query(
      `UPDATE slide_practice_audio_analyses
       SET status = 'succeeded', report_id = $2, cleanup_state = $3,
           raw_audio_deleted_at = $4, updated_at = now(), completed_at = now()
       WHERE analysis_id = $1 AND status = 'processing'`,
      [payload.analysisId, reportId, cleanup.state, cleanup.deletedAt],
    );
    const result = slidePracticeAnalysisJobResultSchema.parse({
      analysisId: payload.analysisId,
      reportId,
    });
    return updateJob(dataSource, payload.jobId, "succeeded", 100, "슬라이드 연습 분석 완료", result, null);
  } catch (error) {
    const code = error instanceof SlidePracticeProcessingError
      ? error.code
      : error instanceof z.ZodError
        ? "AUDIO_ANALYSIS_FAILED"
        : "REPORT_PERSIST_FAILED";
    const cleanup = await deleteRawAudio(dataSource, storage, row);
    await dataSource.query(
      `UPDATE slide_practice_audio_analyses
       SET status = 'failed', error_code = $2, cleanup_state = $3,
           raw_audio_deleted_at = $4, updated_at = now(), completed_at = now()
       WHERE analysis_id = $1 AND status IN ('queued','processing')`,
      [payload.analysisId, code, cleanup.state, cleanup.deletedAt],
    );
    return updateJob(dataSource, payload.jobId, "failed", 100, "슬라이드 연습 분석 실패", null, {
      code,
      message: "Slide practice analysis failed.",
    });
  }
}

async function persistDerivedReport(
  dataSource: DataSource,
  row: z.infer<typeof inputRowSchema>,
  report: SlidePracticeReport,
) {
  const existing = firstQueryRowOrNull(await dataSource.query(
    `SELECT report_id FROM slide_practice_reports
     WHERE project_id = $1 AND created_by = $2 AND client_request_id = $3`,
    [row.project_id, row.created_by, row.client_request_id],
  ));
  if (existing) return String(existing.report_id);

  const reportId = `practice_report_${randomUUID()}`;
  const now = new Date();
  const rows = await dataSource.query(
    `INSERT INTO slide_practice_reports (
      report_id, project_id, created_by, client_request_id, deck_id, deck_version,
      slide_id, slide_order, metric_definition_version, classifier_version,
      report_json, created_at, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (project_id, created_by, client_request_id) DO NOTHING
    RETURNING report_id`,
    [
      reportId,
      row.project_id,
      row.created_by,
      row.client_request_id,
      row.deck_id,
      row.deck_version,
      row.slide_id,
      row.slide_order,
      report.metricDefinitionVersion,
      report.classifierVersion,
      report,
      now.toISOString(),
      new Date(now.getTime() + reportRetentionMs).toISOString(),
    ],
  );
  const inserted = firstQueryRowOrNull(rows);
  if (inserted) return String(inserted.report_id);
  const conflicted = firstQueryRowOrNull(await dataSource.query(
    `SELECT report_id FROM slide_practice_reports
     WHERE project_id = $1 AND created_by = $2 AND client_request_id = $3`,
    [row.project_id, row.created_by, row.client_request_id],
  ));
  if (!conflicted) throw new SlidePracticeProcessingError("REPORT_PERSIST_FAILED");
  return String(conflicted.report_id);
}

async function deleteRawAudio(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  row: z.infer<typeof inputRowSchema>,
) {
  try {
    await storage.removeObject(row.storage_key);
    const deletedAt = new Date().toISOString();
    await dataSource.query(
      `UPDATE project_assets SET status = 'deleted', deleted_at = $3
       WHERE project_id = $1 AND file_id = $2`,
      [row.project_id, row.audio_file_id, deletedAt],
    );
    return { state: "deleted", deletedAt } as const;
  } catch {
    await scheduleRawAudioDeletion(dataSource, row);
    return { state: "pending", deletedAt: null } as const;
  }
}

async function scheduleRawAudioDeletion(
  dataSource: DataSource,
  row: z.infer<typeof inputRowSchema>,
) {
  const now = new Date().toISOString();
  const storageKeyHash = createHash("sha256").update(row.storage_key).digest("hex");
  await dataSource.query(
    `INSERT INTO storage_deletion_outbox (
      deletion_id, project_id, file_id, storage_key, storage_key_hash,
      purpose, status, attempt_count, next_attempt_at, created_at
    ) VALUES ($1,$2,$3,$4,$5,'slide-practice-audio','pending',0,$6,$6)
    ON CONFLICT (storage_key_hash) DO NOTHING`,
    [`deletion_${storageKeyHash.slice(0, 32)}`, row.project_id, row.audio_file_id, row.storage_key, storageKeyHash, now],
  );
}

class SlidePracticeProcessingError extends Error {
  constructor(readonly code: "TRANSCRIPTION_FAILED" | "AUDIO_ANALYSIS_FAILED" | "REPORT_PERSIST_FAILED") {
    super(code);
  }
}

function updateJob(
  dataSource: DataSource,
  jobId: string,
  status: "running" | "succeeded" | "failed",
  progress: number,
  message: string,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null,
) {
  return dataSource.query(
    `UPDATE jobs SET status=$2, progress=$3, message=$4, result=$5, error=$6,
     updated_at=now() WHERE job_id=$1 RETURNING *`,
    [jobId, status, progress, message, result, error],
  ).then((rows) => jobRow(firstQueryRow(rows)));
}

function currentJob(dataSource: DataSource, jobId: string) {
  return dataSource.query(`SELECT * FROM jobs WHERE job_id=$1`, [jobId])
    .then((rows) => jobRow(firstQueryRow(rows)));
}

function jobRow(row: any): Job {
  return jobSchema.parse({
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function firstQueryRow<T = any>(value: unknown): T {
  const first = Array.isArray(value) ? value[0] : undefined;
  return (Array.isArray(first) ? first[0] : first) as T;
}

function firstQueryRowOrNull<T = any>(value: unknown): T | null {
  const row = firstQueryRow<T | undefined>(value);
  return row ?? null;
}
