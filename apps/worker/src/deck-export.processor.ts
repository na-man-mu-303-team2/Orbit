import {
  deckExportFormatSchema,
  deckExportJobResultSchema,
  deckSchema,
  type Job,
} from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import { randomUUID } from "crypto";
import type { DataSource } from "typeorm";
import { z } from "zod";

const deckExportPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  deck: deckSchema,
  format: deckExportFormatSchema,
});

const pythonExportResponseSchema = z.object({
  contentBase64: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

type DeckExportPayload = z.infer<typeof deckExportPayloadSchema>;
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

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export async function processDeckExportJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  pythonWorkerUrl: string,
  rawPayload: unknown,
): Promise<Job> {
  const payloadResult = deckExportPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    const jobId =
      rawPayload &&
      typeof rawPayload === "object" &&
      "jobId" in rawPayload &&
      typeof rawPayload.jobId === "string"
        ? rawPayload.jobId
        : "";
    if (!jobId) throw new Error(payloadResult.error.message);
    return failJob(
      dataSource,
      jobId,
      0,
      "DECK_EXPORT_PAYLOAD_INVALID",
      payloadResult.error.message,
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 20,
    message: "Deck export running.",
    result: null,
    error: null,
  });

  let response: Response;
  try {
    response = await fetch(workerUrl(pythonWorkerUrl, "/ai/export-deck-pptx"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deck: payload.deck, format: payload.format }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      20,
      "PYTHON_WORKER_DECK_EXPORT_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker unavailable.",
    );
  }

  if (!response.ok) {
    return failJob(
      dataSource,
      payload.jobId,
      20,
      "PYTHON_WORKER_DECK_EXPORT_FAILED",
      (await response.text()) || "Python worker deck export failed.",
    );
  }

  try {
    const workerPayload = pythonExportResponseSchema.parse(await response.json());
    const file = await saveExportFile(dataSource, storage, payload, workerPayload);
    const result = deckExportJobResultSchema.parse({
      deckId: payload.deck.deckId,
      fileId: file.fileId,
      url: file.url,
      format: payload.format,
      warnings: workerPayload.warnings,
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "Deck export completed.",
      result,
      error: null,
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      75,
      "PYTHON_WORKER_DECK_EXPORT_INVALID_RESPONSE",
      error instanceof Error
        ? error.message
        : "Python worker returned invalid deck export response.",
    );
  }
}

async function saveExportFile(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  payload: DeckExportPayload,
  workerPayload: z.infer<typeof pythonExportResponseSchema>,
) {
  const fileId = `file_${randomUUID()}`;
  const fileName = `${safeStorageName(payload.deck.title || payload.deck.deckId)}.pptx`;
  const storageKey = `projects/${payload.projectId}/assets/${fileId}-${fileName}`;
  const body = Buffer.from(workerPayload.contentBase64, "base64");
  const url = createAssetContentUrl(payload.projectId, fileId);

  await storage.putObject({
    key: storageKey,
    body,
    contentType: pptxMimeType,
    purpose: "export-result",
  });
  await dataSource.query(
    `
      INSERT INTO project_assets (
        file_id, project_id, storage_key, original_name, mime_type, size, url,
        purpose, status, created_at, uploaded_at, deleted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'export-result', 'uploaded', now(), now(), null)
    `,
    [
      fileId,
      payload.projectId,
      storageKey,
      fileName,
      pptxMimeType,
      body.byteLength,
      url,
    ],
  );

  return { fileId, url };
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
    message: "Deck export failed.",
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
      RETURNING *
    `,
    [jobId, patch.status, patch.progress, patch.message, patch.result, patch.error],
  );
  const row = readFirstQueryRow<JobRow>(rows);
  if (!row) throw new Error(`Job not found: ${jobId}`);
  return rowToJob(row);
}

function readFirstQueryRow<T>(queryResult: unknown): T | null {
  if (!Array.isArray(queryResult)) return null;
  const first = queryResult[0];
  if (Array.isArray(first)) return (first[0] as T | undefined) ?? null;
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
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${String(value)}`);
  }
  return date.toISOString();
}

function createAssetContentUrl(projectId: string, fileId: string): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(
    fileId,
  )}/content`;
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

function safeStorageName(fileName: string): string {
  return (fileName || "deck-export").replace(/[^a-zA-Z0-9._-]/g, "_");
}
