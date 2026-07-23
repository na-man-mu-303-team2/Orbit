import {
  pptxOoxmlGenerationQueueName,
  pptxOoxmlSyncQueueName,
} from "@orbit/job-queue";
import type { DataSource } from "typeorm";
import { z } from "zod";

const payloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
});

export type PptxOoxmlFailureRecoveryResult = {
  outcome: "ignored" | "recovered";
  jobId: string | null;
};

export async function recoverPptxOoxmlFinalFailure(
  dataSource: Pick<DataSource, "query">,
  input: { queueName: string; data: unknown },
): Promise<PptxOoxmlFailureRecoveryResult> {
  const jobType = jobTypeForQueue(input.queueName);
  if (!jobType) return { outcome: "ignored", jobId: null };

  const payload = payloadSchema.safeParse(input.data);
  if (!payload.success) return { outcome: "ignored", jobId: null };

  const code =
    jobType === "pptx-ooxml-generation"
      ? "PPTX_OOXML_GENERATION_WORKER_TERMINATED"
      : "PPTX_OOXML_SYNC_WORKER_TERMINATED";
  const message =
    jobType === "pptx-ooxml-generation"
      ? "PPTX OOXML generation worker terminated before completion."
      : "PPTX OOXML sync worker terminated before completion.";
  const rows = readQueryRows<{ job_id: string }>(
    await dataSource.query(
      `
        UPDATE jobs
        SET status = 'failed',
            progress = 100,
            message = $4,
            result = NULL,
            error = jsonb_build_object(
              'code', $5::text,
              'message', $4::text,
              'retryable', false
            ),
            updated_at = now()
        WHERE job_id = $1
          AND project_id = $2
          AND type = $3
          AND status IN ('queued', 'running')
        RETURNING job_id
      `,
      [payload.data.jobId, payload.data.projectId, jobType, message, code],
    ),
  );
  return rows[0]?.job_id === payload.data.jobId
    ? { outcome: "recovered", jobId: payload.data.jobId }
    : { outcome: "ignored", jobId: payload.data.jobId };
}

function jobTypeForQueue(queueName: string) {
  if (queueName === pptxOoxmlGenerationQueueName) {
    return "pptx-ooxml-generation" as const;
  }
  if (queueName === pptxOoxmlSyncQueueName) {
    return "pptx-ooxml-sync" as const;
  }
  return null;
}

function readQueryRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  if (Array.isArray(result[0])) return result[0] as T[];
  return result as T[];
}
