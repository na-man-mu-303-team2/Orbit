import {
  enqueuePptxImportJob,
  type EnqueuePptxImportJobInput
} from "@orbit/job-queue";
import { jobSchema } from "@orbit/shared";
import { loadOrbitConfig } from "@orbit/config";
import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";

const createPptxImportRequestSchema = z.object({
  fileId: z.string().min(1)
});

const createPptxImportResponseSchema = z.object({
  job: jobSchema
});

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type CreatePptxImportResponse = z.infer<typeof createPptxImportResponseSchema>;

@Injectable()
export class PptxImportsService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly jobsService: JobsService,
    private readonly projectsService: ProjectsService,
    private readonly filesService: FilesService,
    @Optional()
    private readonly enqueueJob: (
      input: EnqueuePptxImportJobInput
    ) => Promise<void> = enqueuePptxImportJob
  ) {}

  async createImport(
    projectId: string,
    body: unknown
  ): Promise<CreatePptxImportResponse> {
    await this.projectsService.getAccessibleProject(projectId);

    const request = createPptxImportRequestSchema.parse(body);
    const asset = await this.filesService.getUploadedAsset(projectId, request.fileId);

    if (asset.mimeType !== pptxMimeType) {
      throw new BadRequestException("PPTX imports require an uploaded PPTX file.");
    }

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "pptx-import",
      payload: { fileId: request.fileId }
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        fileId: request.fileId
      });
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
      throw error;
    }

    return createPptxImportResponseSchema.parse({ job: queuedJob });
  }
}
