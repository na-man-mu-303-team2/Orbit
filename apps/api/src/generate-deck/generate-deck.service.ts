import {
  enqueueGenerateDeckJob,
  type EnqueueGenerateDeckJobInput
} from "@orbit/job-queue";
import {
  deckColorOptionRequestSchema,
  deckColorOptionsResponseSchema,
  generateDeckRequestSchema,
  jobSchema,
  type DeckColorOptionsResponse
} from "@orbit/shared";
import { loadOrbitConfig } from "@orbit/config";
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { z } from "zod";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { ProjectsService } from "../projects/projects.service";
import { SavedDesignPacksService } from "../saved-design-packs/saved-design-packs.service";

const generateDeckJobResponseSchema = z.object({
  job: jobSchema
});

type GenerateDeckJobResponse = z.infer<typeof generateDeckJobResponseSchema>;
const pptxMimeType =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

@Injectable()
export class GenerateDeckService {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(
    private readonly jobsService: JobsService,
    private readonly projectsService: ProjectsService,
    @Optional()
    private readonly enqueueJob: (
      input: EnqueueGenerateDeckJobInput
    ) => Promise<void> = enqueueGenerateDeckJob,
    @Optional()
    private readonly filesService?: FilesService,
    @Optional()
    private readonly savedDesignPacksService?: SavedDesignPacksService
  ) {}

  async createJob(
    projectId: string,
    body: unknown,
    userId?: string
  ): Promise<GenerateDeckJobResponse> {
    await this.projectsService.getAccessibleProject(projectId);

    const parsedRequest = generateDeckRequestSchema.parse(body);
    const resolved =
      this.savedDesignPacksService && userId
        ? await this.savedDesignPacksService.resolveGenerationRequest(
            parsedRequest,
            body,
            userId
          )
        : { request: parsedRequest };
    const request = resolved.request;
    await this.assertDesignReferences(projectId, request.designReferences);
    const queuedJob = await this.jobsService.create({
      projectId,
      type: "ai-deck-generation",
      payload: {
        request,
        ...(resolved.snapshot ? { designPackSnapshot: resolved.snapshot } : {})
      }
    });

    try {
      await this.enqueueJob({
        driver: this.config.JOB_QUEUE_DRIVER,
        redisUrl: this.config.REDIS_URL,
        jobId: queuedJob.jobId,
        projectId,
        request,
        ...(resolved.snapshot ? { designPackSnapshot: resolved.snapshot } : {})
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

  async createColorOptions(body: unknown): Promise<DeckColorOptionsResponse> {
    const request = deckColorOptionRequestSchema.parse(body);
    let response: Response;

    try {
      response = await fetch(
        workerUrl(this.config.PYTHON_WORKER_URL, "/ai/deck-color-options"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(30_000)
        }
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? error.message
          : "Python worker color option generation unavailable."
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        (await response.text()) || "Python worker color option generation failed."
      );
    }

    try {
      return deckColorOptionsResponseSchema.parse(await response.json());
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : "Python worker returned invalid color options."
      );
    }
  }

  private async assertDesignReferences(
    projectId: string,
    designReferences: Array<{ fileId: string }>
  ): Promise<void> {
    if (designReferences.length === 0) return;
    if (!this.filesService) {
      throw new BadRequestException("Design reference validation is unavailable.");
    }

    for (const reference of designReferences) {
      const asset = await this.filesService.getUploadedAsset(
        projectId,
        reference.fileId
      );

      if (asset.mimeType !== pptxMimeType) {
        throw new BadRequestException("Design references must be uploaded PPTX files.");
      }
    }
  }
}

function workerUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  ).toString();
}
