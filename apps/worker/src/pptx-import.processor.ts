import type { StoragePort } from "@orbit/storage";
import {
  pptxImportJobResultSchema,
  pptxImportResponseSchema,
  type Deck,
  type Job
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const pptxImportPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  fileId: z.string().min(1)
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

type AssetRow = {
  file_id: string;
  project_id: string;
  storage_key: string;
  original_name: string;
  mime_type: string;
  status: string;
};

export async function processPptxImportJob(
  dataSource: DataSource,
  storage: StoragePort,
  pythonWorkerUrl: string,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = pptxImportPayloadSchema.safeParse(rawPayload);
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
      "PPTX_IMPORT_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 10,
    message: "PPTX import running.",
    result: null,
    error: null
  });

  const asset = await findUploadedAsset(dataSource, payload.projectId, payload.fileId);
  if (!asset) {
    return failJob(
      dataSource,
      payload.jobId,
      10,
      "PPTX_IMPORT_ASSET_NOT_FOUND",
      `Uploaded PPTX asset not found: ${payload.fileId}`
    );
  }

  let fileBytes: Uint8Array;
  try {
    const readUrl = await storage.getSignedReadUrl(asset.storage_key);
    const fileResponse = await fetch(readUrl, {
      signal: AbortSignal.timeout(60_000)
    });

    if (!fileResponse.ok) {
      return failJob(
        dataSource,
        payload.jobId,
        25,
        "PPTX_IMPORT_ASSET_READ_FAILED",
        `Failed to read uploaded PPTX asset: ${payload.fileId}`
      );
    }

    fileBytes = new Uint8Array(await fileResponse.arrayBuffer());
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      25,
      "PPTX_IMPORT_ASSET_UNAVAILABLE",
      error instanceof Error ? error.message : "Uploaded PPTX asset is unavailable."
    );
  }

  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 45,
    message: "PPTX import worker request running.",
    result: null,
    error: null
  });

  let response: Response;
  try {
    const formData = new FormData();
    formData.set(
      "file",
      new Blob([fileBytes], { type: asset.mime_type }),
      asset.original_name
    );
    formData.set("project_id", payload.projectId);
    formData.set("file_id", payload.fileId);

    response = await fetch(workerUrl(pythonWorkerUrl, "/pptx/import"), {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      45,
      "PYTHON_WORKER_PPTX_IMPORT_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker unavailable."
    );
  }

  if (!response.ok) {
    const message = (await response.text()) || "Python worker PPTX import failed.";
    return failJob(
      dataSource,
      payload.jobId,
      45,
      "PYTHON_WORKER_PPTX_IMPORT_FAILED",
      message
    );
  }

  try {
    const workerPayload = pptxImportResponseSchema.parse(await response.json());
    await saveDeck(dataSource, workerPayload.deck);

    const result = pptxImportJobResultSchema.parse({
      deckId: workerPayload.deck.deckId,
      ...workerPayload
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "PPTX import completed.",
      result,
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      80,
      "PYTHON_WORKER_PPTX_IMPORT_INVALID_RESPONSE",
      error instanceof Error
        ? error.message
        : "Python worker returned invalid PPTX import response."
    );
  }
}

async function findUploadedAsset(
  dataSource: DataSource,
  projectId: string,
  fileId: string
): Promise<AssetRow | null> {
  const rows = await dataSource.query(
    `
      SELECT file_id, project_id, storage_key, original_name, mime_type, status
      FROM project_assets
      WHERE project_id = $1 AND file_id = $2 AND status = 'uploaded'
    `,
    [projectId, fileId]
  );

  return readFirstQueryRow<AssetRow>(rows);
}

async function saveDeck(dataSource: DataSource, deck: Deck): Promise<void> {
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
    message: "PPTX import failed.",
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
