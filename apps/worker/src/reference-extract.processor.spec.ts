import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processNextReferenceExtractJob } from "./reference-extract.processor";

describe("processNextReferenceExtractJob", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("claims a queued reference extraction job and stores worker results", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          job_id: "job-1",
          project_id: "project-a",
          progress: 10,
          payload: {
            files: [
              {
                originalName: "sample.txt",
                mimeType: "text/plain",
                contentBase64: Buffer.from("hello").toString("base64")
              }
            ]
          }
        }
      ])
      .mockResolvedValueOnce([
        {
          jobId: "job-1",
          projectId: "project-a",
          type: "reference-extract",
          status: "succeeded",
          progress: 100,
          message: "Reference extraction completed.",
          result: { files: [] },
          error: null,
          createdAt: "2026-06-27T00:00:00.000Z",
          updatedAt: "2026-06-27T00:00:01.000Z"
        }
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ files: [] })))
    );

    const job = await processNextReferenceExtractJob(
      { query } as unknown as DataSource,
      "http://localhost:8000"
    );

    expect(job?.status).toBe("succeeded");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/extract",
      expect.objectContaining({ method: "POST" })
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
