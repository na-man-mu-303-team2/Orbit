import type { StoragePort } from "@orbit/storage";
import type { Job } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const rehearsalSttPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  deckId: z.string().min(1),
  audioFileId: z.string().min(1),
});

const audioAssetRowSchema = z.object({
  file_id: z.string().min(1),
  project_id: z.string().min(1),
  storage_key: z.string().min(1),
  mime_type: z.string().min(1),
  original_name: z.string().min(1),
  purpose: z.literal("rehearsal-audio"),
  status: z.literal("uploaded"),
});

const deckRowSchema = z.object({
  deck_json: z.record(z.unknown()),
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
  segments: z.array(z.record(z.unknown())),
});

const analyzeResponseSchema = z.object({
  runId: z.string().min(1),
  wordsPerMinute: z.number(),
  fillerWordCount: z.number().int(),
  pauseCount: z.number().int(),
  keywordCoverage: z.number(),
  coaching: z.record(z.unknown()).optional(),
});

export async function processRehearsalSttJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "getSignedReadUrl" | "removeObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
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

    return failJob(
      dataSource,
      jobId,
      0,
      "REHEARSAL_STT_PAYLOAD_INVALID",
      payloadResult.error.message,
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "Rehearsal STT running.",
    result: null,
    error: null,
  });

  let asset: z.infer<typeof audioAssetRowSchema>;
  let deck: z.infer<typeof deckRowSchema>;
  let storageUrl: string;
  try {
    asset = await loadAudioAsset(dataSource, payload);
    deck = await loadDeck(dataSource, payload.projectId, payload.deckId);
    storageUrl = await storage.getSignedReadUrl(asset.storage_key);
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      10,
      "REHEARSAL_STT_INPUT_UNAVAILABLE",
      error instanceof Error ? error.message : "Rehearsal STT input unavailable.",
    );
  }

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
          mimeType: asset.mime_type,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      return failAfterDelete(
        dataSource,
        storage,
        asset.storage_key,
        payload.jobId,
        10,
        "PYTHON_WORKER_STT_FAILED",
        (await response.text()) || "Python worker STT failed.",
      );
    }

    transcribePayload = transcribeResponseSchema.parse(await response.json());
  } catch (error) {
    return failAfterDelete(
      dataSource,
      storage,
      asset.storage_key,
      payload.jobId,
      10,
      "PYTHON_WORKER_STT_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker STT unavailable.",
    );
  }

  let analysis: z.infer<typeof analyzeResponseSchema>;
  try {
    analysis = await analyzeTranscript(
      pythonWorkerUrl,
      payload,
      deck.deck_json,
      transcribePayload,
    );
  } catch (error) {
    return failAfterDelete(
      dataSource,
      storage,
      asset.storage_key,
      payload.jobId,
      60,
      "PYTHON_WORKER_ANALYZE_FAILED",
      error instanceof Error ? error.message : "Python worker analysis failed.",
    );
  }

  try {
    await storage.removeObject(asset.storage_key);
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      90,
      "RAW_AUDIO_DELETE_FAILED",
      error instanceof Error ? error.message : "Raw audio deletion failed.",
    );
  }

  return updateJob(dataSource, payload.jobId, {
    status: "succeeded",
    progress: 100,
    message: "Rehearsal STT completed.",
    result: {
      runId: payload.runId,
      projectId: payload.projectId,
      deckId: payload.deckId,
      audioFileId: payload.audioFileId,
      transcript: transcribePayload.transcript,
      language: transcribePayload.language,
      provider: transcribePayload.provider,
      model: transcribePayload.model,
      durationSeconds: transcribePayload.durationSeconds ?? null,
      segments: transcribePayload.segments,
      metrics: {
        runId: analysis.runId,
        projectId: payload.projectId,
        deckId: payload.deckId,
        durationSeconds: transcribePayload.durationSeconds ?? 0,
        wordsPerMinute: analysis.wordsPerMinute,
        fillerWordCount: analysis.fillerWordCount,
        pauseCount: analysis.pauseCount,
        keywordCoverage: analysis.keywordCoverage,
      },
      coaching: analysis.coaching ?? null,
      rawAudioDeletedAt: new Date().toISOString(),
    },
    error: null,
  });
}

