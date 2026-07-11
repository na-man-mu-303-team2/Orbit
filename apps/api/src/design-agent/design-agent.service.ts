import { randomUUID } from "node:crypto";
import {
  createDesignAgentMessageResponseSchema,
  designAgentMessageSchema,
  designAgentProposalSchema,
  type CreateDesignAgentMessageRequest,
  type CreateDesignAgentMessageResponse,
  type DesignAgentContext,
  type DesignAgentMessage,
  type DesignAgentProposal,
} from "@orbit/shared";
import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { Repository } from "typeorm";
import { DecksService } from "../decks/decks.service";
import { DesignAgentMessageEntity } from "./design-agent-message.entity";
import { DesignAgentProposalEntity } from "./design-agent-proposal.entity";
import { DesignAgentPythonClient } from "./design-agent-python.client";

@Injectable()
export class DesignAgentService {
  constructor(
    @InjectRepository(DesignAgentMessageEntity)
    private readonly messagesRepository: Repository<DesignAgentMessageEntity>,
    @InjectRepository(DesignAgentProposalEntity)
    private readonly proposalsRepository: Repository<DesignAgentProposalEntity>,
    private readonly decksService: DecksService,
    private readonly pythonClient: DesignAgentPythonClient,
    @InjectPinoLogger(DesignAgentService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createMessage(
    projectId: string,
    actorUserId: string,
    input: CreateDesignAgentMessageRequest,
  ): Promise<CreateDesignAgentMessageResponse> {
    await this.assertCurrentContext(projectId, input.context);

    const sessionId = input.sessionId ?? `design_session_${randomUUID()}`;
    const history = await this.loadHistory(projectId, actorUserId, sessionId);
    const now = new Date();
    const requestMessage = await this.messagesRepository.save(
      this.messagesRepository.create({
        messageId: `design_message_${randomUUID()}`,
        sessionId,
        projectId,
        actorUserId,
        deckId: input.context.deckId,
        slideId: input.context.slide.slideId,
        role: "user",
        content: input.content,
        status: "pending",
        contextJson: input.context,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    try {
      const aiResult = await this.pythonClient.propose({
        projectId,
        sessionId,
        question: input.content,
        context: input.context,
        history,
      });
      const responseNow = new Date();
      const responseMessage = await this.messagesRepository.save(
        this.messagesRepository.create({
          messageId: `design_message_${randomUUID()}`,
          sessionId,
          projectId,
          actorUserId,
          deckId: input.context.deckId,
          slideId: input.context.slide.slideId,
          role: "assistant",
          content: aiResult.message,
          status: "succeeded",
          contextJson: null,
          errorCode: null,
          errorMessage: null,
          createdAt: responseNow,
          updatedAt: responseNow,
        }),
      );

      requestMessage.status = "succeeded";
      requestMessage.updatedAt = responseNow;
      await this.messagesRepository.save(requestMessage);

      const proposal =
        aiResult.operations.length > 0
          ? await this.proposalsRepository.save(
              this.proposalsRepository.create({
                proposalId: `design_proposal_${randomUUID()}`,
                projectId,
                deckId: input.context.deckId,
                slideId: input.context.slide.slideId,
                requestMessageId: requestMessage.messageId,
                responseMessageId: responseMessage.messageId,
                baseVersion: input.context.baseVersion,
                title: "AI 디자인 변경안",
                summary: aiResult.message,
                operations: aiResult.operations,
                interpretedIntent: aiResult.interpretedIntent,
                affectedElementIds: aiResult.affectedElementIds,
                warnings: aiResult.warnings,
                status: "pending",
                appliedChangeId: null,
                rejectedReason: null,
                createdAt: responseNow,
                updatedAt: responseNow,
              }),
            )
          : null;

      this.logger.info(
        {
          event: "design_agent.proposal.completed",
          projectId,
          deckId: input.context.deckId,
          slideId: input.context.slide.slideId,
          sessionId,
          operationCount: aiResult.operations.length,
          warningCount: aiResult.warnings.length,
        },
        "Design agent response completed.",
      );

      return createDesignAgentMessageResponseSchema.parse({
        sessionId,
        requestMessage: toMessageDto(requestMessage),
        responseMessage: toMessageDto(responseMessage),
        ...(proposal ? { proposal: toProposalDto(proposal) } : {}),
      });
    } catch (error) {
      requestMessage.status = "failed";
      requestMessage.errorCode = "DESIGN_AGENT_REQUEST_FAILED";
      requestMessage.errorMessage = toSafeErrorMessage(error);
      requestMessage.updatedAt = new Date();
      await this.messagesRepository.save(requestMessage);

      this.logger.warn(
        {
          event: "design_agent.proposal.failed",
          projectId,
          deckId: input.context.deckId,
          slideId: input.context.slide.slideId,
          sessionId,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "Design agent request failed.",
      );
      throw error;
    }
  }

  private async assertCurrentContext(
    projectId: string,
    context: DesignAgentContext,
  ): Promise<void> {
    const current = await this.decksService.getDeck(projectId);
    if (current.deck.deckId !== context.deckId) {
      throw new BadRequestException("Design agent deckId does not match project deck.");
    }
    if (current.deck.version !== context.baseVersion) {
      throw new BadRequestException("Design agent baseVersion is stale.");
    }
    if (!current.deck.slides.some((slide) => slide.slideId === context.slide.slideId)) {
      throw new BadRequestException("Design agent slide does not exist in project deck.");
    }
  }

  private async loadHistory(
    projectId: string,
    actorUserId: string,
    sessionId: string,
  ) {
    const messages = await this.messagesRepository.find({
      where: { projectId, actorUserId, sessionId, status: "succeeded" },
      order: { createdAt: "DESC" },
      take: 10,
    });
    return messages.reverse().map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }
}

function toMessageDto(entity: DesignAgentMessageEntity): DesignAgentMessage {
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

function toProposalDto(entity: DesignAgentProposalEntity): DesignAgentProposal {
  return designAgentProposalSchema.parse({
    proposalId: entity.proposalId,
    projectId: entity.projectId,
    deckId: entity.deckId,
    slideId: entity.slideId,
    requestMessageId: entity.requestMessageId,
    ...(entity.responseMessageId
      ? { responseMessageId: entity.responseMessageId }
      : {}),
    baseVersion: entity.baseVersion,
    title: entity.title,
    ...(entity.summary ? { summary: entity.summary } : {}),
    operations: entity.operations,
    ...(entity.interpretedIntent
      ? { interpretedIntent: entity.interpretedIntent }
      : {}),
    affectedElementIds: entity.affectedElementIds,
    warnings: entity.warnings,
    status: entity.status,
    ...(entity.appliedChangeId
      ? { appliedChangeId: entity.appliedChangeId }
      : {}),
    ...(entity.rejectedReason
      ? { rejectedReason: entity.rejectedReason }
      : {}),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  });
}

function toSafeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Design agent request failed.";
  return error.message.slice(0, 1_000);
}
