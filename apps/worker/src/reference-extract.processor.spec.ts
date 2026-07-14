import type { DataSource } from "typeorm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processReferenceExtractJob } from "./reference-extract.processor";

const payload = {
  jobId: "job-1",
  projectId: "project-a",
  files: [
    {
      fileId: "file-1",
      originalName: "sample.pdf",
      mimeType: "application/pdf",
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

  it("keeps direct extraction text usable when indexing is unavailable", async () => {
    const extracted = {
      projectId: "project-a",
      referenceDocumentId: "file-1",
      fileName: "sample.pdf",
      kind: "pdf",
      status: "succeeded",
      rawText: "direct extraction text",
      cleanedText: "",
      indexingStatus: "unavailable"
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => [
        jobRow("succeeded", 100, params[4] as Record<string, unknown>, null)
      ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ files: [extracted] }))
      )
    );

    const job = await processReferenceExtractJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      payload
    );

    expect(job.result).toEqual({
      files: [
        expect.objectContaining({
          fileId: "file-1",
          mimeType: "application/pdf",
          usable: true,
          indexingStatus: "unavailable"
        })
      ]
    });
  });

  it("keeps ordered mixed results in a succeeded multi-file job", async () => {
    const mixedPayload = {
      ...payload,
      files: [
        payload.files[0],
        {
          fileId: "file-2",
          originalName: "broken.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          contentBase64: Buffer.from("broken").toString("base64")
        }
      ]
    };
    const extracted = [
      {
        projectId: "project-a",
        referenceDocumentId: "file-1",
        fileName: "sample.pdf",
        kind: "pdf",
        status: "succeeded",
        rawText: "usable reference text"
      },
      {
        projectId: "project-a",
        referenceDocumentId: "file-2",
        fileName: "broken.docx",
        kind: "docx",
        status: "failed",
        message: "Document extraction failed."
      }
    ];
    const query = vi
      .fn()
      .mockResolvedValueOnce([jobRow("running", 10, null, null)])
      .mockImplementationOnce(async (_sql: string, params: unknown[]) => [
        jobRow("succeeded", 100, params[4] as Record<string, unknown>, null)
      ]);
    const fetchMock = vi.fn(async (_input: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ files: extracted }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const job = await processReferenceExtractJob(
      { query } as unknown as DataSource,
      "http://localhost:8000",
      mixedPayload
    );

    expect(job.status).toBe("succeeded");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.body as FormData).getAll("file_ids")).toEqual([
      "file-1",
      "file-2"
    ]);
    expect(job.result).toEqual({
      files: [
        expect.objectContaining({
          fileId: "file-1",
          mimeType: "application/pdf",
          status: "succeeded",
          usable: true
        }),
        expect.objectContaining({
          fileId: "file-2",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          status: "failed",
          usable: false
        })
      ]
    });
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
    job_id: "job-1",
    project_id: "project-a",
    type: "reference-extract",
    status,
    progress,
    message: status,
    result,
    error,
    created_at: "2026-06-27T00:00:00.000Z",
    updated_at: "2026-06-27T00:00:01.000Z"
  };
}
