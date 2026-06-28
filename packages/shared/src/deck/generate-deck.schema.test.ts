import { describe, expect, it } from "vitest";

import {
  generateDeckJobResultSchema,
  generateDeckRequestSchema
} from "./generate-deck.schema";

describe("generateDeckRequestSchema", () => {
  it("normalizes MVP defaults", () => {
    const request = generateDeckRequestSchema.parse({
      topic: "AI 덱 생성",
      references: [{ fileId: "file_1" }]
    });

    expect(request.targetDurationMinutes).toBe(10);
    expect(request.slideCountRange).toEqual({ min: 5, max: 8 });
    expect(request.metadata).toEqual({
      audience: "general",
      purpose: "inform",
      tone: "professional"
    });
    expect(request.template).toBe("default");
    expect(request.referenceKeywords).toEqual([]);
  });

  it("accepts normalized reference keywords", () => {
    const request = generateDeckRequestSchema.parse({
      topic: "AI 덱 생성",
      referenceKeywords: [{ text: " 실시간 발표 피드백 " }]
    });

    expect(request.referenceKeywords).toEqual([{ text: "실시간 발표 피드백" }]);
  });

  it("rejects an inverted slide count range", () => {
    expect(
      generateDeckRequestSchema.safeParse({
        topic: "AI 덱 생성",
        slideCountRange: { min: 8, max: 5 }
      }).success
    ).toBe(false);
  });
});

describe("generateDeckJobResultSchema", () => {
  it("requires a valid generated deck payload", () => {
    const result = generateDeckJobResultSchema.safeParse({
      deckId: "deck_ai_1",
      deck: {
        deckId: "deck_ai_1",
        projectId: "project_demo_1",
        title: "AI 덱 생성",
        version: 1,
        metadata: {
          language: "ko",
          locale: "ko-KR",
          sourceType: "ai",
          generatedBy: "ai"
        },
        canvas: {
          preset: "wide-16-9",
          width: 1920,
          height: 1080,
          aspectRatio: "16:9"
        },
        slides: [
          {
            slideId: "slide_1",
            order: 1,
            title: "Opening",
            thumbnailUrl: "",
            style: {},
            speakerNotes: "발표자 노트",
            elements: [],
            keywords: [],
            animations: [],
            aiNotes: {
              emphasisPoints: ["핵심 메시지"],
              sourceEvidence: [{ fileId: "file_1" }]
            }
          }
        ]
      },
      warnings: [],
      validation: {
        passed: true,
        layoutIssues: [],
        contentIssues: [],
        designIssues: [],
        presentationIssues: []
      }
    });

    expect(result.success).toBe(true);
  });
});
