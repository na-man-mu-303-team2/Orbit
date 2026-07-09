import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { ExtractService } from "../extract/extract.service";
import type { FilesService } from "../files/files.service";
import type { ReferenceSearchResponse } from "./references.schema";
import { ReferencesService } from "./references.service";

const validEnv = {
  NODE_ENV: "test",
  APP_ENV: "local",
  WEB_PORT: "5173",
  API_PORT: "3000",
  WORKER_PORT: "3001",
  PYTHON_WORKER_PORT: "8000",
  WEB_ORIGIN: "http://localhost:5173",
  API_BASE_URL: "http://localhost:3000",
  PYTHON_WORKER_URL: "http://localhost:8000",
  DATABASE_URL: "postgres://orbit:orbit@localhost:5432/orbit",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "local-session-secret-change-me",
  COOKIE_SECRET: "local-cookie-secret-change-me",
  STORAGE_DRIVER: "minio",
  S3_ENDPOINT: "http://localhost:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "orbit-local",
  S3_REGION: "ap-northeast-2",
  S3_ACCESS_KEY_ID: "orbit",
  S3_SECRET_ACCESS_KEY: "orbit-password",
  S3_FORCE_PATH_STYLE: "true",
  JOB_QUEUE_DRIVER: "bullmq",
  LIVE_STT_PROVIDER: "sherpa",
  REPORT_STT_PROVIDER: "openai",
  OCR_PROVIDER: "python",
  LLM_PROVIDER: "openai",
  OPENAI_API_KEY: "",
  OPENAI_MODEL: "gpt-4.1-mini",
  OPENAI_TRANSCRIPTION_MODEL: "gpt-4o-transcribe",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  AWS_REGION: "ap-northeast-2",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
  TRANSCRIBE_LANGUAGE_CODE: "ko-KR",
  TEXTRACT_ENABLED: "false",
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1"
};

describe("ReferencesService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the path project id to python-worker search", async () => {
    const workerResponse: ReferenceSearchResponse = {
      projectId: "project-a",
      query: "AI deck",
      status: "succeeded",
      message: "",
      chunks: [
        {
          chunkId: "chunk-1",
          projectId: "project-a",
          fileId: "file-1",
          chunkIndex: 0,
          content: "grounded evidence",
          metadata: { fileName: "source.pdf" },
          score: 0.91
        }
      ]
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(JSON.stringify(workerResponse), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createService().service.search("project-a", {
      query: "AI deck",
      limit: 2
    });

    expect(result.chunks[0]?.projectId).toBe("project-a");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/references/search",
      expect.objectContaining({
        method: "POST"
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      projectId: "project-a",
      query: "AI deck",
      limit: 2
    });
  });

  it("reads uploaded project reference assets before enqueueing extraction", async () => {
    const { service, filesService, extractService } = createService();

    const result = await service.extract("project-a", {
      fileIds: ["file-1"]
    });

    expect(filesService.getUploadedAsset).toHaveBeenCalledWith(
      "project-a",
      "file-1",
      "reference-material"
    );
    expect(filesService.readUploadedAssetContent).toHaveBeenCalledWith(
      "project-a",
      "file-1",
      "reference-material"
    );
    expect(extractService.extract).toHaveBeenCalledWith(
      [
        {
          originalname: "brief.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("pdf")
        }
      ],
      "project-a",
      ["file-1"]
    );
    expect(result.fileIds).toEqual(["file-1"]);
  });

  it("rejects unsupported reference asset MIME types before reading content", async () => {
    const { service, filesService } = createService({
      mimeType: "text/plain"
    });

    await expect(
      service.extract("project-a", { fileIds: ["file-1"] })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(filesService.readUploadedAssetContent).not.toHaveBeenCalled();
  });
});

function createService(options: { mimeType?: string } = {}) {
  const job = {
    jobId: "job-1",
    projectId: "project-a",
    type: "reference-extract" as const,
    status: "queued" as const,
    progress: 0,
    message: "Job queued",
    result: null,
    error: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
  const filesService = {
    getUploadedAsset: vi.fn(async () => ({
      fileId: "file-1",
      projectId: "project-a",
      originalName: "brief.pdf",
      mimeType: options.mimeType ?? "application/pdf",
      purpose: "reference-material",
      status: "uploaded"
    })),
    readUploadedAssetContent: vi.fn(async () => ({
      body: Buffer.from("pdf"),
      contentType: "application/pdf"
    }))
  };
  const extractService = {
    extract: vi.fn(async () => ({ files: [], job }))
  };

  return {
    filesService,
    extractService,
    service: new ReferencesService(
      filesService as unknown as FilesService,
      extractService as unknown as ExtractService
    )
  };
}
