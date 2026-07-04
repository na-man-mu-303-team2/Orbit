import type { AssetUploadUrlResponse, Job } from "@orbit/shared";
import { BadRequestException } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";
import type { DecksService } from "../decks/decks.service";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import type { ProjectsService } from "../projects/projects.service";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import { RehearsalsService, type RehearsalSttEnqueueJob } from "./rehearsals.service";

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
  LOG_LEVEL: "debug",
  LOG_PRETTY: "false",
  DEMO_USER_ID: "user_demo_1",
  DEMO_WORKSPACE_ID: "workspace_demo_1",
  DEMO_PROJECT_ID: "project_demo_1",
  DEMO_DECK_ID: "deck_demo_1",
  DEMO_SESSION_ID: "session_demo_1"
};

const createdAt = new Date("2026-06-27T00:00:00.000Z");
const rawAudioDeletedAt = "2026-06-27T00:00:05.000Z";

const job: Job = {
  jobId: "job-1",
  projectId: "project-a",
  type: "rehearsal-stt",
  status: "queued",
  progress: 0,
  message: "Job queued",
  result: null,
  error: null,
  createdAt: createdAt.toISOString(),
  updatedAt: createdAt.toISOString()
};

const upload: AssetUploadUrlResponse = {
  fileId: "file-audio",
  projectId: "project-a",
  uploadUrl: "http://localhost:5173/api/v1/projects/project-a/assets/file-audio/content",
  method: "PUT",
  headers: { "content-type": "audio/webm" },
  expiresAt: "2026-06-27T00:15:00.000Z",
  purpose: "rehearsal-audio"
};

const reportJson = {
  reportId: "report_run-1",
  runId: "run-1",
  projectId: "project-a",
  deckId: "deck-a",
  transcriptRetained: false,
  transcript: null,
  metrics: {
    durationSeconds: 30,
    wordsPerMinute: 120,
    fillerWordCount: 1,
    pauseCount: 0,
    keywordCoverage: 1
  },
  coaching: {
    status: "succeeded",
    summary: "clear",
    strengths: ["키워드를 언급했습니다."],
    improvements: ["불필요한 filler를 줄이세요."],
    nextPracticeFocus: "도입부를 더 짧게 연습하세요.",
    message: ""
  },
  generatedAt: rawAudioDeletedAt
};

