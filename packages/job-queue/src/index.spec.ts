import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "./index";

describe("InMemoryJobQueue", () => {
  it("updates queued jobs with shared job status values", async () => {
    const queue = new InMemoryJobQueue();
    const job = await queue.enqueue({
      projectId: "project-a",
      type: "reference-extract"
    });

    const updated = await queue.update(job.jobId, {
      status: "succeeded",
      progress: 100,
      message: "done",
      result: { fileCount: 1 }
    });

    expect(updated?.status).toBe("succeeded");
    expect(updated?.progress).toBe(100);
    expect(await queue.get(job.jobId)).toEqual(updated);
  });
});
