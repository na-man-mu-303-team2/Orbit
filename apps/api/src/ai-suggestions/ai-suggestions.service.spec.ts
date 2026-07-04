import { HttpException, HttpStatus } from "@nestjs/common";
import {
  aiSuggestionErrorSchema,
  deckSchema,
  type Deck,
  type DeckPatch
} from "@orbit/shared";
import type { Repository } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecksService } from "../decks/decks.service";
import type { ProjectsService } from "../projects/projects.service";
import { AiSuggestionEntity } from "./ai-suggestion.entity";
import { AiSuggestionsService } from "./ai-suggestions.service";

type FindOptions = {
  where: Partial<AiSuggestionEntity>;
};

function createSuggestionRepository() {
  const suggestions: AiSuggestionEntity[] = [];
  const repository = {
    create(input: Partial<AiSuggestionEntity>): AiSuggestionEntity {
      return input as AiSuggestionEntity;
    },
    async save(suggestion: AiSuggestionEntity): Promise<AiSuggestionEntity> {
      const index = suggestions.findIndex(
        (item) => item.suggestionId === suggestion.suggestionId
      );

      if (index >= 0) {
        suggestions[index] = suggestion;
      } else {
        suggestions.push(suggestion);
      }

      return suggestion;
    },
    async find(options: FindOptions): Promise<AiSuggestionEntity[]> {
      return suggestions.filter((suggestion) =>
        Object.entries(options.where).every(
          ([key, value]) =>
            value === undefined ||
            suggestion[key as keyof AiSuggestionEntity] === value
        )
      );
    },
    async findOne(options: FindOptions): Promise<AiSuggestionEntity | null> {
      return (
        suggestions.find((suggestion) =>
          Object.entries(options.where).every(
            ([key, value]) =>
              value === undefined ||
              suggestion[key as keyof AiSuggestionEntity] === value
          )
        ) ?? null
      );
    }
  };

  return {
    repository: repository as unknown as Repository<AiSuggestionEntity>,
    suggestions
  };
}

function createService(deck: Deck = createDeck()) {
  const { repository, suggestions } = createSuggestionRepository();
  const projectsService = {
    getAccessibleProject: vi.fn(async () => ({
      projectId: deck.projectId,
      workspaceId: "workspace_demo_1",
      title: "Demo",
      createdBy: "user_demo_1",
      createdAt: "2026-06-29T00:00:00.000Z"
    }))
  } as unknown as ProjectsService;
  const currentDeck = { value: deck };
  const decksService = {
    getDeck: vi.fn(async (projectId: string) => ({
      projectId,
      deck: currentDeck.value,
      updatedAt: "2026-06-29T00:00:00.000Z"
    })),
    appendPatch: vi.fn(async (_projectId: string, body: { patch: DeckPatch }) => {
      const nextDeck = {
        ...currentDeck.value,
        version: currentDeck.value.version + 1,
        slides: currentDeck.value.slides.map((slide) =>
          slide.slideId === "slide_intro"
            ? { ...slide, speakerNotes: "AI approved notes" }
            : slide
        )
      };
      currentDeck.value = nextDeck;

      return {
        deck: nextDeck,
        changeRecord: {
          changeId: "change_ai_1",
          deckId: body.patch.deckId,
          beforeVersion: body.patch.baseVersion,
          afterVersion: nextDeck.version,
          source: "ai",
          createdAt: "2026-06-29T00:00:01.000Z",
          operations: body.patch.operations
        },
        snapshot: {
          snapshotId: "snapshot_ai_1",
          projectId: nextDeck.projectId,
          deckId: nextDeck.deckId,
          version: nextDeck.version,
          reason: "patch-applied",
          createdAt: "2026-06-29T00:00:01.000Z"
        },
        updatedAt: "2026-06-29T00:00:01.000Z"
      };
    })
  } as unknown as DecksService;
  const service = new AiSuggestionsService(
    repository,
    projectsService,
    decksService
  );

  return { currentDeck, decksService, service, suggestions };
}