describe("RehearsalsService", () => {
  beforeEach(() => {
    delete process.env.REHEARSAL_AUDIO_MAX_BYTES;
    Object.assign(process.env, validEnv);
  });

  it("creates a rehearsal run for the project deck", async () => {
    const service = createService();

    const result = await service.createRun("project-a", { deckId: "deck-a" });

    expect(result.run).toMatchObject({
      projectId: "project-a",
      deckId: "deck-a",
      audioFileId: null,
      jobId: null,
      status: "created"
    });
    expect(result.run.runId).toMatch(/^run_/);
  });

  it("rejects run creation when the deckId does not match the project deck", async () => {
    const service = createService();

    await expect(service.createRun("project-a", { deckId: "deck-other" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("creates an upload URL and pins the audio file to the run", async () => {
    const service = createService();
    const run = await createRun(service);

    const result = await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    expect(result.upload).toEqual(upload);
    expect(result.run).toMatchObject({
      runId: run.runId,
      audioFileId: "file-audio",
      status: "uploading"
    });
    expect(service.testFilesService.createUploadUrl).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({
        originalName: "rehearsal.webm",
        mimeType: "audio/webm",
        size: 1024,
        purpose: "rehearsal-audio"
      })
    );
  });

  it("uses REHEARSAL_AUDIO_MAX_BYTES when validating rehearsal uploads", async () => {
    Object.assign(process.env, {
      ...validEnv,
      REHEARSAL_AUDIO_MAX_BYTES: "1024"
    });
    const service = createService();
    const run = await createRun(service);

    await expect(
      service.createAudioUploadUrl(run.runId, {
        originalName: "rehearsal.flac",
        mimeType: "audio/flac",
        size: 1025
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(service.testFilesService.createUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects rehearsal uploads above the implemented OpenAI report STT limit", async () => {
    Object.assign(process.env, {
      ...validEnv,
      REHEARSAL_AUDIO_MAX_BYTES: "25000001"
    });

    expect(() => createService()).toThrow(/REHEARSAL_AUDIO_MAX_BYTES/);
  });

  it("completes upload, enqueues STT work, and marks the run processing", async () => {
    const enqueueJob = vi.fn(async () => undefined);
    const service = createService({ enqueueJob });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    const result = await service.completeAudioUpload(run.runId, {
      fileId: "file-audio"
    });

    expect(result.run).toMatchObject({
      runId: run.runId,
      status: "processing",
      audioFileId: "file-audio",
      jobId: "job-1"
    });
    expect(result.job).toEqual(job);
    expect(enqueueJob).toHaveBeenCalledWith({
      driver: "bullmq",
      redisUrl: "redis://localhost:6379",
      jobId: "job-1",
      projectId: "project-a",
      runId: run.runId,
      deckId: "deck-a",
      audioFileId: "file-audio"
    });
  });

  it("stores strict rehearsal run meta before audio completion", async () => {
    const service = createService();
    const run = await createRun(service);

    const result = await service.updateRunMeta(run.runId, {
      slideTimeline: [{ slideId: "slide_1", enteredAt: "2026-07-02T00:00:00.000Z" }],
      missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1" }],
      adviceEvents: [{ type: "pace-too-fast", at: "2026-07-02T00:00:30.000Z" }]
    });

    expect(result.run.runId).toBe(run.runId);
    expect((await service.testRehearsalRuns.findOne({ where: { runId: run.runId } }))?.metaJson)
      .toEqual({
        slideTimeline: [{ slideId: "slide_1", enteredAt: "2026-07-02T00:00:00.000Z" }],
        missedKeywords: [{ slideId: "slide_1", keywordId: "kw_1" }],
        adviceEvents: [{ type: "pace-too-fast", at: "2026-07-02T00:00:30.000Z" }]
      });
  });

  it("rejects sensitive rehearsal run meta fields", async () => {
    const service = createService();
    const run = await createRun(service);

    await expect(
      service.updateRunMeta(run.runId, {
        slideTimeline: [],
        missedKeywords: [],
        adviceEvents: [],
        transcript: "민감한 전사 원문"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("marks the run and job failed when enqueue fails", async () => {
    const deleteUploadedAsset = vi.fn(async () => rawAudioDeletedAt);
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn(async () => ({ ...job, status: "failed" }))
    } as unknown as JobsService;
    const service = createService({
      enqueueJob: vi.fn(async () => {
        throw new Error("redis down");
      }),
      jobsService,
      filesServicePatch: { deleteUploadedAsset }
    });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    await expect(service.completeAudioUpload(run.runId, { fileId: "file-audio" })).rejects.toThrow(
      "redis down"
    );

    expect(deleteUploadedAsset).toHaveBeenCalledWith("project-a", "file-audio", "rehearsal-audio");
    expect(jobsService.update).toHaveBeenCalledWith("job-1", {
      status: "failed",
      progress: 0,
      message: "Rehearsal STT enqueue failed.",
      error: {
        code: "REHEARSAL_STT_ENQUEUE_FAILED",
        message: "redis down"
      }
    });
    expect((await service.getRun(run.runId)).run).toMatchObject({
      status: "failed",
      rawAudioDeletedAt,
      error: {
        code: "REHEARSAL_STT_ENQUEUE_FAILED",
        message: "redis down"
      }
    });
  });

  it("marks raw audio cleanup failure when enqueue cleanup fails", async () => {
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn(async () => ({ ...job, status: "failed" }))
    } as unknown as JobsService;
    const service = createService({
      enqueueJob: vi.fn(async () => {
        throw new Error("redis down");
      }),
      jobsService,
      filesServicePatch: {
        deleteUploadedAsset: vi.fn(async () => {
          throw new Error("delete down");
        })
      }
    });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    await expect(service.completeAudioUpload(run.runId, { fileId: "file-audio" })).rejects.toThrow(
      "redis down"
    );

    expect(jobsService.update).toHaveBeenCalledWith("job-1", {
      status: "failed",
      progress: 0,
      message: "Rehearsal raw audio cleanup failed.",
      error: {
        code: "RAW_AUDIO_DELETE_FAILED",
        message: "delete down"
      }
    });
    expect((await service.getRun(run.runId)).run).toMatchObject({
      status: "failed",
      rawAudioDeletedAt: null,
      error: {
        code: "RAW_AUDIO_DELETE_FAILED",
        message: "delete down"
      }
    });
  });

  it("does not create another job when audio complete is repeated", async () => {
    const jobsService = {
      create: vi.fn(async () => job),
      update: vi.fn()
    } as unknown as JobsService;
    const service = createService({ jobsService });
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });

    await service.completeAudioUpload(run.runId, { fileId: "file-audio" });
    await expect(
      service.completeAudioUpload(run.runId, { fileId: "file-audio" })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(jobsService.create).toHaveBeenCalledTimes(1);
  });

  it("returns a null report while the rehearsal is still processing", async () => {
    const service = createService();
    const run = await createRun(service);
    await service.createAudioUploadUrl(run.runId, {
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024
    });
    await service.completeAudioUpload(run.runId, { fileId: "file-audio" });

    const result = await service.getReport(run.runId);

    expect(result.run.status).toBe("processing");
    expect(result.report).toBeNull();
    expect(service.testProjectsService.getAccessibleProject).toHaveBeenCalledWith("project-a");
  });

  it("returns the saved report JSON for a succeeded rehearsal", async () => {
    const service = createService();
    const run = await createRun(service);
    await saveRunPatch(service, run.runId, {
      status: "succeeded",
      reportJson,
      transcriptRetained: false,
      rawAudioDeletedAt: new Date(rawAudioDeletedAt)
    });

    const result = await service.getReport(run.runId);

    expect(result.run.status).toBe("succeeded");
    expect(result.report).toMatchObject({
      reportId: "report_run-1",
      transcriptRetained: false,
      transcript: null,
      metrics: {
        wordsPerMinute: 120,
        keywordCoverage: 1
      }
    });
  });
});

async function createRun(service: ReturnType<typeof createService>) {
  return (await service.createRun("project-a", { deckId: "deck-a" })).run;
}

async function saveRunPatch(
  service: ReturnType<typeof createService>,
  runId: string,
  patch: Partial<RehearsalRunEntity>
) {
  const run = await service.testRehearsalRuns.findOne({ where: { runId } });
  if (!run) {
    throw new Error(`Missing test run: ${runId}`);
  }

  await service.testRehearsalRuns.save({ ...run, ...patch });
}

function createService(
  options: {
    enqueueJob?: RehearsalSttEnqueueJob;
    jobsService?: JobsService;
    filesServicePatch?: Partial<FilesService>;
  } = {}
) {
  const logger = createLogger();
  const repository = createRunRepository();
  const filesService = {
    createUploadUrl: vi.fn(async () => upload),
    completeUpload: vi.fn(async () => ({
      fileId: "file-audio",
      projectId: "project-a",
      originalName: "rehearsal.webm",
      mimeType: "audio/webm",
      size: 1024,
      url: "http://localhost:9000/rehearsal.webm",
      purpose: "rehearsal-audio",
      createdAt: createdAt.toISOString()
    })),
    getUploadedAsset: vi.fn(async () => ({
      fileId: "file-audio",
      projectId: "project-a",
      purpose: "rehearsal-audio",
      status: "uploaded"
    })),
    deleteUploadedAsset: vi.fn(async () => rawAudioDeletedAt),
    ...options.filesServicePatch
  } as unknown as FilesService;
  const projectsService = {
    getAccessibleProject: vi.fn(async (projectId: string) => ({
      projectId,
      workspaceId: "workspace-a",
      title: "Project A",
      createdBy: "user-a",
      createdAt: createdAt.toISOString()
    }))
  } as unknown as ProjectsService;
  const service = new RehearsalsService(
    repository,
    {
      getDeck: vi.fn(async () => ({
        projectId: "project-a",
        deck: { deckId: "deck-a" },
        updatedAt: createdAt.toISOString()
      }))
    } as unknown as DecksService,
    projectsService,
    filesService,
    options.jobsService ??
      ({
        create: vi.fn(async () => job),
        update: vi.fn()
      } as unknown as JobsService),
    options.enqueueJob ?? vi.fn(async () => undefined),
    logger
  );
  return Object.assign(service, {
    testRehearsalRuns: repository,
    testProjectsService: projectsService as ProjectsService & {
      getAccessibleProject: ReturnType<typeof vi.fn>;
    },
    testFilesService: filesService as FilesService & {
      createUploadUrl: ReturnType<typeof vi.fn>;
    },
    testLogger: logger
  });
}

function createRunRepository() {
  const runs = new Map<string, RehearsalRunEntity>();

  return {
    create(input: Partial<RehearsalRunEntity>) {
      return input as RehearsalRunEntity;
    },
    async save(run: RehearsalRunEntity) {
      runs.set(run.runId, { ...run });
      return runs.get(run.runId) as RehearsalRunEntity;
    },
    async findOne(options: { where: { runId: string } }) {
      return runs.get(options.where.runId) ?? null;
    },
    async update(criteria: Partial<RehearsalRunEntity>, patch: Partial<RehearsalRunEntity>) {
      const run = [...runs.values()].find((candidate) =>
        Object.entries(criteria).every(
          ([key, value]) => candidate[key as keyof RehearsalRunEntity] === value
        )
      );

      if (!run) {
        return { affected: 0 };
      }

      Object.assign(run, patch);
      runs.set(run.runId, { ...run });
      return { affected: 1 };
    }
  } as unknown as Repository<RehearsalRunEntity>;
}

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn()
  } as unknown as PinoLogger;
}
