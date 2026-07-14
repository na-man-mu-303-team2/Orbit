import { describe, expect, it, vi } from "vitest";
import { createPptxImportJob, waitForPptxImportJob } from "./pptxImportApi";

const baseJob = {
  jobId: "job-pptx",
  projectId: "project-new",
  type: "pptx-import" as const,
  progress: 0,
  message: "queued",
  result: null,
  error: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("pptxImportApi", () => {
  it("creates a production PPTX import job", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ job: { ...baseJob, status: "queued" } })));

    await expect(createPptxImportJob("project-new", "file-pptx", fetcher)).resolves.toMatchObject({ jobId: "job-pptx" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project-new/pptx-imports",
      expect.objectContaining({ body: JSON.stringify({ fileId: "file-pptx" }), method: "POST" }),
    );
  });

  it("polls until the import job reaches a terminal state", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...baseJob, status: "running", progress: 60 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...baseJob, status: "succeeded", progress: 100 })));

    await expect(waitForPptxImportJob("job-pptx", fetcher, { pollIntervalMs: 0 })).resolves.toMatchObject({ status: "succeeded" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
