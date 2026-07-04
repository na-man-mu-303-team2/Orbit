import type { Job } from "@orbit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import type { ProjectsService } from "../projects/projects.service";
import { GenerateDeckService } from "./generate-deck.service";

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
  STT_PROVIDER: "sherpa",
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

describe("GenerateDeckService", () => {
  beforeEach(() => {
    Object.assign(process.env, validEnv);
  });

  it("creates an AI deck generation job and enqueues the worker payload", async () => {
    const job: Job = {
      jobId: "job-1",
      projectId: "project_generated_1",
      type: "ai-deck-generation",
      status: "queued",
      progress: 0,
      message: "Job queued",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn()
    } as unknown as JobsService;
    const projectsService = {
      getAccessibleProject: vi.fn(async () => ({
        projectId: "project_generated_1",
        workspaceId: "workspace_demo_1",
        title: "AI 생성 덱",
        createdBy: "user_demo_1",
        createdAt: "2026-06-27T00:00:00.000Z"
      }))
    } as unknown as ProjectsService;
    const enqueueJob = vi.fn(async () => undefined);

    const result = await new GenerateDeckService(
      jobsService,
      projectsService,
      enqueueJob
    ).createJob("project_generated_1", {
      topic: "AI 덱 생성",
      designPrompt: "retro pixel palette",
      references: [{ fileId: "file_1" }]
    });

    expect(result).toEqual({ job });
    expect(projectsService.getAccessibleProject).toHaveBeenCalledWith(
      "project_generated_1"
    );
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: "project_generated_1",
      type: "ai-deck-generation",
      payload: {
        request: expect.objectContaining({
          topic: "AI 덱 생성",
          designPrompt: "retro pixel palette",
          references: [{ fileId: "file_1" }]
        })
      }
    });
    expect(enqueueJob).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project_generated_1",
      request: expect.objectContaining({
        topic: "AI 덱 생성",
        designPrompt: "retro pixel palette"
      })
    });
  });

  it("validates PPTX design references before enqueue", async () => {
    const job: Job = {
      jobId: "job-design",
      projectId: "project_generated_1",
      type: "ai-deck-generation",
      status: "queued",
      progress: 0,
      message: "Job queued",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn()
    } as unknown as JobsService;
    const projectsService = {
      getAccessibleProject: vi.fn(async () => ({
        projectId: "project_generated_1",
        workspaceId: "workspace_demo_1",
        title: "AI deck",
        createdBy: "user_demo_1",
        createdAt: "2026-06-27T00:00:00.000Z"
      }))
    } as unknown as ProjectsService;
    const enqueueJob = vi.fn(async () => undefined);
    const filesService = {
      getUploadedAsset: vi.fn(async () => ({
        fileId: "file_design_1",
        projectId: "project_generated_1",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      }))
    } as unknown as FilesService;

    await new GenerateDeckService(
      jobsService,
      projectsService,
      enqueueJob,
      filesService
    ).createJob("project_generated_1", {
      topic: "AI deck",
      designReferences: [{ fileId: "file_design_1" }]
    });

    expect(filesService.getUploadedAsset).toHaveBeenCalledWith(
      "project_generated_1",
      "file_design_1"
    );
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          designReferences: [{ fileId: "file_design_1" }]
        })
      })
    );
  });

  it("rejects non-PPTX design references", async () => {
    const jobsService = {
      create: vi.fn(),
      update: vi.fn()
    } as unknown as JobsService;
    const projectsService = {
      getAccessibleProject: vi.fn(async () => ({
        projectId: "project_generated_1",
        workspaceId: "workspace_demo_1",
        title: "AI deck",
        createdBy: "user_demo_1",
        createdAt: "2026-06-27T00:00:00.000Z"
      }))
    } as unknown as ProjectsService;
    const filesService = {
      getUploadedAsset: vi.fn(async () => ({
        fileId: "file_pdf",
        projectId: "project_generated_1",
        mimeType: "application/pdf"
      }))
    } as unknown as FilesService;

    await expect(
      new GenerateDeckService(
        jobsService,
        projectsService,
        vi.fn(async () => undefined),
        filesService
      ).createJob("project_generated_1", {
        topic: "AI deck",
        designReferences: [{ fileId: "file_pdf" }]
      })
    ).rejects.toThrow("Design references must be uploaded PPTX files.");
    expect(jobsService.create).not.toHaveBeenCalled();
  });

  it("accepts a non-demo project id for AI deck generation", async () => {
    const job: Job = {
      jobId: "job-2",
      projectId: "project_custom_1",
      type: "ai-deck-generation",
      status: "queued",
      progress: 0,
      message: "Job queued",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn()
    } as unknown as JobsService;
    const projectsService = {
      getAccessibleProject: vi.fn(async () => ({
        projectId: "project_custom_1",
        workspaceId: "workspace_demo_1",
        title: "프로젝트별 AI 덱 생성",
        createdBy: "user_demo_1",
        createdAt: "2026-06-27T00:00:00.000Z"
      }))
    } as unknown as ProjectsService;
    const enqueueJob = vi.fn(async () => undefined);

    const result = await new GenerateDeckService(
      jobsService,
      projectsService,
      enqueueJob
    ).createJob("project_custom_1", {
      topic: "프로젝트별 AI 덱 생성",
      references: []
    });

    expect(result).toEqual({ job });
    expect(projectsService.getAccessibleProject).toHaveBeenCalledWith(
      "project_custom_1"
    );
    expect(jobsService.create).toHaveBeenCalledWith({
      projectId: "project_custom_1",
      type: "ai-deck-generation",
      payload: {
        request: expect.objectContaining({
          topic: "프로젝트별 AI 덱 생성"
        })
      }
    });
  });
});
