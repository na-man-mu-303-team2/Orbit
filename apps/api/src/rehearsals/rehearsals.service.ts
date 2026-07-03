import type { EnqueueRehearsalSttJobInput } from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import {
  completeRehearsalAudioUploadRequestSchema,
  completeRehearsalAudioUploadResponseSchema,
  createAssetUploadUrlRequestSchema,
  createRehearsalAudioUploadUrlRequestSchema,
  createRehearsalAudioUploadUrlResponseSchema,
  createRehearsalRunRequestSchema,
  createRehearsalRunResponseSchema,
  getRehearsalReportResponseSchema,
  getRehearsalRunResponseSchema,
  updateRehearsalRunMetaRequestSchema,
  updateRehearsalRunMetaResponseSchema,
  type RehearsalRun
} from "@orbit/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Repository } from "typeorm";
import { parseRequest } from "../common/zod-request";
import { DecksService } from "../decks/decks.service";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";
import { ProjectsService } from "../projects/projects.service";
import { RehearsalRunEntity } from "./rehearsal-run.entity";

export type RehearsalSttEnqueueJob = (input: EnqueueRehearsalSttJobInput) => Promise<void>;

export const REHEARSAL_STT_ENQUEUE_JOB = "REHEARSAL_STT_ENQUEUE_JOB";

