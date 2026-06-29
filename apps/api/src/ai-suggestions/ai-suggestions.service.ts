import { randomUUID } from "node:crypto";
import {
  aiSuggestionErrorSchema,
  aiSuggestionSchema,
  applyAiSuggestionResponseSchema,
  createAiSuggestionRequestSchema,
  createAiSuggestionResponseSchema,
  deckApiErrorSchema,
  listAiSuggestionsQuerySchema,
  listAiSuggestionsResponseSchema,
  rejectAiSuggestionRequestSchema,
  rejectAiSuggestionResponseSchema,
  type AiSuggestion,
  type AiSuggestionError,
  type AiSuggestionErrorCode,
  type CreateAiSuggestionRequest,
  type ListAiSuggestionsQuery,
  type RejectAiSuggestionRequest
} from "@orbit/shared";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { FindOptionsWhere, Repository } from "typeorm";
import { ZodError } from "zod";
import { DecksService } from "../decks/decks.service";
import { ProjectsService } from "../projects/projects.service";
import { AiSuggestionEntity } from "./ai-suggestion.entity";

@Injectable()
export class AiSuggestionsService {
  constructor(
    @InjectRepository(AiSuggestionEntity)
    private readonly suggestionsRepository: Repository<AiSuggestionEntity>,
    private readonly projectsService: ProjectsService,
    private readonly decksService: DecksService
  ) {}

  async create(projectId: string, body: unknown) {
    await this.projectsService.getAccessibleProject(projectId);

    const request = parseCreateRequest(body);
    await this.requireCurrentDeckSlide(projectId, request, { allowStale: true });

    const now = new Date();
    const suggestion = await this.suggestionsRepository.save(
      this.suggestionsRepository.create({
        suggestionId: `suggestion_${randomUUID()}`,
        projectId,
        deckId: request.deckId,
        slideId: request.slideId,
        baseVersion: request.baseVersion,
        title: request.title,
        summary: request.summary ?? null,
        patch: request.patch,
        status: "pending",
        appliedChangeId: null,
        rejectedReason: null,
        createdAt: now,
        updatedAt: now
      })
    );

    return createAiSuggestionResponseSchema.parse({
      suggestion: toSuggestionDto(suggestion)
    });
  }

