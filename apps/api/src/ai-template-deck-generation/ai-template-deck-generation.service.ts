import {
  enqueueAiTemplateDeckGenerationJob,
  type EnqueueAiTemplateDeckGenerationJobInput,
} from "@orbit/job-queue";
import {
  aiTemplateDeckGenerationRequestSchema,
  jobSchema,
} from "@orbit/shared";
import { loadOrbitConfig } from "@orbit/config";
import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";

const aiTemplateDeckGenerationJobResponseSchema = z.object({
  job: jobSchema,
});

type AiTemplateDeckGenerationJobResponse = z.infer<
  typeof aiTemplateDeckGenerationJobResponseSchema
>;

const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

@Injectable()
export class AiTemplateDeckGenerationService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly jobsService: JobsService,
    private readonly projectsService: ProjectsService,
    private readonly filesService: FilesService,
    @Optional()
    private readonly enqueueJob: (
      input: EnqueueAiTemplateDeckGenerationJobInput,
    ) => Promise<void> = enqueueAiTemplateDeckGenerationJob,
  ) {}

  async createJob(
    projectId: string,
    body: unknown,
  ): Promise<AiTemplateDeckGenerationJobResponse> {
    await this.projectsService.getAccessibleProject(projectId);

    const request = aiTemplateDeckGenerationRequestSchema.parse(body);
    await this.assertAssets(projectId, request.assets);

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "ai-template-deck-generation",
      payload: { request },
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        request,
      });
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "AI template deck generation enqueue failed.",
        error: {
          code: "AI_TEMPLATE_DECK_GENERATION_ENQUEUE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "AI template deck generation enqueue failed.",
        },
      });
      throw error;
    }

    return aiTemplateDeckGenerationJobResponseSchema.parse({ job: queuedJob });
  }

  private async assertAssets(
    projectId: string,
    assets: Array<{ fileId: string; role: "content" | "design" | "both" }>,
  ): Promise<void> {
    const designAssets = assets.filter(
      (asset) => asset.role === "design" || asset.role === "both",
    );
    if (designAssets.length !== 1) {
      throw new BadRequestException(
        "AI template deck generation requires exactly one design PPTX asset.",
      );
    }

    for (const asset of assets) {
      const uploaded = await this.filesService.getUploadedAsset(
        projectId,
        asset.fileId,
      );
      const isDesignAsset = asset.role === "design" || asset.role === "both";

      if (isDesignAsset && uploaded.mimeType !== pptxMimeType) {
        throw new BadRequestException("Design asset must be an uploaded PPTX file.");
      }
      if (asset.role === "design" && uploaded.purpose !== "pptx-import") {
        throw new BadRequestException("Design asset purpose must be pptx-import.");
      }
      if (asset.role === "both" && uploaded.purpose !== "pptx-import") {
        throw new BadRequestException("Both-role PPTX purpose must be pptx-import.");
      }
    }
  }
}
