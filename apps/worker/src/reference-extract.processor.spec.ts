import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processReferenceExtractJob } from "./reference-extract.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  files: [
    {
      fileId: "file-1",
      originalName: "sample.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("hello").toString("base64")
    }
  ]
};

describe("processReferenceExtractJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls documents parse and stores worker results", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([
        jobRow("succeeded", 100, { files: [] }, null)
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ files: [] })))
    );

    const job = await processReferenceExtractJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/documents/parse",
      expect.objectContaining({ method: "POST" })
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("marks the DB job failed when documents parse fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockResolvedValueOnce([
        jobRow("failed", 10, null, {
          code: "PYTHON_WORKER_EXTRACT_FAILED",
          message: "bad parse"
        })
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad parse", { status: 500 }))
    );

    const job = await processReferenceExtractJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("bad parse");
    expect(query).toHaveBeenCalledTimes(2);
  });
});

function jobRow(
  status: "running" | "succeeded" | "failed",
  progress: number,
  result: Record<string, unknown> | null,
  error: { code: string; message: string } | null
) {
  return {
    jobId: "job-1",
    projectId: "project-a",
    type: "reference-extract",
    status,
    progress,
    message: status,
    result,
    error,
    createdAt: "2026-06-27T00:00:00.000Z",
    updatedAt: "2026-06-27T00:00:01.000Z"
  };
}