describe("AiSuggestionsService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("stores and lists pending suggestions without applying patches", async () => {
    const { decksService, service } = createService();
    const response = await service.create("project_demo_1", createRequest());
    const list = await service.list("project_demo_1", {
      deckId: "deck_demo_1",
      slideId: "slide_intro",
      status: "pending"
    });

    expect(response.suggestion).toMatchObject({
      projectId: "project_demo_1",
      deckId: "deck_demo_1",
      slideId: "slide_intro",
      status: "pending"
    });
    expect(response.suggestion.suggestionId).toMatch(/^suggestion_/);
    expect(list.suggestions.map((suggestion) => suggestion.suggestionId)).toEqual([
      response.suggestion.suggestionId
    ]);
    expect(decksService.appendPatch).not.toHaveBeenCalled();
  });

  it("applies a pending suggestion through the deck patch service", async () => {
    const { decksService, service } = createService();
    const created = await service.create("project_demo_1", createRequest());
    const applied = await service.apply(
      "project_demo_1",
      created.suggestion.suggestionId
    );

    expect(decksService.appendPatch).toHaveBeenCalledWith("project_demo_1", {
      patch: createRequest().patch,
      snapshotReason: "patch-applied"
    });
    expect(applied.suggestion).toMatchObject({
      status: "applied",
      appliedChangeId: "change_ai_1"
    });
    expect(applied.deck.version).toBe(2);
    expect(applied.snapshot.reason).toBe("patch-applied");
  });

  it("rejects pending suggestions and prevents later apply", async () => {
    const { service } = createService();
    const created = await service.create("project_demo_1", createRequest());
    const rejected = await service.reject(
      "project_demo_1",
      created.suggestion.suggestionId,
      { reason: "사용자가 원하지 않음" }
    );

    expect(rejected.suggestion).toMatchObject({
      status: "rejected",
      rejectedReason: "사용자가 원하지 않음"
    });

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.CONFLICT,
      "AI_SUGGESTION_NOT_PENDING"
    );
  });

  it("rejects already applied suggestions", async () => {
    const { service } = createService();
    const created = await service.create("project_demo_1", createRequest());

    await service.apply("project_demo_1", created.suggestion.suggestionId);

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.CONFLICT,
      "AI_SUGGESTION_NOT_PENDING"
    );
  });

  it("does not apply a suggestion when the slide was deleted", async () => {
    const { currentDeck, decksService, service } = createService();
    const created = await service.create("project_demo_1", createRequest());

    currentDeck.value = {
      ...currentDeck.value,
      slides: []
    };

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.CONFLICT,
      "AI_SUGGESTION_SLIDE_DELETED"
    );
    expect(decksService.appendPatch).not.toHaveBeenCalled();
  });

  it("does not apply a stale suggestion", async () => {
    const { currentDeck, decksService, service } = createService();
    const created = await service.create("project_demo_1", createRequest());

    currentDeck.value = {
      ...currentDeck.value,
      version: 2
    };

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.CONFLICT,
      "AI_SUGGESTION_STALE_BASE_VERSION"
    );
    expect(decksService.appendPatch).not.toHaveBeenCalled();
  });

  it("maps deck patch stale errors during apply to stale suggestion errors", async () => {
    const { decksService, service, suggestions } = createService();
    const created = await service.create("project_demo_1", createRequest());

    vi.mocked(decksService.appendPatch).mockRejectedValueOnce(
      new HttpException(
        {
          code: "STALE_BASE_VERSION",
          message: "Patch baseVersion does not match current deck version",
          details: []
        },
        HttpStatus.CONFLICT
      )
    );

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.CONFLICT,
      "AI_SUGGESTION_STALE_BASE_VERSION"
    );
    expect(suggestions[0]?.status).toBe("pending");
  });

  it("keeps the suggestion pending when the generated patch cannot apply", async () => {
    const { decksService, service, suggestions } = createService();
    const created = await service.create("project_demo_1", createRequest());

    vi.mocked(decksService.appendPatch).mockRejectedValueOnce(
      new HttpException({ code: "PATCH_APPLY_FAILED" }, HttpStatus.BAD_REQUEST)
    );

    await expectAiSuggestionError(
      () => service.apply("project_demo_1", created.suggestion.suggestionId),
      HttpStatus.BAD_REQUEST,
      "AI_SUGGESTION_PATCH_APPLY_FAILED"
    );
    expect(suggestions[0]?.status).toBe("pending");
  });

  it("rejects invalid suggestion payloads", async () => {
    const { service } = createService();

    await expectAiSuggestionError(
      () =>
        service.create("project_demo_1", {
          ...createRequest(),
          patch: {
            ...createRequest().patch,
            source: "user"
          }
        }),
      HttpStatus.BAD_REQUEST,
      "AI_SUGGESTION_VALIDATION_FAILED"
    );
  });
});

async function expectAiSuggestionError(
  action: () => Promise<unknown>,
  status: HttpStatus,
  code: string
) {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof HttpException)) {
      throw error;
    }

    expect(error.getStatus()).toBe(status);
    expect(aiSuggestionErrorSchema.parse(error.getResponse()).code).toBe(code);
    return;
  }

  throw new Error(`Expected AI suggestion error: ${code}`);
}

function createRequest() {
  return {
    deckId: "deck_demo_1",
    slideId: "slide_intro",
    baseVersion: 1,
    title: "발표 메모 개선",
    summary: "첫 문장을 더 명확하게 바꿉니다.",
    patch: {
      deckId: "deck_demo_1",
      baseVersion: 1,
      source: "ai",
      operations: [
        {
          type: "update_speaker_notes",
          slideId: "slide_intro",
          speakerNotes: "AI approved notes"
        }
      ]
    }
  } satisfies {
    deckId: string;
    slideId: string;
    baseVersion: number;
    title: string;
    summary: string;
    patch: DeckPatch;
  };
}

function createDeck(): Deck {
  return deckSchema.parse({
    deckId: "deck_demo_1",
    projectId: "project_demo_1",
    title: "ORBIT Demo Deck",
    version: 1,
    metadata: {
      language: "ko",
      locale: "ko-KR"
    },
    canvas: {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "16:9"
    },
    slides: [
      {
        slideId: "slide_intro",
        order: 1,
        title: "소개",
        thumbnailUrl: "",
        style: {},
        speakerNotes: "기존 발표 메모",
        elements: [],
        keywords: [],
        animations: [],
        actions: []
      }
    ]
  });
}
