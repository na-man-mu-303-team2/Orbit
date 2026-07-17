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

  it("supports legacy v1 guides and v2 official web citations without widening Jobs", () => {
    const webRef = {
      kind: "web",
      sourceId: "web:official-1",
      url: "https://example.edu/program",
      title: "공식 교육과정 안내",
      authority: "official",
      contentHash: "b".repeat(64),
      retrievedAt: "2026-07-17T00:00:00.000Z",
    };
    const item = {
      questionId: "question-1",
      questionType: "evidence",
      questionText: "공식 교육과정의 핵심 특징은 무엇인가요?",
      supportState: "grounded",
      keyConcepts: [{ label: "교육과정", sourceRefs: [webRef] }],
      suggestedAnswer: {
        summary: "공식 안내에서 확인된 범위만 답변합니다.",
        structure: ["핵심 특징", "적용 범위"],
        caveats: [],
      },
      remediation: null,
      sourceRefs: [webRef],
    };
    const base = {
      guideId: "guide-1",
      projectId: "project-1",
      deckId: "deck-1",
      deckVersion: 1,
      slideId: "slide-1",
      slideContentHash: "a".repeat(64),
      generatedAt: "2026-07-17T00:00:00.000Z",
      promptVersion: "slide-question-guide-v2",
      model: "fixture",
    };

    expect(slideQuestionGuideSchema.safeParse({
      schemaVersion: 2,
      ...base,
      research: {
        status: "succeeded",
        attempts: 1,
        officialSourceCount: 1,
        issueCodes: [],
        researchedAt: "2026-07-17T00:00:00.000Z",
      },
      items: [item, { ...item, questionId: "question-2" }, { ...item, questionId: "question-3" }],
    }).success).toBe(true);

    expect(slideQuestionGuideSchema.safeParse({
      schemaVersion: 1,
      ...base,
      items: [item, { ...item, questionId: "question-2" }, { ...item, questionId: "question-3" }],
    }).success).toBe(false);
  });
});
