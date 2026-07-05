import { handleSlideRenderJob } from "@orbit/slide-render-worker";
import { deckSchema, type Job } from "@orbit/shared";
import type { StoragePort } from "@orbit/storage";
import type { DataSource } from "typeorm";
import { z } from "zod";

const audienceSlideRenderPayloadSchema = z.object({
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  deck: deckSchema,
  deckContentHash: z.string().min(1),
  deckVersion: z.number().int().positive(),
  slideId: z.string().min(1)
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

export async function processAudienceSlideRenderJob(
  dataSource: DataSource,
  storage: Pick<StoragePort, "putObject">,
  rawPayload: unknown
): Promise<Job> {
  const payloadResult = audienceSlideRenderPayloadSchema.safeParse(rawPayload);
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
      "AUDIENCE_SLIDE_RENDER_PAYLOAD_INVALID",
      payloadResult.error.message
    );
  }

  const payload = payloadResult.data;
  await updateJob(dataSource, payload.jobId, {
    status: "running",
    progress: 25,
    message: "Audience slide render running.",
    result: null,
    error: null
  });

  try {
    const result = await handleSlideRenderJob(
      {
        deck: payload.deck,
        sessionId: payload.sessionId,
        slideId: payload.slideId,
        effectState: {}
      },
      storage
    );
    await saveAudienceSlideSnapshot(dataSource, {
      sessionId: payload.sessionId,
      deckContentHash: payload.deckContentHash,
      deckVersion: payload.deckVersion,
      slideId: payload.slideId,
      contentHash: result.contentHash,
      url: result.url
    });

    return updateJob(dataSource, payload.jobId, {
      status: "succeeded",
      progress: 100,
      message: "Audience slide render completed.",
      result: {
        contentHash: result.contentHash,
        key: result.key,
        slideId: result.slideId,
        url: result.url
      },
      error: null
    });
  } catch (error) {
    return failJob(
      dataSource,
      payload.jobId,
      25,
      "AUDIENCE_SLIDE_RENDER_FAILED",
      error instanceof Error ? error.message : "Audience slide render failed."
    );
  }
}

async function saveAudienceSlideSnapshot(
  dataSource: DataSource,
  input: {
    sessionId: string;
    deckContentHash: string;
    deckVersion: number;
    slideId: string;
    contentHash: string;
    url: string;
  }
) {
  await dataSource.query(
    `
      UPDATE presentation_sessions
      SET audience_slide_snapshots_json =
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  COALESCE(audience_slide_snapshots_json, '{}'::jsonb),
                  '{slides}',
                  COALESCE(audience_slide_snapshots_json->'slides', '{}'::jsonb),
                  true
                ),
                '{deckVersion}',
                to_jsonb($2::int),
                true
              ),
              '{deckContentHash}',
              to_jsonb($3::text),
              true
            ),
            '{generatedAt}',
            to_jsonb($4::text),
            true
          ),
          ARRAY['slides', $5]::text[],
          jsonb_build_object('contentHash', $6::text, 'url', $7::text),
          true
        )
      WHERE session_id = $1
    `,
    [
      input.sessionId,
      input.deckVersion,
      input.deckContentHash,
      new Date().toISOString(),
      input.slideId,
      input.contentHash,
      input.url
    ]
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
    message: "Audience slide render failed.",
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
  const rows = await dataSource.query<JobRow[]>(
    `
      UPDATE jobs
      SET status = $2,
          progress = $3,
          message = $4,
          result_json = $5::jsonb,
          error_json = $6::jsonb,
          updated_at = now()
      WHERE job_id = $1
      RETURNING job_id, project_id, type, status, progress, message,
                result_json AS result, error_json AS error, created_at, updated_at
    `,
    [
      jobId,
      patch.status,
      patch.progress,
      patch.message,
      patch.result,
      patch.error
    ]
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Job not found.");
  }

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

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
