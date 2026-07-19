import type { Job } from "@orbit/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Repository } from "typeorm";

import type { DecksService } from "../decks/decks.service";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import { PresentationRunEntity } from "./presentation-run.entity";
import type { PresentationSessionsService } from "./presentation-sessions.service";
import {
  PresentationRunsService,
  type PresentationAnalysisEnqueueJob,
} from "./presentation-runs.service";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({
    JOB_QUEUE_DRIVER: "bullmq",
    REDIS_URL: "redis://localhost:6379",
    REHEARSAL_AUDIO_MAX_BYTES: 25 * 1024 * 1024,
  }),
}));

const now = new Date("2026-07-20T00:00:00.000Z");

function makeRun(
  patch: Partial<PresentationRunEntity> = {},
): PresentationRunEntity {
  return Object.assign(new PresentationRunEntity(), {
    runId: "presentation_run_1",
    projectId: "project_1",
    sessionId: "session_1",
    deckId: "deck_1",
    deckVersion: 4,
    deckSnapshot: { deckId: "deck_1", version: 4 },
    recordingMode: "microphone",
    audioFileId: null,
    jobId: null,
    status: "created",
    error: null,
    voiceReport: null,
    rawAudioDeletedAt: null,
    rawAudioDeleteDeadlineAt: null,
    startedAt: now,
    endedAt: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}

function createService(existingRun: PresentationRunEntity | null = null) {
  let storedRun = existingRun;
  const repository = {
    findOne: vi.fn(async () => storedRun),
    create: vi.fn((value) => makeRun(value)),
    save: vi.fn(async (value) => {
      storedRun = value;
      return value;
    }),
    update: vi.fn(async (_criteria, patch) => {
      if (storedRun) Object.assign(storedRun, patch);
      return { affected: storedRun ? 1 : 0 };
    }),
  } as unknown as Repository<PresentationRunEntity>;
  const sessions = {
    getSessionForPresenter: vi.fn().mockResolvedValue({
      sessionId: "session_1",
      projectId: "project_1",
      deckId: "deck_1",
      deckVersion: 4,
    }),
  } as unknown as PresentationSessionsService;
  const decks = {
    getDeck: vi.fn().mockResolvedValue({
      deck: { deckId: "deck_1", version: 4 },
    }),
  } as unknown as DecksService;
  const files = {
    createPresentationAudioUploadUrl: vi.fn(),
    completeUpload: vi.fn(),
    getUploadedAsset: vi.fn(),
  } as unknown as FilesService;
  const queuedJob: Job = {
    jobId: "job_1",
    projectId: "project_1",
    type: "presentation-analysis",
    status: "queued",
    progress: 0,
    message: "Job queued",
    result: null,
    error: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const jobs = {
    create: vi.fn().mockResolvedValue(queuedJob),
    get: vi.fn().mockResolvedValue(queuedJob),
    update: vi.fn(),
  } as unknown as JobsService;
  const enqueue = vi.fn().mockResolvedValue(undefined) as unknown as
    PresentationAnalysisEnqueueJob;
  const logger = { info: vi.fn(), error: vi.fn() } as never;

  return {
    decks,
    enqueue,
    files,
    jobs,
    repository,
    service: new PresentationRunsService(
      repository,
      sessions,
      decks,
      files,
      jobs,
      enqueue,
      logger,
    ),
  };
}

describe("PresentationRunsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one run per presentation session and reuses it", async () => {
    const fixture = createService();

    const first = await fixture.service.createRun("project_1", "session_1", {
      expectedDeckVersion: 4,
      recordingMode: "microphone",
    });
    const second = await fixture.service.createRun("project_1", "session_1", {
      expectedDeckVersion: 4,
      recordingMode: "microphone",
    });

    expect(first.run.runId).toMatch(/^presentation_run_/);
    expect(second.run.runId).toBe(first.run.runId);
    expect(fixture.repository.save).toHaveBeenCalledTimes(1);
    expect(fixture.decks.getDeck).toHaveBeenCalledTimes(1);
  });

  it("finds the single presentation run by session for report routing", async () => {
    const fixture = createService(makeRun({ status: "succeeded" }));

    const result = await fixture.service.getSessionRun(
      "project_1",
      "session_1",
    );

    expect(result.run).toMatchObject({
      runId: "presentation_run_1",
      sessionId: "session_1",
      status: "succeeded",
    });
    expect(fixture.repository.findOne).toHaveBeenCalledWith({
      where: { projectId: "project_1", sessionId: "session_1" },
    });
  });

  it("finishes a no-microphone run without creating an analysis job", async () => {
    const fixture = createService(
      makeRun({ recordingMode: "none", status: "created" }),
    );

    const result = await fixture.service.completeAudio(
      "project_1",
      "session_1",
      "presentation_run_1",
      { withoutAudio: true },
    );

    expect(result).toMatchObject({
      run: { status: "succeeded", recordingMode: "none" },
      job: null,
    });
    expect(fixture.jobs.create).not.toHaveBeenCalled();
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues the presentation-only analysis job after audio upload", async () => {
    const fixture = createService(
      makeRun({
        status: "uploading",
        audioFileId: "file_1",
      }),
    );

    const result = await fixture.service.completeAudio(
      "project_1",
      "session_1",
      "presentation_run_1",
      { fileId: "file_1" },
    );

    expect(result.job).toMatchObject({
      jobId: "job_1",
      type: "presentation-analysis",
    });
    expect(fixture.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        sessionId: "session_1",
        runId: "presentation_run_1",
        audioFileId: "file_1",
      }),
    );
  });

  it("retries a failed analysis without touching rehearsal data", async () => {
    const fixture = createService(
      makeRun({
        status: "failed",
        audioFileId: "file_1",
        error: { code: "PRESENTATION_AUDIO_ANALYSIS_FAILED", message: "fail" },
      }),
    );

    const result = await fixture.service.retryAnalysis(
      "project_1",
      "session_1",
      "presentation_run_1",
    );

    expect(result).toMatchObject({
      run: { status: "processing", jobId: "job_1" },
      job: { type: "presentation-analysis" },
    });
    expect(fixture.files.getUploadedAsset).toHaveBeenCalledWith(
      "project_1",
      "file_1",
      "presentation-audio",
    );
    expect(fixture.enqueue).toHaveBeenCalledTimes(1);
  });
});
