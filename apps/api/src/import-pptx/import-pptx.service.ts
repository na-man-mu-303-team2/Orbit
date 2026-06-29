import type { EnqueuePptxImportJobInput } from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import {
  jobSchema,
  pptxImportJobResponseSchema,
  pptxImportRequestSchema
} from "@orbit/shared";
import type { PptxImportJobResponse } from "@orbit/shared";
import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";

export type PptxImportEnqueueJob = (
  input: EnqueuePptxImportJobInput
) => Promise<void>;

export const PPTX_IMPORT_ENQUEUE_JOB = "PPTX_IMPORT_ENQUEUE_JOB";

@Injectable()
export class ImportPptxService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly filesService: FilesService,
    private readonly jobsService: JobsService,
    @Inject(PPTX_IMPORT_ENQUEUE_JOB)
    private readonly enqueueJob: PptxImportEnqueueJob,
    @InjectPinoLogger(ImportPptxService.name)
    private readonly logger: PinoLogger
  ) {}

  async createJob(
    projectId: string,
    body: unknown
  ): Promise<PptxImportJobResponse> {
    const request = pptxImportRequestSchema.parse(body);
    const asset = await this.filesService.getUploadedAsset(
      projectId,
      request.fileId,
      "pptx-import"
    );

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "pptx-import",
      payload: {
        fileId: asset.fileId
      }
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        fileId: asset.fileId
      });
      this.logger.info(
        {
          event: "job.enqueued",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          fileId: asset.fileId,
          driver: this.config.JOB_QUEUE_DRIVER
        },
        "PPTX import job enqueued."
      );
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "PPTX import enqueue failed.",
        error: {
          code: "PPTX_IMPORT_ENQUEUE_FAILED",
          message:
            error instanceof Error ? error.message : "PPTX import enqueue failed."
        }
      });
      this.logger.error(
        {
          event: "job.enqueue_failed",
          jobId: queuedJob.jobId,
          jobType: queuedJob.type,
          projectId,
          fileId: asset.fileId,
          driver: this.config.JOB_QUEUE_DRIVER,
          error: serializeLogError(error)
        },
        "PPTX import enqueue failed."
      );
      throw error;
    }

    return pptxImportJobResponseSchema.parse({
      job: jobSchema.parse(queuedJob)
    });
  }
}