@Injectable()
export class RehearsalsService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });
  private readonly rehearsalAudioUploadRequestSchema = createAssetUploadUrlRequestSchema({
    maxRehearsalAudioUploadSizeBytes: this.config.REHEARSAL_AUDIO_MAX_BYTES
  });

  constructor(
    @InjectRepository(RehearsalRunEntity)
    private readonly rehearsalRuns: Repository<RehearsalRunEntity>,
    private readonly decksService: DecksService,
    private readonly projectsService: ProjectsService,
    private readonly filesService: FilesService,
    private readonly jobsService: JobsService,
    @Inject(REHEARSAL_STT_ENQUEUE_JOB)
    private readonly enqueueJob: RehearsalSttEnqueueJob,
    @InjectPinoLogger(RehearsalsService.name)
    private readonly logger: PinoLogger
  ) {}

  async createRun(projectId: string, body: unknown) {
    const request = parseRequest(createRehearsalRunRequestSchema, body);
    const deckResponse = await this.decksService.getDeck(projectId);
    if (deckResponse.deck.deckId !== request.deckId) {
      throw new BadRequestException("deckId does not match the project deck.");
    }

    const now = new Date();
    const run = await this.rehearsalRuns.save(
      this.rehearsalRuns.create({
        runId: `run_${randomUUID()}`,
        projectId,
        deckId: request.deckId,
        audioFileId: null,
        jobId: null,
        status: "created",
        error: null,
        reportJson: null,
        metaJson: {},
        transcriptRetained: false,
        rawAudioDeletedAt: null,
        createdAt: now,
        updatedAt: now
      })
    );

    return createRehearsalRunResponseSchema.parse({ run: toRehearsalRun(run) });
  }

  async createAudioUploadUrl(runId: string, body: unknown) {
    const request = parseRequest(createRehearsalAudioUploadUrlRequestSchema, body);
    const run = await this.getRunEntity(runId);

    if (!["created", "uploading"].includes(run.status)) {
      throw new BadRequestException("Rehearsal run is not accepting uploads.");
    }

    const upload = await this.filesService.createUploadUrl(
      run.projectId,
      parseRequest(this.rehearsalAudioUploadRequestSchema, {
        ...request,
        purpose: "rehearsal-audio"
      })
    );

    run.audioFileId = upload.fileId;
    run.status = "uploading";
    run.error = null;
    run.updatedAt = new Date();
    const savedRun = await this.rehearsalRuns.save(run);

    return createRehearsalAudioUploadUrlResponseSchema.parse({
      run: toRehearsalRun(savedRun),
      upload
    });
  }

  async completeAudioUpload(runId: string, body: unknown) {
    const request = parseRequest(completeRehearsalAudioUploadRequestSchema, body);
    const run = await this.getRunEntity(runId);

    if (run.status !== "uploading") {
      throw new BadRequestException("Rehearsal run has no pending audio upload.");
    }

    if (run.audioFileId !== request.fileId) {
      throw new BadRequestException("fileId does not match the rehearsal run.");
    }

    await this.filesService.completeUpload(run.projectId, {
      fileId: request.fileId
    });
    await this.filesService.getUploadedAsset(run.projectId, request.fileId, "rehearsal-audio");

    const claimedRun = await this.claimAudioUpload(run, request.fileId);
    if (!claimedRun) {
      throw new BadRequestException("Rehearsal run has no pending audio upload.");
    }

    const queuedJob = await this.jobsService.create({
      projectId: run.projectId,
      type: "rehearsal-stt",
      payload: {
        audioFileId: request.fileId,
        deckId: run.deckId,
        runId: run.runId
      }
    });

    claimedRun.jobId = queuedJob.jobId;
    claimedRun.updatedAt = new Date();
    await this.rehearsalRuns.save(claimedRun);

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId: run.projectId,
        runId: run.runId,
        deckId: run.deckId,
        audioFileId: request.fileId
      });

      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: claimedRun.projectId,
          runId: claimedRun.runId,
          deckId: claimedRun.deckId,
          audioFileId: request.fileId,
          driver: this.config.JOB_QUEUE_DRIVER
        },
        "Rehearsal STT job enqueued."
      );

      return completeRehearsalAudioUploadResponseSchema.parse({
        run: toRehearsalRun(claimedRun),
        job: queuedJob
      });
    } catch (error) {
      const failure = await this.cleanupAfterEnqueueFailure(claimedRun, request.fileId, error);
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: failure.jobMessage,
        error: failure.error
      });
      claimedRun.status = "failed";
      claimedRun.error = failure.error;
      claimedRun.rawAudioDeletedAt = failure.rawAudioDeletedAt;
      claimedRun.updatedAt = new Date();
      await this.rehearsalRuns.save(claimedRun);
      this.logger.error(
        {
          event: "job.enqueue_failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId: claimedRun.projectId,
          runId: claimedRun.runId,
          deckId: claimedRun.deckId,
          audioFileId: request.fileId,
          driver: this.config.JOB_QUEUE_DRIVER,
          cleanupError: failure.cleanupError ? serializeLogError(failure.cleanupError) : undefined,
          error: serializeLogError(error)
        },
        "Rehearsal STT enqueue failed."
      );
      throw error;
    }
  }

  async updateRunMeta(runId: string, body: unknown) {
    const request = parseRequest(updateRehearsalRunMetaRequestSchema, body);
    const run = await this.getRunEntity(runId);

    if (!["created", "uploading", "processing"].includes(run.status)) {
      throw new BadRequestException("Rehearsal run is not accepting meta updates.");
    }

    run.metaJson = request;
    run.updatedAt = new Date();
    const savedRun = await this.rehearsalRuns.save(run);

    return updateRehearsalRunMetaResponseSchema.parse({ run: toRehearsalRun(savedRun) });
  }

  async getRun(runId: string) {
    const run = await this.getRunEntity(runId);
    return getRehearsalRunResponseSchema.parse({ run: toRehearsalRun(run) });
  }

  async getReport(runId: string) {
    const run = await this.getRunEntity(runId);
    const report = run.status === "succeeded" && run.reportJson ? run.reportJson : null;

    return getRehearsalReportResponseSchema.parse({
      run: toRehearsalRun(run),
      report
    });
  }

  private async getRunEntity(runId: string) {
    const run = await this.rehearsalRuns.findOne({ where: { runId } });
    if (!run) {
      throw new NotFoundException(`Rehearsal run not found: ${runId}`);
    }

    await this.projectsService.getAccessibleProject(run.projectId);

    return run;
  }

  private async claimAudioUpload(run: RehearsalRunEntity, fileId: string) {
    const result = await this.rehearsalRuns.update(
      {
        runId: run.runId,
        projectId: run.projectId,
        audioFileId: fileId,
        status: "uploading"
      },
      {
        status: "processing",
        error: null,
        updatedAt: new Date()
      }
    );

    if (!result.affected) {
      return null;
    }

    return this.getRunEntity(run.runId);
  }

  private async cleanupAfterEnqueueFailure(
    run: RehearsalRunEntity,
    fileId: string,
    enqueueError: unknown
  ): Promise<{
    error: { code: string; message: string };
    jobMessage: string;
    rawAudioDeletedAt: Date | null;
    cleanupError?: unknown;
  }> {
    try {
      const rawAudioDeletedAt = await this.filesService.deleteUploadedAsset(
        run.projectId,
        fileId,
        "rehearsal-audio"
      );

      return {
        error: {
          code: "REHEARSAL_STT_ENQUEUE_FAILED",
          message:
            enqueueError instanceof Error ? enqueueError.message : "Rehearsal STT enqueue failed."
        },
        jobMessage: "Rehearsal STT enqueue failed.",
        rawAudioDeletedAt: new Date(rawAudioDeletedAt)
      };
    } catch (cleanupError) {
      return {
        error: {
          code: "RAW_AUDIO_DELETE_FAILED",
          message:
            cleanupError instanceof Error ? cleanupError.message : "Raw audio deletion failed."
        },
        jobMessage: "Rehearsal raw audio cleanup failed.",
        rawAudioDeletedAt: run.rawAudioDeletedAt,
        cleanupError
      };
    }
  }
}

function toRehearsalRun(run: RehearsalRunEntity): RehearsalRun {
  return {
    runId: run.runId,
    projectId: run.projectId,
    deckId: run.deckId,
    audioFileId: run.audioFileId,
    jobId: run.jobId,
    status: run.status,
    error: run.error,
    rawAudioDeletedAt: run.rawAudioDeletedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString()
  };
}
