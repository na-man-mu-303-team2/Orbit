import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processWorkerHealthCheckJob } from "./worker-health-check.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a"
};

describe("processWorkerHealthCheckJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Python /health and marks the DB job succeeded", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 50, null, null)])
      .mockResolvedValueOnce([
        jobRow(
          "succeeded",
          100,
          {
            status: "ok",
            app: "orbit-python-worker",
            checkedAt: "2026-06-27T00:00:01Z"
          },
          null
        )
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            status: "ok",
            app: "orbit-python-worker",
            checked_at: "2026-06-27T00:00:01Z"
          })
        )
      )
    );

    const job = await processWorkerHealthCheckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/health",
      expect.objectContaining({ method: "GET" })
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("marks the DB job failed when Python /health is unavailable", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 50, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 50, null, {
          code: "PYTHON_WORKER_HEALTH_CHECK_UNAVAILABLE",
          message: "timeout"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      })
    );

    const job = await processWorkerHealthCheckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PYTHON_WORKER_HEALTH_CHECK_UNAVAILABLE");
  });

  it("marks the DB job failed when Python /health returns invalid JSON", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 50, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 50, null, {
          code: "PYTHON_WORKER_HEALTH_CHECK_INVALID_RESPONSE",
          message: "invalid"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "ok" })))
    );

    const job = await processWorkerHealthCheckJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("PYTHON_WORKER_HEALTH_CHECK_INVALID_RESPONSE");
  });
});

function jobRow(
  status: "running" | "succeeded" | "failed",
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
