import { createDemoDeck } from "@orbit/editor-core";
import type {
  AiSuggestion,
  ApplyAiSuggestionResponse,
  ListAiSuggestionsResponse,
  RejectAiSuggestionResponse
} from "@orbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyAiSuggestion,
  fetchAiSuggestions,
  rejectAiSuggestion
} from "./suggestionApi";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function createSuggestion(status: AiSuggestion["status"] = "pending"): AiSuggestion {
  const deck = createDemoDeck();
  const slide = deck.slides[0];
  const suggestion = {
    suggestionId: `suggestion_${status}`,
    projectId: deck.projectId,
    deckId: deck.deckId,
    slideId: slide.slideId,
    baseVersion: deck.version,
    title: "발표 메모 개선",
    summary: "현재 슬라이드의 첫 문장을 더 명확하게 바꿉니다.",
    patch: {
      deckId: deck.deckId,
      baseVersion: deck.version,
      source: "ai",
      operations: [
        {
          type: "update_speaker_notes",
          slideId: slide.slideId,
          speakerNotes: "핵심 메시지를 먼저 말합니다."
        }
      ]
    },
    status,
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:01.000Z"
  } satisfies AiSuggestion;

  if (status === "applied") {
    return {
      ...suggestion,
      appliedChangeId: "change_applied"
    };
  }

  if (status === "rejected") {
    return {
      ...suggestion,
      rejectedReason: "사용자가 거절함"
    };
  }

  return suggestion;
}

function createApplyResponse(): ApplyAiSuggestionResponse {
  const deck = createDemoDeck();
  const suggestion = createSuggestion("applied");
  const updatedDeck = {
    ...deck,
    version: deck.version + 1,
    slides: deck.slides.map((slide, index) =>
      index === 0
        ? {
            ...slide,
            speakerNotes: "핵심 메시지를 먼저 말합니다."
          }
        : slide
    )
  };

  return {
    suggestion,
    deck: updatedDeck,
    changeRecord: {
      changeId: "change_applied",
      deckId: deck.deckId,
      beforeVersion: deck.version,
      afterVersion: updatedDeck.version,
      source: "ai",
      createdAt: "2026-06-29T00:00:02.000Z",
      operations: suggestion.patch.operations
    },
    snapshot: {
      snapshotId: "snapshot_ai_apply",
      projectId: deck.projectId,
      deckId: deck.deckId,
      version: updatedDeck.version,
      reason: "patch-applied",
      createdAt: "2026-06-29T00:00:02.000Z"
    },
    updatedAt: "2026-06-29T00:00:02.000Z"
  };
}

describe("suggestion API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists slide suggestions with query filters", async () => {
    const deck = createDemoDeck();
    const suggestion = createSuggestion();
    const payload: ListAiSuggestionsResponse = {
      projectId: deck.projectId,
      suggestions: [suggestion]
    };
    const fetcher = vi.fn(async () => jsonResponse(payload));

    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchAiSuggestions(deck.projectId, {
        deckId: deck.deckId,
        slideId: deck.slides[0].slideId,
        status: "pending"
      })
    ).resolves.toEqual(payload);

    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/projects/${deck.projectId}/ai-suggestions?deckId=${deck.deckId}&slideId=${deck.slides[0].slideId}&status=pending`
    );
  });

  it("applies a suggestion through the server endpoint and returns the updated deck", async () => {
    const deck = createDemoDeck();
    const payload = createApplyResponse();
    const fetcher = vi.fn(async () => jsonResponse(payload));

    vi.stubGlobal("fetch", fetcher);

    await expect(
      applyAiSuggestion(deck.projectId, "suggestion_pending")
    ).resolves.toMatchObject({
      deck: {
        deckId: deck.deckId,
        version: deck.version + 1
      },
      changeRecord: {
        changeId: "change_applied",
        source: "ai"
      }
    });

    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/projects/${deck.projectId}/ai-suggestions/suggestion_pending/apply`,
      {
        method: "POST"
      }
    );
  });

  it("rejects a suggestion through the server endpoint", async () => {
    const deck = createDemoDeck();
    const payload: RejectAiSuggestionResponse = {
      suggestion: createSuggestion("rejected")
    };
    const fetcher = vi.fn(async () => jsonResponse(payload));

    vi.stubGlobal("fetch", fetcher);

    await expect(
      rejectAiSuggestion(deck.projectId, "suggestion_pending")
    ).resolves.toEqual(payload);

    expect(fetcher).toHaveBeenCalledWith(
      `/api/v1/projects/${deck.projectId}/ai-suggestions/suggestion_pending/reject`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      }
    );
  });

  it("surfaces AI suggestion error codes", async () => {
    const deck = createDemoDeck();
    const fetcher = vi.fn(async () =>
      jsonResponse(
        {
          code: "AI_SUGGESTION_STALE_BASE_VERSION",
          message: "stale deck version",
          details: []
        },
        409
      )
    );

    vi.stubGlobal("fetch", fetcher);

    await expect(
      applyAiSuggestion(deck.projectId, "suggestion_pending")
    ).rejects.toThrow("AI_SUGGESTION_STALE_BASE_VERSION: stale deck version");
  });
});
