import { loadOrbitConfig } from "@orbit/config";
import type {
  EnqueueDesignImageGenerationJobInput,
} from "@orbit/job-queue";
import {
  createDesignImageGenerationResponseSchema,
  designImageGenerationJobPayloadSchema,
  type CreateDesignImageGenerationRequest,
  type CreateDesignImageGenerationResponse,
  type Deck,
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DecksService } from "../decks/decks.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";

export const DESIGN_IMAGE_GENERATION_ENQUEUE_JOB =
  "DESIGN_IMAGE_GENERATION_ENQUEUE_JOB";

export type DesignImageGenerationEnqueueJob = (
  input: EnqueueDesignImageGenerationJobInput,
) => Promise<void>;

@Injectable()
export class DesignImageGenerationService {
  constructor(
    private readonly decksService: DecksService,
    private readonly jobsService: JobsService,
    @Inject(DESIGN_IMAGE_GENERATION_ENQUEUE_JOB)
    private readonly enqueueImageGeneration: DesignImageGenerationEnqueueJob,
    @InjectPinoLogger(DesignImageGenerationService.name)
    private readonly logger: PinoLogger,
  ) {}

  async create(
    projectId: string,
    userId: string,
    request: CreateDesignImageGenerationRequest,
  ): Promise<CreateDesignImageGenerationResponse> {
    const current = await this.decksService.getDeck(projectId);
    if (current.deck.deckId !== request.deckId) {
      throw new BadRequestException("Design image deckId does not match project deck.");
    }
    if (current.deck.version !== request.baseVersion) {
      throw new ConflictException("Design image baseVersion is stale.");
    }
    const slide = current.deck.slides.find(
      (candidate) => candidate.slideId === request.slideId,
    );
    if (!slide) {
      throw new BadRequestException("Design image slide does not exist.");
    }

    const queuedJob = await this.jobsService.create({
      projectId,
      type: "design-image-generation",
      payload: nullSafePayload(request),
    });
    const payload = designImageGenerationJobPayloadSchema.parse({
      jobId: queuedJob.jobId,
      projectId,
      userId,
      deckId: request.deckId,
      slideId: request.slideId,
      baseVersion: request.baseVersion,
      prompt: request.prompt,
      aspectRatio: resolveAspectRatio(current.deck),
      slideContext: buildSlideContext(current.deck, request.slideId),
    });

    try {
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueImageGeneration({
        ...payload,
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
      });
      this.logger.info(
        {
          event: "design_image.generation.queued",
          jobId: queuedJob.jobId,
          projectId,
          deckId: request.deckId,
          slideId: request.slideId,
          aspectRatio: payload.aspectRatio,
        },
        "Design image generation job enqueued.",
      );
    } catch (error) {
      await this.jobsService.update(queuedJob.jobId, {
        status: "failed",
        progress: 0,
        message: "Image generation enqueue failed.",
        error: {
          code: "DESIGN_IMAGE_GENERATION_ENQUEUE_FAILED",
          message: "Image generation could not be queued.",
        },
      });
      this.logger.error(
        {
          event: "design_image.generation.enqueue_failed",
          jobId: queuedJob.jobId,
          projectId,
          error: serializeLogError(error),
        },
        "Design image generation enqueue failed.",
      );
      throw error;
    }

    return createDesignImageGenerationResponseSchema.parse({ job: queuedJob });
  }
}

function nullSafePayload(request: CreateDesignImageGenerationRequest) {
  return {
    deckId: request.deckId,
    slideId: request.slideId,
    baseVersion: request.baseVersion,
  };
}

function resolveAspectRatio(deck: Deck) {
  const ratio = deck.canvas.width / deck.canvas.height;
  if (ratio > 1.2) return "landscape" as const;
  if (ratio < 0.8) return "portrait" as const;
  return "square" as const;
}

function buildSlideContext(deck: Deck, slideId: string) {
  const slide = deck.slides.find((candidate) => candidate.slideId === slideId)!;
  return {
    title: [deck.title, slide.title].filter(Boolean).join(" — ").slice(0, 500),
    text: slide.elements
      .filter((element) => element.type === "text")
      .map((element) => element.props.text.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((text) => text.slice(0, 1_000)),
    theme: {
      name: deck.theme.name,
      primaryColor: deck.theme.palette.primary,
      secondaryColor: deck.theme.palette.secondary,
      accentColor: deck.theme.accentColor,
      backgroundColor: deck.theme.backgroundColor,
    },
  };
}
