import type { StoragePort } from "@orbit/storage";
import {
  analyzeKoreanFillers,
  jobSchema,
  presentationAnalysisJobPayloadSchema,
  presentationVoiceReportSchema,
  slidePracticeServerAudioResponseSchema,
  type Job,
  type PresentationVoiceReport,
  type SlidePracticeServerAudioResponse,
} from "@orbit/shared";
import { createHash } from "node:crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const presentationAnalysisInputSchema = z.object({
  run_id: z.string().min(1),
  project_id: z.string().min(1),
  session_id: z.string().min(1),
  deck_id: z.string().min(1),
  deck_snapshot_json: z
    .object({
      slides: z.array(
        z.object({ speakerNotes: z.string().default("") }).passthrough(),
      ),
    })
    .passthrough(),
  status: z.enum([
    "created",
    "uploading",
    "processing",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  audio_file_id: z.string().min(1),
  storage_key: z.string().min(1),
  mime_type: z.string().min(1),
  asset_status: z.literal("uploaded"),
  purpose: z.literal("presentation-audio"),
});

type PresentationAnalysisInput = z.infer<typeof presentationAnalysisInputSchema>;

export async function processPresentationAnalysisJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "removeObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payload = presentationAnalysisJobPayloadSchema.parse(rawPayload);
  const input = presentationAnalysisInputSchema.parse(
    firstQueryRow(
      await dataSource.query(
        `SELECT runs.run_id, runs.project_id, runs.session_id, runs.deck_id,
                runs.deck_snapshot_json, runs.status, runs.audio_file_id,
                assets.storage_key, assets.mime_type,
                assets.status AS asset_status, assets.purpose
         FROM presentation_runs runs
         JOIN project_assets assets
           ON assets.project_id = runs.project_id
          AND assets.file_id = runs.audio_file_id
         WHERE runs.run_id = $1
           AND runs.project_id = $2
           AND runs.session_id = $3
           AND runs.deck_id = $4
           AND runs.audio_file_id = $5`,
        [
          payload.runId,
          payload.projectId,
          payload.sessionId,
          payload.deckId,
          payload.audioFileId,
        ],
      ),
    ),
  );

  if (input.status !== "processing") {
    return currentJob(dataSource, payload.jobId);
  }

  await updateJob(
    dataSource,
    payload.jobId,
    "running",
    10,
    "실전 발표 음성 분석 준비 중",
    null,
    null,
  );

  try {
    const storageUrl = await storage.getSignedReadUrl(input.storage_key);
    const response = await fetch(
      new URL("/slide-practice/analyze-audio", pythonWorkerUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: payload.runId,
          projectId: payload.projectId,
          audio: {
            fileId: payload.audioFileId,
            storageUrl,
            mimeType: input.mime_type,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok) {
      throw new PresentationAnalysisError(
        "PRESENTATION_TRANSCRIPTION_FAILED",
        (await response.text()) || "Presentation transcription failed.",
      );
    }

    const evidence = slidePracticeServerAudioResponseSchema.parse(
      await response.json(),
    );
    await updateJob(
      dataSource,
      payload.jobId,
      "running",
      75,
      "실전 발표 음성 지표 정리 중",
      null,
      null,
    );

    const voiceReport = buildPresentationVoiceReport(
      evidence,
      input.deck_snapshot_json.slides.map((slide) => slide.speakerNotes),
    );
    await dataSource.query(
      `UPDATE presentation_runs
       SET status = 'succeeded', voice_report_json = $2::jsonb, error = NULL,
           updated_at = now()
       WHERE run_id = $1 AND project_id = $3 AND session_id = $4
         AND status = 'processing'`,
      [
        payload.runId,
        JSON.stringify(voiceReport),
        payload.projectId,
        payload.sessionId,
      ],
    );
    await deletePresentationAudio(dataSource, storage, input);

    return updateJob(
      dataSource,
      payload.jobId,
      "succeeded",
      100,
      "실전 발표 분석 완료",
      { runId: payload.runId, sessionId: payload.sessionId, voiceReport },
      null,
    );
  } catch (error) {
    const failure = presentationAnalysisFailure(error);
    await dataSource.query(
      `UPDATE presentation_runs
       SET status = 'failed', error = $2::jsonb, updated_at = now()
       WHERE run_id = $1 AND project_id = $3 AND session_id = $4
         AND status = 'processing'`,
      [
        payload.runId,
        JSON.stringify(failure),
        payload.projectId,
        payload.sessionId,
      ],
    );
    return updateJob(
      dataSource,
      payload.jobId,
      "failed",
      100,
      "실전 발표 분석 실패",
      null,
      failure,
    );
  }
}

export function buildPresentationVoiceReport(
  evidence: SlidePracticeServerAudioResponse,
  speakerNotes: string[],
): PresentationVoiceReport {
  const durationMs = Math.max(
    evidence.voice.activeSpeechMs,
    ...evidence.loudnessSamples.map((sample) => sample.endMs),
    ...evidence.transcriptSegments.map((segment) => segment.endMs),
    ...evidence.pauseSegments.map((segment) => segment.endMs),
  );
  const durationSeconds = durationMs / 1_000;
  const spokenWordCount = countSpokenWords(evidence.transcript);
  const fillers = analyzeKoreanFillers(evidence.transcript);

  return presentationVoiceReportSchema.parse({
    durationSeconds,
    wordsPerMinute:
      durationSeconds > 0 ? spokenWordCount / (durationSeconds / 60) : 0,
    averageVolumeDbfs: evidence.voice.loudnessDb,
    fillerWordCount: fillers.totalCount,
    longSilenceCount: evidence.pauseSegments.filter(
      (segment) => segment.durationMs >= 5_000,
    ).length,
    averagePitchHz: evidence.voice.pitchMedianHz,
    scriptFeedback: buildScriptFeedback(evidence.transcript, speakerNotes),
  });
}

function buildScriptFeedback(transcript: string, speakerNotes: string[]) {
  const normalizedTranscript = normalizeText(transcript);
  const normalizedNotes = normalizeText(speakerNotes.join(" "));
  if (!normalizedNotes) {
    return "저장된 대본이 없어 음성 지표만 분석했습니다.";
  }
  if (!normalizedTranscript) {
    return "전사 결과가 없어 대본 연결 피드백을 만들지 못했습니다.";
  }

  const noteTerms = Array.from(
    new Set(normalizedNotes.split(" ").filter((term) => term.length >= 2)),
  );
  const matchedTerms = noteTerms.filter((term) =>
    normalizedTranscript.includes(term),
  );
  const coverage =
    noteTerms.length > 0 ? matchedTerms.length / noteTerms.length : 0;
  if (coverage >= 0.65) return "대본의 핵심 흐름을 대부분 따라 발표했습니다.";
  if (coverage >= 0.35) return "대본의 주요 흐름은 전달했지만 일부 내용을 보완할 수 있습니다.";
  return "대본과 다른 표현이 많았습니다. 핵심 메시지가 빠지지 않았는지 확인해 주세요.";
}

function countSpokenWords(transcript: string) {
  return normalizeText(transcript).split(" ").filter(Boolean).length;
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function deletePresentationAudio(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  input: PresentationAnalysisInput,
) {
  try {
    await storage.removeObject(input.storage_key);
    const deletedAt = new Date().toISOString();
    await dataSource.query(
      `UPDATE project_assets SET status = 'deleted', deleted_at = $3
       WHERE project_id = $1 AND file_id = $2`,
      [input.project_id, input.audio_file_id, deletedAt],
    );
    await dataSource.query(
      `UPDATE presentation_runs
       SET raw_audio_deleted_at = $2, updated_at = now()
       WHERE run_id = $1`,
      [input.run_id, deletedAt],
    );
  } catch {
    await schedulePresentationAudioDeletion(dataSource, input);
  }
}

async function schedulePresentationAudioDeletion(
  dataSource: DataSource,
  input: PresentationAnalysisInput,
) {
  const now = new Date().toISOString();
  const storageKeyHash = createHash("sha256")
    .update(input.storage_key)
    .digest("hex");
  await dataSource.query(
    `INSERT INTO storage_deletion_outbox (
       deletion_id, project_id, file_id, storage_key, storage_key_hash,
       purpose, status, attempt_count, next_attempt_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,'presentation-audio','pending',0,$6,$6)
     ON CONFLICT (storage_key_hash) DO NOTHING`,
    [
      `deletion_${storageKeyHash.slice(0, 32)}`,
      input.project_id,
      input.audio_file_id,
      input.storage_key,
      storageKeyHash,
      now,
    ],
  );
}

class PresentationAnalysisError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function presentationAnalysisFailure(error: unknown) {
  if (error instanceof PresentationAnalysisError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "PRESENTATION_AUDIO_ANALYSIS_INVALID",
      message: error.message,
    };
  }
  return {
    code: "PRESENTATION_AUDIO_ANALYSIS_FAILED",
    message:
      error instanceof Error ? error.message : "Presentation analysis failed.",
  };
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
  return dataSource
    .query(
      `UPDATE jobs SET status=$2, progress=$3, message=$4, result=$5, error=$6,
       updated_at=now() WHERE job_id=$1 RETURNING *`,
      [jobId, status, progress, message, result, error],
    )
    .then((rows) => jobRow(firstQueryRow(rows)));
}

function currentJob(dataSource: DataSource, jobId: string) {
  return dataSource
    .query(`SELECT * FROM jobs WHERE job_id=$1`, [jobId])
    .then((rows) => jobRow(firstQueryRow(rows)));
}

function jobRow(row: Record<string, unknown>): Job {
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
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}

function firstQueryRow<T = Record<string, unknown>>(value: unknown): T {
  const first = Array.isArray(value) ? value[0] : undefined;
  return (Array.isArray(first) ? first[0] : first) as T;
}
