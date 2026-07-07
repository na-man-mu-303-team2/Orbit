import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { DbJobQueue } from "./db-job-queue";

const row = {
  job_id: "job-1",
  project_id: "project-a",
  type: "reference-extract",
  status: "queued",
  progress: 0,
  message: "Job queued",
  payload: { fileCount: 1 },
  result: null,
  error: null,
  created_at: "2026-06-27T00:00:00.000Z",
  updated_at: "2026-06-27T00:00:00.000Z"
};

describe("DbJobQueue", () => {
  it("persists jobs through the database port", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ ...row, status: "running", progress: 10 }])
      .mockResolvedValueOnce([]);
    const queue = new DbJobQueue({ query } as unknown as DataSource);

    const created = await queue.enqueue({
      projectId: "project-a",
      type: "reference-extract",
      payload: { fileCount: 1 }
    });
    const updated = await queue.update(created.jobId, {
      status: "running",
      progress: 10
    });
    const missing = await queue.get("missing");

    expect(created.result).toBeNull();
    expect(updated?.status).toBe("running");
    expect(missing).toBeNull();
    expect(query).toHaveBeenCalledTimes(3);
  });
});
