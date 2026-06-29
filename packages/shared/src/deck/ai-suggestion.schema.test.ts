import { describe, expect, it } from "vitest";

import {
  createAiSuggestionRequestSchema,
  aiSuggestionSchema
} from "./ai-suggestion.schema";

const basePatch = {
  deckId: "deck_demo_1",
  baseVersion: 3,
  source: "ai",
  operations: [
    {
      type: "update_speaker_notes",
      slideId: "slide_intro",
      speakerNotes: "핵심 메시지를 먼저 말합니다."
    }
  ]
};

const baseRequest = {
  deckId: "deck_demo_1",
  slideId: "slide_intro",
  baseVersion: 3,
  title: "발표 메모 개선",
  summary: "첫 문장을 더 명확하게 바꿉니다.",
  patch: basePatch
};

describe("ai suggestion schema", () => {
  it("accepts a slide-scoped AI patch suggestion", () => {
    expect(createAiSuggestionRequestSchema.parse(baseRequest)).toMatchObject({
      deckId: "deck_demo_1",
      slideId: "slide_intro",
      patch: {
        source: "ai",
        operations: [
          {
            type: "update_speaker_notes",
            slideId: "slide_intro"
          }
        ]
      }
    });
  });

  it("rejects non-AI patch sources", () => {
    expect(
      createAiSuggestionRequestSchema.safeParse({
        ...baseRequest,
        patch: {
          ...basePatch,
          source: "user"
        }
      }).success
    ).toBe(false);
  });

  it("rejects cross-slide operations", () => {
    expect(
      createAiSuggestionRequestSchema.safeParse({
        ...baseRequest,
        patch: {
          ...basePatch,
          operations: [
            basePatch.operations[0],
            {
              type: "replace_keywords",
              slideId: "slide_other",
              keywords: []
            }
          ]
        }
      }).success
    ).toBe(false);
  });

  it("rejects deck-level operations", () => {
    expect(
      createAiSuggestionRequestSchema.safeParse({
        ...baseRequest,
        patch: {
          ...basePatch,
          operations: [
            {
              type: "update_deck",
              title: "자동 적용되면 안 되는 변경"
            }
          ]
        }
      }).success
    ).toBe(false);
  });

  it("requires applied suggestions to carry an applied change id", () => {
    expect(
      aiSuggestionSchema.safeParse({
        suggestionId: "suggestion_1",
        projectId: "project_demo_1",
        status: "applied",
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:01.000Z",
        ...baseRequest
      }).success
    ).toBe(false);

    expect(
      aiSuggestionSchema.safeParse({
        suggestionId: "suggestion_1",
        projectId: "project_demo_1",
        status: "applied",
        appliedChangeId: "change_1",
        createdAt: "2026-06-29T00:00:00.000Z",
        updatedAt: "2026-06-29T00:00:01.000Z",
        ...baseRequest
      }).success
    ).toBe(true);
  });
});
