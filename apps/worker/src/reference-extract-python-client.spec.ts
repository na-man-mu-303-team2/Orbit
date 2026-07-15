import { describe, expect, it, vi } from "vitest";

import {
  ReferenceExtractPythonClientError,
  parseReferenceFilesWithPython,
  parseSingleReferenceFileWithPython,
} from "./reference-extract-python-client";

const projectId = "project-a";

describe("reference extract Python client", () => {
  it("sends multiple Uint8Array files as multipart data", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const form = init?.body;
      expect(form).toBeInstanceOf(FormData);
      expect((form as FormData).get("project_id")).toBe(projectId);
      expect((form as FormData).getAll("file_ids")).toEqual([
        "file-1",
        "file-2",
      ]);
      const blobs = (form as FormData).getAll("files") as Blob[];
      expect(blobs).toHaveLength(2);
      expect(blobs[0]).toMatchObject({ size: 3, type: "application/pdf" });
      expect(blobs[1]).toMatchObject({ size: 4, type: "image/png" });

      return jsonResponse({
        files: [
          extractionFile("file-1", { mimeType: undefined }),
          extractionFile("file-2", { mimeType: "image/png" }),
        ],
      });
    });

    const result = await parseReferenceFilesWithPython({
      pythonWorkerUrl: "http://python-worker:8000",
      projectId,
      files: [
        {
          fileId: "file-1",
          originalName: "source.pdf",
          mimeType: "application/pdf",
          body: new Uint8Array([1, 2, 3]),
        },
        {
          fileId: "file-2",
          originalName: "image.png",
          mimeType: "image/png",
          body: new Uint8Array([4, 5, 6, 7]),
        },
      ],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://python-worker:8000/documents/parse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.files.map((file) => file.fileId)).toEqual([
      "file-1",
      "file-2",
    ]);
    expect(result.files[0]?.mimeType).toBe("application/pdf");
  });

  it("returns exactly the requested file from the single-file helper", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ files: [extractionFile("file-1")] }),
    );

    const result = await parseSingleReferenceFileWithPython({
      pythonWorkerUrl: "http://python-worker:8000",
      projectId,
      file: referenceFile("file-1"),
      fetchImpl,
    });

    expect(result).toMatchObject({
      fileId: "file-1",
      projectId,
      usable: true,
    });
  });

  it.each([
    ["no result", { files: [] }],
    [
      "more than one result",
      { files: [extractionFile("file-1"), extractionFile("file-2")] },
    ],
    [
      "a different project",
      { files: [extractionFile("file-1", { projectId: "project-b" })] },
    ],
    ["a different file", { files: [extractionFile("file-2")] }],
  ])("rejects %s from the single-file helper", async (_label, payload) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(payload));

    const error = await captureError(() =>
      parseSingleReferenceFileWithPython({
        pythonWorkerUrl: "http://python-worker:8000",
        projectId,
        file: referenceFile("file-1"),
        fetchImpl,
      }),
    );

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_EXTRACT_INVALID_RESPONSE",
      retryable: false,
    });
  });

  it.each([429, 500, 503])(
    "classifies HTTP %s as retryable without exposing the provider body",
    async (status) => {
      const providerBody = "secret provider response body";
      const fetchImpl = vi.fn<typeof fetch>(
        async () => new Response(providerBody, { status }),
      );

      const error = await captureError(() =>
        parseSingleReferenceFileWithPython({
          pythonWorkerUrl: "http://python-worker:8000",
          projectId,
          file: referenceFile("file-1"),
          fetchImpl,
        }),
      );

      expect(error).toMatchObject({
        code: "PYTHON_WORKER_EXTRACT_FAILED",
        retryable: true,
      });
      expect(error.message).not.toContain(providerBody);
    },
  );

  it("classifies other HTTP 4xx responses as non-retryable", async () => {
    const providerBody = "raw validation details";
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(providerBody, { status: 422 }),
    );

    const error = await captureError(() =>
      parseSingleReferenceFileWithPython({
        pythonWorkerUrl: "http://python-worker:8000",
        projectId,
        file: referenceFile("file-1"),
        fetchImpl,
      }),
    );

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_EXTRACT_FAILED",
      retryable: false,
    });
    expect(error.message).not.toContain(providerBody);
  });

  it("classifies network failures as retryable unavailable errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error("socket included unsafe upstream details");
    });

    const error = await captureError(() =>
      parseSingleReferenceFileWithPython({
        pythonWorkerUrl: "http://python-worker:8000",
        projectId,
        file: referenceFile("file-1"),
        fetchImpl,
      }),
    );

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_EXTRACT_UNAVAILABLE",
      retryable: true,
    });
    expect(error.message).not.toContain("unsafe upstream details");
  });

  it("classifies invalid JSON as a non-retryable invalid response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const error = await captureError(() =>
      parseSingleReferenceFileWithPython({
        pythonWorkerUrl: "http://python-worker:8000",
        projectId,
        file: referenceFile("file-1"),
        fetchImpl,
      }),
    );

    expect(error).toMatchObject({
      code: "PYTHON_WORKER_EXTRACT_INVALID_RESPONSE",
      retryable: false,
    });
    expect(error.message).not.toContain("not-json");
  });
});

function referenceFile(fileId: string) {
  return {
    fileId,
    originalName: `${fileId}.pdf`,
    mimeType: "application/pdf",
    body: new Uint8Array([1, 2, 3]),
  };
}

function extractionFile(
  fileId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectId,
    referenceDocumentId: fileId,
    fileName: `${fileId}.pdf`,
    mimeType: "application/pdf",
    kind: "pdf",
    status: "succeeded",
    rawText: "source text",
    cleanedText: "cleaned text",
    ...overrides,
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function captureError(run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error("Expected the client to reject.");
  } catch (error) {
    expect(error).toBeInstanceOf(ReferenceExtractPythonClientError);
    return error as ReferenceExtractPythonClientError;
  }
}
