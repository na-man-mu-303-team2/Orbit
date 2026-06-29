import {
  enqueueGenerateDeckJob,
  type EnqueueGenerateDeckJobInput
} from "@orbit/job-queue";
import { generateDeckRequestSchema, jobSchema } from "@orbit/shared";
import { loadOrbitConfig } from "@orbit/config";
import { Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { JobsService } from "../jobs/jobs.service";

const generateDeckJobResponseSchema = z.object({
  job: jobSchema
});

type GenerateDeckJobResponse = z.infer<typeof generateDeckJobResponseSchema>;

@Injectable()
export class GenerateDeckService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly jobsService: JobsService,
    @Optional()
    private readonly enqueueJob: (
      input: EnqueueGenerateDeckJobInput
    ) => Promise<void> = enqueueGenerateDeckJob
  ) {}

  async createJob(
    projectId: string,
    body: unknown
  ): Promise<GenerateDeckJobResponse> {
    const request = generateDeckRequestSchema.parse(body);
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "ai-deck-generation",
      payload: { request }
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        request
      });
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "AI deck generation enqueue failed.",
        error: {
          code: "GENERATE_DECK_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "AI deck generation enqueue failed."
        }
      });
      throw error;
    }

    return generateDeckJobResponseSchema.parse({ job: queuedJob });
  }
}
