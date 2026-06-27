import {
  referenceExtractWorkerResponseSchema,
  type Job
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { z } from "zod";

const referenceExtractPayloadSchema = z.object({
  files: z.array(
    z.object({
      originalName: z.string().min(1),
      mimeType: z.string().min(1),
      contentBase64: z.string().min(1)
    })
  )
});

type ReferenceExtractPayload = z.infer<typeof referenceExtractPayloadSchema>;

interface ClaimedJobRow {
  job_id: string;
  project_id: string;
  progress: number;
  payload: unknown;
}

export async function processNextReferenceExtractJob(
  dataSource: DataSource,
  pythonWorkerUrl: string
): Promise<Job | null> {
  const job = await claimNextReferenceExtractJob(dataSource);
  if (!job) {
    return null;
  }

  let payload: ReferenceExtractPayload;
  try {
    payload = referenceExtractPayloadSchema.parse(job.payload);
  } catch (error) {
    return failJob(
      dataSource,
      job.job_id,
      job.progress,
      "REFERENCE_EXTRACT_PAYLOAD_INVALID",
      error instanceof Error ? error.message : "Invalid reference extract payload."
    );
  }

  const form = new FormData();
  form.append("project_id", job.project_id);

  for (const file of payload.files) {
    form.append(
      "files",
      new Blob([Buffer.from(file.contentBase64, "base64")], {
        type: file.mimeType
      }),
      file.originalName
    );
  }

  let response: Response;
  try {
    response = await fetch(workerUrl(pythonWorkerUrl, "/api/extract"), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000)
    });
  } catch (error) {
    return failJob(
      dataSource,
      job.job_id,
      job.progress,
      "PYTHON_WORKER_EXTRACT_UNAVAILABLE",
      error instanceof Error ? error.message : "Python worker unavailable."
    );
  }

  if (!response.ok) {
    const message = (await response.text()) || "Python worker extraction failed.";
    return failJob(
      dataSource,
      job.job_id,
      job.progress,
      "PYTHON_WORKER_EXTRACT_FAILED",
      message
    );
  }

  try {
    const workerPayload = referenceExtractWorkerResponseSchema.parse(
      await response.json()
    );
    return updateJob(dataSource, job.job_id, {
      status: "succeeded",
      progress: 100,
      message: "Reference extraction completed.",
      result: { files: workerPayload.files },
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      job.job_id,
      job.progress,
      "PYTHON_WORKER_EXTRACT_INVALID_RESPONSE",
      error instanceof Error
        ? error.message
        : "Python worker returned invalid extraction response."
    );
  }
}

async function claimNextReferenceExtractJob(
  dataSource: DataSource
): Promise<ClaimedJobRow | null> {
  const rows = await dataSource.query(`
    WITH next_job AS (
      SELECT job_id
      FROM jobs
      WHERE type = 'reference-extract' AND status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs
    SET status = 'running',
        progress = 10,
        message = 'Reference extraction running.',
        updated_at = now()
    FROM next_job
    WHERE jobs.job_id = next_job.job_id
    RETURNING jobs.job_id, jobs.project_id, jobs.progress, jobs.payload
  `);

  return rows[0] ?? null;
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
    message: "Python worker extraction failed.",
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
