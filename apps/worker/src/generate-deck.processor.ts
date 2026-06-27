import {
  generateDeckJobResultSchema,
  generateDeckRequestSchema,
  generateDeckResponseSchema,
  type Deck,
  type Job
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const generateDeckPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  request: generateDeckRequestSchema
});

export async function processGenerateDeckJob(
  dataSource: DataSource,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = generateDeckPayloadSchema.safeParse(rawPayload);
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
      "GENERATE_DECK_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 15,
    message: "AI deck generation running.",
    result: null,
    error: null
  });

  let response: Response;
  try {
    response = await fetch(workerUrl(pythonWorkerUrl, "/ai/generate-deck"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: payload.projectId,
        ...payload.request
      }),
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      15,
      "PYTHON_WORKER_GENERATE_DECK_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker unavailable."
    );
  }

  if (!response.ok) {
    const message = (await response.text()) || "Python worker deck generation failed.";
    return failJob(
      dataSource,
      payload.jobId,
      15,
      "PYTHON_WORKER_GENERATE_DECK_FAILED",
      message
    );
  }

  try {
    const workerPayload = generateDeckResponseSchema.parse(await response.json());
    if (!workerPayload.validation.passed) {
      return failJob(
        dataSource,
        payload.jobId,
        75,
        "GENERATE_DECK_VALIDATION_FAILED",
        "Generated deck did not pass validation.",
        { validation: workerPayload.validation }
      );
    }

    await saveDeck(dataSource, workerPayload.deck);
    const result = generateDeckJobResultSchema.parse({
      deckId: workerPayload.deck.deckId,
      ...workerPayload
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "AI deck generation completed.",
      result,
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      75,
      "PYTHON_WORKER_GENERATE_DECK_INVALID_RESPONSE",
      error instanceof Error
        ? error.message
        : "Python worker returned invalid deck generation response."
    );
  }
}

async function saveDeck(
  dataSource: DataSource,
  deck: Deck
): Promise<void> {
  await dataSource.query(
    `
      INSERT INTO decks (project_id, deck_id, deck_json, version, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (project_id)
      DO UPDATE SET
        deck_id = EXCLUDED.deck_id,
        deck_json = EXCLUDED.deck_json,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at
    `,
    [deck.projectId, deck.deckId, deck, deck.version]
  );
}

async function failJob(
  dataSource: DataSource,
  jobId: string,
  progress: number,
  code: string,
  message: string,
  result: Record<string, unknown> | null = null
): Promise<Job> {
  return updateJob(dataSource, jobId, {
    status: "failed",
    progress,
    message: "AI deck generation failed.",
    result,
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
    [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error]
  );

  if (!rows[0]) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return {
    ...rows[0],
    createdAt: new Date(rows[0].createdAt).toISOString(),
    updatedAt: new Date(rows[0].updatedAt).toISOString()
  };
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}
