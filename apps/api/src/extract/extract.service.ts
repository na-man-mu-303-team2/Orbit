import {
  type EnqueueReferenceExtractJobInput
} from "@orbit/job-queue";
import { loadOrbitConfig } from "@orbit/config";
import { jobSchema } from "@orbit/shared";
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { JobsService } from "../jobs/jobs.service";

interface UploadedExtractFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const extractResponseSchema = z.object({
  files: z.array(z.record(z.unknown())),
  job: jobSchema
});

type ExtractResponse = z.infer<typeof extractResponseSchema>;
export type ReferenceExtractEnqueueJob = (
  input: EnqueueReferenceExtractJobInput
) => Promise<void>;

export const REFERENCE_EXTRACT_ENQUEUE_JOB =
  "REFERENCE_EXTRACT_ENQUEUE_JOB";

@Injectable()
export class ExtractService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly jobsService: JobsService,
    @Inject(REFERENCE_EXTRACT_ENQUEUE_JOB)
    private readonly enqueueJob: ReferenceExtractEnqueueJob
  ) {}

  async extract(
    files: UploadedExtractFile[],
    projectId: string
  ): Promise<ExtractResponse> {
    const payload = {
      files: files.map((file) => ({
        fileId: `file_${randomUUID()}`,
        originalName: file.originalname || "upload",
        mimeType: file.mimetype || "application/octet-stream",
        contentBase64: file.buffer.toString("base64")
      }))
    };

    // ponytail: DB payload keeps MVP simple; move upload bytes to object storage when size matters.
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "reference-extract",
      payload
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        files: payload.files
      });
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Reference extraction enqueue failed.",
        error: {
          code: "REFERENCE_EXTRACT_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Reference extraction enqueue failed."
        }
      });
      throw error;
    }

    return extractResponseSchema.parse({
      files: [],
      job: queuedJob
    });
  }
}
