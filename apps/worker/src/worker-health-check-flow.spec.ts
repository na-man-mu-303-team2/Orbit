import { InMemoryJobQueue } from "@orbit/job-queue";
import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processWorkerHealthCheckJob } from "./worker-health-check.processor";

describe("worker health check flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ORBIT-97 verifies sample enqueue/process/status/failure flow", async () => {
    const queue = new InMemoryJobQueue();
    const queued = await queue.enqueue({
      projectId: "project-a",
      type: "worker-health-check"
    });

    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 50, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 50, null, {
          code: "PYTHON_WORKER_HEALTH_CHECK_FAILED",
          message: "bad health"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad health", { status: 503 }))
    );

    const job = await processWorkerHealthCheckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      { jobId: queued.jobId, projectId: queued.projectId }
    );

    expect(job.status).toBe("failed");
    expect(query.mock.calls[0][1]).toEqual([
      queued.jobId,
      "running",
      50,
      "Python worker health check running.",
      null,
      null
    ]);
    expect(query.mock.calls[1][1]).toEqual([
      queued.jobId,
      "failed",
      50,
      "Python worker health check failed.",
      null,
      {
        code: "PYTHON_WORKER_HEALTH_CHECK_FAILED",
        message: "bad health"
      }
    ]);
  });
});

function jobRow(
  status: "running" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    job_id: "job-1",
    project_id: "project-a",
    type: "worker-health-check",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-06-27T00:00:00.000Z",
    updated_at: "2026-06-27T00:00:01.000Z"
  };
}
