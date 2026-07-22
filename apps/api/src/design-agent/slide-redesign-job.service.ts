import { randomUUID } from "node:crypto";
import { loadOrbitConfig } from "@orbit/config";
import type { EnqueueSlideRedesignJobInput } from "@orbit/job-queue";
import {
  createSlideRedesignJobResponseSchema,
  designAgentCapabilities,
  designAgentMessageSchema,
  slideRedesignJobPayloadSchema,
  slideRedesignPaletteOptionsSchema,
  type CreateSlideRedesignJobRequest,
  type CreateSlideRedesignJobResponse,
  type SlideRedesignPaletteOption,
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Repository } from "typeorm";
import { DecksService } from "../decks/decks.service";
import { JobsService } from "../jobs/jobs.service";
import { serializeLogError } from "../logging";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";

export const SLIDE_REDESIGN_ENQUEUE_JOB = "SLIDE_REDESIGN_ENQUEUE_JOB";

export type SlideRedesignEnqueueJob = (
  input: EnqueueSlideRedesignJobInput,
) => Promise<void>;

@Injectable()
export class SlideRedesignJobService {
  constructor(
    @InjectRepository(DesignAgentMessageEntity)
    private readonly messagesRepository: Repository<DesignAgentMessageEntity>,
    private readonly decksService: DecksService,
    private readonly jobsService: JobsService,
    @Inject(SLIDE_REDESIGN_ENQUEUE_JOB)
    private readonly enqueueSlideRedesign: SlideRedesignEnqueueJob,
    @InjectPinoLogger(SlideRedesignJobService.name)
    private readonly logger: PinoLogger,
  ) {}

  async create(
    projectId: string,
    userId: string,
    request: CreateSlideRedesignJobRequest,
  ): Promise<CreateSlideRedesignJobResponse> {
    await this.assertCurrentContext(projectId, request);
    const sessionMessages = await this.messagesRepository.find({
      where: {
        projectId,
        actorUserId: userId,
        sessionId: request.sessionId,
        status: "succeeded",
      },
      order: { createdAt: "DESC" },
      take: 10,
    });
    const selectedPaletteOption = findStoredPaletteOption(
      sessionMessages,
      request.selectedPaletteOptionId,
    );
    if (!selectedPaletteOption) {
      throw new BadRequestException(
        "selectedPaletteOptionId does not match this design agent session.",
      );
    }

    const now = new Date();
    const requestMessage = await this.messagesRepository.save(
      this.messagesRepository.create({
        messageId: `design_message_${randomUUID()}`,
        sessionId: request.sessionId,
        projectId,
        actorUserId: userId,
        deckId: request.context.deckId,
        slideId: request.context.slide.slideId,
        role: "user",
        content: request.content,
        status: "pending",
        contextJson: request.context,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    let queuedJob: Awaited<ReturnType<JobsService["create"]>> | undefined;
    try {
      queuedJob = await this.jobsService.create({
        projectId,
        type: "slide-redesign",
        payload: {
          sessionId: request.sessionId,
          requestMessageId: requestMessage.messageId,
          deckId: request.context.deckId,
          slideId: request.context.slide.slideId,
          baseVersion: request.context.baseVersion,
          selectedPaletteOptionId: request.selectedPaletteOptionId,
        },
      });
      const payload = slideRedesignJobPayloadSchema.parse({
        jobId: queuedJob.jobId,
        projectId,
        userId,
        requestMessageId: requestMessage.messageId,
        sessionId: request.sessionId,
        question: request.content,
        context: request.context,
        history: [...sessionMessages].reverse().map((message) => ({
          role: message.role,
          content: message.content,
        })),
        capabilities: designAgentCapabilities,
        selectedPaletteOption,
      });
      const config = loadOrbitConfig(process.env, { service: "api" });
      await this.enqueueSlideRedesign({
        ...payload,
        driver: config.JOB_QUEUE_DRIVER,
        redisUrl: config.REDIS_URL,
      });
      this.logger.info(
        {
          event: "slide_redesign.job.queued",
          jobId: queuedJob.jobId,
          projectId,
          deckId: request.context.deckId,
          slideId: request.context.slide.slideId,
          baseVersion: request.context.baseVersion,
          sessionId: request.sessionId,
          requestMessageId: requestMessage.messageId,
          selectedPaletteOptionId: request.selectedPaletteOptionId,
        },
        "Slide redesign job enqueued.",
      );
    } catch (error) {
      if (queuedJob) {
        await this.jobsService.update(queuedJob.jobId, {
          status: "failed",
          progress: 0,
          message: "Slide redesign enqueue failed.",
          error: {
            code: "SLIDE_REDESIGN_ENQUEUE_FAILED",
            message: "Slide redesign could not be queued.",
          },
        });
      }
      requestMessage.status = "failed";
      requestMessage.errorCode = "SLIDE_REDESIGN_ENQUEUE_FAILED";
      requestMessage.errorMessage = "Slide redesign could not be queued.";
      requestMessage.updatedAt = new Date();
      await this.messagesRepository.save(requestMessage);
      this.logger.error(
        {
          event: "slide_redesign.job.enqueue_failed",
          jobId: queuedJob?.jobId,
          projectId,
          deckId: request.context.deckId,
          slideId: request.context.slide.slideId,
          baseVersion: request.context.baseVersion,
          sessionId: request.sessionId,
          requestMessageId: requestMessage.messageId,
          error: serializeLogError(error),
        },
        "Slide redesign enqueue failed.",
      );
      throw error;
    }

    return createSlideRedesignJobResponseSchema.parse({
      job: queuedJob,
      requestMessage: toMessageDto(requestMessage),
    });
  }

  private async assertCurrentContext(
    projectId: string,
    request: CreateSlideRedesignJobRequest,
  ): Promise<void> {
    const current = await this.decksService.getDeck(projectId);
    if (current.deck.deckId !== request.context.deckId) {
      throw new BadRequestException(
        "Slide redesign deckId does not match project deck.",
      );
    }
    if (current.deck.version !== request.context.baseVersion) {
      throw new ConflictException("Slide redesign baseVersion is stale.");
    }
    if (
      !current.deck.slides.some(
        (slide) => slide.slideId === request.context.slide.slideId,
      )
    ) {
      throw new BadRequestException(
        "Slide redesign slide does not exist in project deck.",
      );
    }
  }
}

function findStoredPaletteOption(
  messages: DesignAgentMessageEntity[],
  optionId: string,
): SlideRedesignPaletteOption | undefined {
  for (const message of messages) {
    const context = message.contextJson;
    if (
      context === null ||
      typeof context !== "object" ||
      !("paletteOptions" in context)
    ) {
      continue;
    }
    const parsed = slideRedesignPaletteOptionsSchema.safeParse(
      context.paletteOptions,
    );
    if (!parsed.success) continue;
    const selected = parsed.data.find((option) => option.optionId === optionId);
    if (selected) return selected;
  }
  return undefined;
}

function toMessageDto(entity: DesignAgentMessageEntity) {
  return designAgentMessageSchema.parse({
    messageId: entity.messageId,
    sessionId: entity.sessionId,
    projectId: entity.projectId,
    deckId: entity.deckId,
    slideId: entity.slideId,
    role: entity.role,
    content: entity.content,
    status: entity.status,
    ...(entity.errorCode ? { errorCode: entity.errorCode } : {}),
    ...(entity.errorMessage ? { errorMessage: entity.errorMessage } : {}),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  });
}
