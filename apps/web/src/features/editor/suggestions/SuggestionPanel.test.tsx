import { createDemoDeck } from "@orbit/editor-core";
import type { AiSuggestion, Deck, ListAiSuggestionsResponse } from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SuggestionPanel } from "./SuggestionPanel";
import { aiSuggestionsQueryKey } from "./suggestionApi";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });
}

function createSuggestion(
  deck: Deck,
  status: AiSuggestion["status"] = "pending"
): AiSuggestion {
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

function renderPanel(
  queryClient: QueryClient,
  deck: Deck,
  slideId: string | null = deck.slides[0]?.slideId ?? null
) {
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <SuggestionPanel
        deck={deck}
        projectId={deck.projectId}
        slideId={slideId}
        onApplySuccess={vi.fn()}
      />
    </QueryClientProvider>
  );
}

function seedSuggestions(
  queryClient: QueryClient,
  deck: Deck,
  suggestions: AiSuggestion[]
) {
  const slideId = deck.slides[0].slideId;
  const response: ListAiSuggestionsResponse = {
    projectId: deck.projectId,
    suggestions
  };

  queryClient.setQueryData(
    aiSuggestionsQueryKey(deck.projectId, {
      deckId: deck.deckId,
      slideId
    }),
    response
  );
}

describe("SuggestionPanel", () => {
  it("renders pending suggestions with apply and reject actions", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    seedSuggestions(queryClient, deck, [createSuggestion(deck)]);

    const html = renderPanel(queryClient, deck);

    expect(html).toContain("AI 제안 검토");
    expect(html).toContain("발표 메모 개선");
    expect(html).toContain("대기");
    expect(html).toContain("적용");
    expect(html).toContain("거절");
  });

  it("shows applied and rejected suggestion states without action buttons", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    seedSuggestions(queryClient, deck, [
      createSuggestion(deck, "applied"),
      createSuggestion(deck, "rejected")
    ]);

    const html = renderPanel(queryClient, deck);

    expect(html).toContain("적용됨");
    expect(html).toContain("거절됨");
    expect(html).not.toContain(">적용</button>");
  });

  it("renders an empty state for slides without suggestions", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    seedSuggestions(queryClient, deck, []);

    const html = renderPanel(queryClient, deck);

    expect(html).toContain("현재 슬라이드에 검토할 AI 제안이 없습니다.");
  });

  it("renders a no-slide state when nothing is selected", () => {
    const queryClient = createTestQueryClient();
    const deck = createDemoDeck();

    const html = renderPanel(queryClient, deck, null);

    expect(html).toContain("선택된 슬라이드가 없습니다.");
  });
});
