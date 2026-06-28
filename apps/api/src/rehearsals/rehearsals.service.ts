import type { EnqueueRehearsalSttJobInput } from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import { jobSchema } from "@orbit/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { z } from "zod";
import { parseRequest } from "../common/zod-request";
import { DecksService } from "../decks/decks.service";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";

const startRehearsalSttRequestSchema = z.object({
  audioFileId: z.string().min(1),
  deckId: z.string().min(1),
  runId: z.string().min(1).optional(),
});

const startRehearsalSttResponseSchema = z.object({
  job: jobSchema,
});

export type RehearsalSttEnqueueJob = (
  input: EnqueueRehearsalSttJobInput,
) => Promise<void>;

export const REHEARSAL_STT_ENQUEUE_JOB = "REHEARSAL_STT_ENQUEUE_JOB";

@Injectable()
export class RehearsalsService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly decksService: DecksService,
    private readonly filesService: FilesService,
    private readonly jobsService: JobsService,
    @Inject(REHEARSAL_STT_ENQUEUE_JOB)
    private readonly enqueueJob: RehearsalSttEnqueueJob,
    @InjectPinoLogger(RehearsalsService.name)
    private readonly logger: PinoLogger,
  ) {}

  async startStt(projectId: string, body: unknown) {
    const request = parseRequest(startRehearsalSttRequestSchema, body);
    await this.filesService.getUploadedAsset(
      projectId,
      request.audioFileId,
      "rehearsal-audio",
    );
    const deckResponse = await this.decksService.getDeck(projectId);
    if (deckResponse.deck.deckId !== request.deckId) {
      throw new BadRequestException("deckId does not match the project deck.");
    }

    const runId = request.runId ?? `run_${randomUUID()}`;
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "rehearsal-stt",
      payload: {
        audioFileId: request.audioFileId,
        deckId: request.deckId,
        runId,
      },
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        runId,
        deckId: request.deckId,
        audioFileId: request.audioFileId,
      });
      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          runId,
          deckId: request.deckId,
          audioFileId: request.audioFileId,
          driver: this.config.JOB_QUEUE_DRIVER,
        },
        "Rehearsal STT job enqueued.",
      );
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Rehearsal STT enqueue failed.",
        error: {
          code: "REHEARSAL_STT_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Rehearsal STT enqueue failed.",
          },
      });
      this.logger.error(
        {
          event: "job.enqueue_failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          runId,
          deckId: request.deckId,
          audioFileId: request.audioFileId,
          driver: this.config.JOB_QUEUE_DRIVER,
          error: serializeLogError(error),
        },
        "Rehearsal STT enqueue failed.",
      );
      throw error;
    }

    return startRehearsalSttResponseSchema.parse({ job: queuedJob });
  }
}
