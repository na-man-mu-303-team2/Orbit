import { renderToStaticMarkup } from "react-dom/server";
import type { Job } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtractResultItem, getJobResultFiles, pollExtractJob } from "./App";

describe("reference extraction upload flow", () => {
  it("polls a succeeded job and renders its result", async () => {
    const file = {
      fileName: "sample.pdf",
      kind: "pdf",
      status: "succeeded",
      message: "done",
      rawText: "raw text",
      cleanedText: "cleaned text",
      cleanupStatus: "succeeded",
      keywords: [{ keyword: "deck", reason: "topic", priority: "high" }],
      keywordStatus: "succeeded",
      indexingStatus: "indexed",
      indexingMessage: "stored",
      chunkCount: 2
    };
    const baseJob: Job = {
      jobId: "job-1",
      projectId: "project-a",
      type: "reference-extract",
      status: "running",
      progress: 10,
      message: "Reference extraction running.",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(baseJob)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...baseJob,
            status: "succeeded",
            progress: 100,
            result: { files: [file] }
          })
        )
      );

    const job = await pollExtractJob("job-1", { delayMs: 0, fetcher });
    const [result] = getJobResultFiles(job);
    const html = renderToStaticMarkup(<ExtractResultItem result={result} />);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/jobs/job-1");
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/jobs/job-1");
    expect(html).toContain("sample.pdf");
    expect(html).toContain("cleaned text");
    expect(html).toContain("2 chunks");
  });
});