  async list(projectId: string, rawQuery: unknown) {
    await this.projectsService.getAccessibleProject(projectId);

    const query = parseListQuery(rawQuery);
    const where: FindOptionsWhere<AiSuggestionEntity> = { projectId };

    if (query.deckId) {
      where.deckId = query.deckId;
    }

    if (query.slideId) {
      where.slideId = query.slideId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const suggestions = await this.suggestionsRepository.find({
      where,
      order: { createdAt: "ASC" }
    });

    return listAiSuggestionsResponseSchema.parse({
      projectId,
      suggestions: suggestions.map(toSuggestionDto)
    });
  }

  async apply(projectId: string, suggestionId: string) {
    await this.projectsService.getAccessibleProject(projectId);

    const suggestion = await this.getSuggestion(projectId, suggestionId);
    this.requirePending(suggestion);
    await this.requireCurrentDeckSlide(projectId, suggestion, { allowStale: false });

    const applied = await this.applySuggestionPatch(projectId, suggestion);
    const now = new Date();
    suggestion.status = "applied";
    suggestion.appliedChangeId = applied.changeRecord.changeId;
    suggestion.updatedAt = now;

    const savedSuggestion = await this.suggestionsRepository.save(suggestion);

    return applyAiSuggestionResponseSchema.parse({
      suggestion: toSuggestionDto(savedSuggestion),
      deck: applied.deck,
      changeRecord: applied.changeRecord,
      snapshot: applied.snapshot,
      updatedAt: applied.updatedAt
    });
  }

  async reject(projectId: string, suggestionId: string, body: unknown) {
    await this.projectsService.getAccessibleProject(projectId);

    const request = parseRejectRequest(body ?? {});
    const suggestion = await this.getSuggestion(projectId, suggestionId);
    this.requirePending(suggestion);

    suggestion.status = "rejected";
    suggestion.rejectedReason = request.reason ?? null;
    suggestion.updatedAt = new Date();

    const savedSuggestion = await this.suggestionsRepository.save(suggestion);

    return rejectAiSuggestionResponseSchema.parse({
      suggestion: toSuggestionDto(savedSuggestion)
    });
  }

  private async getSuggestion(projectId: string, suggestionId: string) {
    const suggestion = await this.suggestionsRepository.findOne({
      where: { projectId, suggestionId }
    });

    if (!suggestion) {
      throwAiSuggestionException(
        "AI_SUGGESTION_NOT_FOUND",
        HttpStatus.NOT_FOUND,
        `AI suggestion not found: ${suggestionId}`
      );
    }

    return suggestion;
  }

  private requirePending(suggestion: AiSuggestionEntity): void {
    if (suggestion.status !== "pending") {
      throwAiSuggestionException(
        "AI_SUGGESTION_NOT_PENDING",
        HttpStatus.CONFLICT,
        "AI suggestion is not pending.",
        [`status=${suggestion.status}`]
      );
    }
  }

  private async requireCurrentDeckSlide(
    projectId: string,
    suggestion: Pick<
      AiSuggestion | CreateAiSuggestionRequest,
      "deckId" | "slideId" | "baseVersion"
    >,
    options: { allowStale: boolean }
  ): Promise<void> {
    const response = await this.getDeck(projectId);

    if (response.deck.deckId !== suggestion.deckId) {
      throwAiSuggestionException(
        "AI_SUGGESTION_PROJECT_MISMATCH",
        HttpStatus.BAD_REQUEST,
        "Suggestion deckId does not match the project deck.",
        [`deckId=${response.deck.deckId}`, `suggestion.deckId=${suggestion.deckId}`]
      );
    }

    if (!response.deck.slides.some((slide) => slide.slideId === suggestion.slideId)) {
      throwAiSuggestionException(
        "AI_SUGGESTION_SLIDE_DELETED",
        HttpStatus.CONFLICT,
        "Suggestion slide no longer exists.",
        [`slideId=${suggestion.slideId}`]
      );
    }

    if (!options.allowStale && response.deck.version !== suggestion.baseVersion) {
      throwAiSuggestionException(
        "AI_SUGGESTION_STALE_BASE_VERSION",
        HttpStatus.CONFLICT,
        "Suggestion baseVersion does not match current deck version.",
        [
          `deck.version=${response.deck.version}`,
          `suggestion.baseVersion=${suggestion.baseVersion}`
        ]
      );
    }
  }

  private async getDeck(projectId: string) {
    try {
      return await this.decksService.getDeck(projectId);
    } catch (error) {
      throwAiSuggestionException(
        "AI_SUGGESTION_NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Project deck was not found for AI suggestion.",
        [toErrorMessage(error)]
      );
    }
  }

  private async applySuggestionPatch(
    projectId: string,
    suggestion: AiSuggestionEntity
  ) {
    try {
      return await this.decksService.appendPatch(projectId, {
        patch: suggestion.patch,
        snapshotReason: "patch-applied"
      });
    } catch (error) {
      const deckErrorCode = getDeckApiErrorCode(error);

      if (deckErrorCode === "STALE_BASE_VERSION") {
        throwAiSuggestionException(
          "AI_SUGGESTION_STALE_BASE_VERSION",
          HttpStatus.CONFLICT,
          "Suggestion baseVersion does not match current deck version.",
          [toErrorMessage(error)]
        );
      }

      if (deckErrorCode === "PATCH_VALIDATION_FAILED") {
        throwAiSuggestionException(
          "AI_SUGGESTION_VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          "AI suggestion payload is invalid.",
          [toErrorMessage(error)]
        );
      }

      if (deckErrorCode === "DECK_NOT_FOUND") {
        throwAiSuggestionException(
          "AI_SUGGESTION_NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Project deck was not found for AI suggestion.",
          [toErrorMessage(error)]
        );
      }

      throwAiSuggestionException(
        "AI_SUGGESTION_PATCH_APPLY_FAILED",
        HttpStatus.BAD_REQUEST,
        "AI suggestion patch could not be applied.",
        [toErrorMessage(error)]
      );
    }
  }
}

function parseCreateRequest(body: unknown): CreateAiSuggestionRequest {
  const result = createAiSuggestionRequestSchema.safeParse(body);

  if (!result.success) {
    throwValidationException(result.error);
  }

  return result.data;
}

function parseListQuery(rawQuery: unknown): ListAiSuggestionsQuery {
  const value =
    rawQuery && typeof rawQuery === "object"
      ? {
          deckId: firstQueryValue((rawQuery as Record<string, unknown>).deckId),
          slideId: firstQueryValue((rawQuery as Record<string, unknown>).slideId),
          status: firstQueryValue((rawQuery as Record<string, unknown>).status)
        }
      : {};
  const result = listAiSuggestionsQuerySchema.safeParse(value);

  if (!result.success) {
    throwValidationException(result.error);
  }

  return result.data;
}

function parseRejectRequest(body: unknown): RejectAiSuggestionRequest {
  const result = rejectAiSuggestionRequestSchema.safeParse(body);

  if (!result.success) {
    throwValidationException(result.error);
  }

  return result.data;
}

function firstQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return typeof value === "string" && value.trim() ? value : undefined;
}

function throwValidationException(error: ZodError): never {
  throwAiSuggestionException(
    "AI_SUGGESTION_VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "AI suggestion payload is invalid.",
    formatZodError(error)
  );
}

function throwAiSuggestionException(
  code: AiSuggestionErrorCode,
  status: HttpStatus,
  message: string,
  details: string[] = []
): never {
  const error = aiSuggestionErrorSchema.parse({
    code,
    message,
    details
  } satisfies AiSuggestionError);

  throw new HttpException(error, status);
}

function toSuggestionDto(entity: AiSuggestionEntity): AiSuggestion {
  return aiSuggestionSchema.parse({
    suggestionId: entity.suggestionId,
    projectId: entity.projectId,
    deckId: entity.deckId,
    slideId: entity.slideId,
    baseVersion: entity.baseVersion,
    title: entity.title,
    summary: entity.summary ?? undefined,
    patch: entity.patch,
    status: entity.status,
    appliedChangeId: entity.appliedChangeId ?? undefined,
    rejectedReason: entity.rejectedReason ?? undefined,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString()
  });
}

function formatZodError(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    return typeof response === "string" ? response : JSON.stringify(response);
  }

  return error instanceof Error ? error.message : "Unknown error";
}

function getDeckApiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpException)) {
    return null;
  }

  const parsed = deckApiErrorSchema.safeParse(error.getResponse());
  return parsed.success ? parsed.data.code : null;
}