async function analyzeTranscript(
  pythonWorkerUrl: string,
  payload: z.infer<typeof rehearsalSttPayloadSchema>,
  deck: Record<string, unknown>,
  transcription: z.infer<typeof transcribeResponseSchema>,
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
      deckKeywords: collectDeckKeywords(deck),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || "Python worker analysis failed.");
  }

  return analyzeResponseSchema.parse(await response.json());
}

async function loadAudioAsset(
  dataSource: DataSource,
  payload: z.infer<typeof rehearsalSttPayloadSchema>,
) {
  const rows = await dataSource.query(
    `
      SELECT file_id, project_id, storage_key, mime_type, original_name, purpose, status
      FROM project_assets
      WHERE file_id = $1 AND project_id = $2
    `,
    [payload.audioFileId, payload.projectId],
  );

  if (!rows[0]) {
    throw new Error(`Rehearsal audio asset not found: ${payload.audioFileId}`);
  }

  return audioAssetRowSchema.parse(rows[0]);
}

async function loadDeck(dataSource: DataSource, projectId: string, deckId: string) {
  const rows = await dataSource.query(
    `SELECT deck_json FROM decks WHERE project_id = $1 AND deck_id = $2`,
    [projectId, deckId],
  );

  if (!rows[0]) {
    throw new Error(`Deck not found: ${deckId}`);
  }

  return deckRowSchema.parse(rows[0]);
}

async function failAfterDelete(
  dataSource: DataSource,
  storage: Pick<StoragePort, "removeObject">,
  storageKey: string,
  jobId: string,
  progress: number,
  code: string,
  message: string,
) {
  try {
    await storage.removeObject(storageKey);
  } catch (error) {
    return failJob(
      dataSource,
      jobId,
      progress,
      "RAW_AUDIO_DELETE_FAILED",
      error instanceof Error ? error.message : "Raw audio deletion failed.",
    );
  }

  return failJob(dataSource, jobId, progress, code, message);
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string,
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "Rehearsal STT failed.",
    result: null,
    error: { code, message },
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
  },
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
      RETURNING
        job_id AS "jobId",
        project_id AS "projectId",
        type,
        status,
        progress,
        message,
        result,
        error,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error],
  );

  if (!rows[0]) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return {
    ...rows[0],
    createdAt: new Date(rows[0].createdAt).toISOString(),
    updatedAt: new Date(rows[0].updatedAt).toISOString(),
  };
}

type DeckKeywordPayload = {
  text: string;
  synonyms: string[];
  abbreviations: string[];
};

function collectDeckKeywords(deck: Record<string, unknown>): DeckKeywordPayload[] {
  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  return slides.flatMap((slide) => {
    if (!slide || typeof slide !== "object" || !("keywords" in slide)) {
      return [];
    }

    const keywords = Array.isArray(slide.keywords) ? slide.keywords : [];
    return keywords
      .map((keyword: unknown) => {
        if (!keyword || typeof keyword !== "object" || !("text" in keyword)) {
          return null;
        }

        const record = keyword as {
          text?: unknown;
          synonyms?: unknown;
          abbreviations?: unknown;
        };
        return {
          text: typeof record.text === "string" ? record.text : "",
          synonyms: Array.isArray(record.synonyms)
            ? record.synonyms.filter((value): value is string => typeof value === "string")
            : [],
          abbreviations: Array.isArray(record.abbreviations)
            ? record.abbreviations.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
        };
      })
      .filter(
        (keyword: DeckKeywordPayload | null): keyword is DeckKeywordPayload =>
          Boolean(keyword && keyword.text),
      );
  });
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}
