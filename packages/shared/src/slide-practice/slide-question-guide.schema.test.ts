import { describe, expect, it } from "vitest";

import {
  slideQuestionGuideJobPayloadSchema,
  slideQuestionGuideJobResultSchema,
  slideQuestionGuideSchema,
} from "./slide-question-guide.schema";

describe("slide question guide privacy contract", () => {
  it("keeps job payload and result identifier-only", () => {
    expect(slideQuestionGuideJobPayloadSchema.safeParse({
      jobId: "job-1",
      projectId: "project-1",
      guideId: "guide-1",
      questionText: "Job에 들어가면 안 되는 질문",
    }).success).toBe(false);

    expect(slideQuestionGuideJobResultSchema.safeParse({
      guideId: "guide-1",
      projectId: "project-1",
      deckId: "deck-1",
      deckVersion: 1,
      slideId: "slide-1",
      itemCount: 3,
      generatedAt: "2026-07-17T00:00:00.000Z",
      suggestedAnswer: "Job에 들어가면 안 되는 답변",
    }).success).toBe(false);
  });

  it("requires exactly three canonical questions", () => {
    expect(slideQuestionGuideSchema.safeParse({
      schemaVersion: 1,
      guideId: "guide-1",
      projectId: "project-1",
      deckId: "deck-1",
      deckVersion: 1,
      slideId: "slide-1",
      slideContentHash: "a".repeat(64),
      items: [],
      generatedAt: "2026-07-17T00:00:00.000Z",
      promptVersion: "slide-question-guide-v1",
      model: "fixture",
    }).success).toBe(false);
  });
});
