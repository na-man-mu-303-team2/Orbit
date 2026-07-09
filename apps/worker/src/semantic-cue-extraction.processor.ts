import {
  deckSchema,
  semanticCueExtractionResultSchema,
  type Deck,
  type Job
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const semanticCueExtractionPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  request: z
    .object({
      deckId: z.string().min(1),
      force: z.boolean().default(false)
    })
    .strict()
});

const deckRowSchema = z.object({
  deck_json: z.record(z.unknown()),
  version: z.number().int().positive(),
  deck_id: z.string().min(1)
});

type JobRow = {
  job_id: string;
  project_id: string;
  type: Job["type"];
  status: Job["status"];
  progress: number;
  message: string;
  result: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export async function processSemanticCueExtractionJob(
  dataSource: DataSource,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = semanticCueExtractionPayloadSchema.safeParse(rawPayload);
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
    return failJob(dataSource, jobId, 0, "SEMANTIC_CUE_PAYLOAD_INVALID", payloadResult.error.message);
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "Semantic cue extraction input loading.",
    result: null,
    error: null
  });

  let deck: Deck;
  try {
    deck = await loadCheckpointDeckWithoutPendingPatches(dataSource, payload.projectId, payload.request.deckId);
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      10,
      "SEMANTIC_CUE_DECK_UNAVAILABLE",
      error instanceof Error ? error.message : "Semantic cue deck unavailable."
    );
  }

  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 45,
    message: "Semantic cue extraction running.",
    result: null,
    error: null
  });

  let extraction: z.infer<typeof semanticCueExtractionResultSchema>;
  try {
    const response = await fetch(workerUrl(pythonWorkerUrl, "/ai/extract-semantic-cues"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: payload.projectId,
        deck
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      return failJob(
        dataSource,
        payload.jobId,
        45,
        "PYTHON_WORKER_SEMANTIC_CUE_FAILED",
        (await response.text()) || "Python worker semantic cue extraction failed."
      );
    }

    extraction = semanticCueExtractionResultSchema.parse(await response.json());
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      45,
      "PYTHON_WORKER_SEMANTIC_CUE_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker semantic cue extraction unavailable."
    );
  }

  let nextDeck: Deck;
  try {
    nextDeck = deckSchema.parse({
      ...deck,
      version: deck.version + 1,
      slides: deck.slides.map((slide) => ({
        ...slide,
        semanticCues:
          extraction.slides.find((result) => result.slideId === slide.slideId)
            ?.semanticCues ?? slide.semanticCues
      }))
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      70,
      "SEMANTIC_CUE_RESULT_INVALID",
      error instanceof Error ? error.message : "Semantic cue result invalid."
    );
  }

  try {
    await saveDeckCheckpoint(dataSource, nextDeck);
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      85,
      "SEMANTIC_CUE_DECK_SAVE_FAILED",
      error instanceof Error ? error.message : "Semantic cue deck save failed."
    );
  }

  return updateJob(dataSource, payload.jobId, {
    status: "succeeded",
    progress: 100,
    message: "Semantic cue extraction completed.",
    result: {
      deckId: nextDeck.deckId,
      version: nextDeck.version,
      cueCount: nextDeck.slides.reduce(
        (sum, slide) => sum + slide.semanticCues.length,
        0
      )
    },
    error: null
  });
}

async function loadCheckpointDeckWithoutPendingPatches(
  dataSource: DataSource,
  projectId: string,
  deckId: string
): Promise<Deck> {
  const rows = await dataSource.query(
    `SELECT deck_id, deck_json, version FROM decks WHERE project_id = $1 AND deck_id = $2`,
    [projectId, deckId]
  );
  const row = deckRowSchema.parse(readFirstQueryRow<unknown>(rows));
  const patchRows = await dataSource.query(
    `SELECT 1 FROM deck_patches WHERE project_id = $1 AND deck_id = $2 AND after_version > $3 LIMIT 1`,
    [projectId, deckId, row.version]
  );
  if (readFirstQueryRow<unknown>(patchRows)) {
    throw new Error("Semantic cue extraction requires a deck checkpoint without pending patches.");
  }
  return deckSchema.parse(row.deck_json);
}

async function saveDeckCheckpoint(dataSource: DataSource, deck: Deck) {
  await dataSource.query(
    `
      UPDATE decks
      SET deck_json = $3,
          version = $4,
          updated_at = now()
      WHERE project_id = $1 AND deck_id = $2
    `,
    [deck.projectId, deck.deckId, deck, deck.version]
  );
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "Semantic cue extraction failed.",
    result: null,
    error: { code, message }
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

function rowToJob(row: JobRow): Job {
  return {
    jobId: row.job_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    message: row.message,
    result: row.result,
    error: row.error,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${String(value)}`);
  }
  return date.toISOString();
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
