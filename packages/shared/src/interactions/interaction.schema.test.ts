import { describe, expect, it } from "vitest";

import {
  createInteractionLibraryItemRequestSchema,
  interactionAnswerSchema,
  audienceQuestionResponseSchema,
  interactionDraftSchema,
  interactionQuestionSchema,
  presenterQuestionQueueResponseSchema,
  submitAudienceQuestionRequestSchema,
  submitInteractionResponseRequestSchema,
  surveyResponseSchema,
} from "./interaction.schema";

describe("interaction schemas", () => {
  it("rejects rankings with more than five options", () => {
    expect(() =>
      interactionQuestionSchema.parse({
        type: "ranking",
        questionId: "question_00000000-0000-4000-8000-000000000001",
        prompt: "우선순위를 골라 주세요.",
        required: true,
        options: Array.from({ length: 6 }, (_, index) => ({
          optionId: `option_${index}`,
          label: `Option ${index}`,
        })),
      }),
    ).toThrow();
  });

  it("rejects scale answers outside the fixed one to five range", () => {
    expect(() =>
      interactionQuestionSchema.parse({
        type: "scale",
        questionId: "question_00000000-0000-4000-8000-000000000011",
        prompt: "만족도",
        required: true,
        min: 0,
        max: 10,
      }),
    ).toThrow();
  });

  it("keeps poll and quiz drafts type-safe", () => {
    expect(
      createInteractionLibraryItemRequestSchema.parse({
        kind: "poll",
        title: "만족도",
        questions: [
          {
            type: "scale",
            questionId: "question_00000000-0000-4000-8000-000000000012",
            prompt: "어땠나요?",
            required: true,
            min: 1,
            max: 5,
          },
        ],
        resultVisibility: "live",
      }),
    ).toMatchObject({
      kind: "poll",
      quizScoring: "none",
      resultVisibility: "live",
    });

    expect(() =>
      interactionDraftSchema.parse({
        kind: "poll",
        title: "퀴즈가 섞인 투표",
        questions: [
          {
            type: "quiz-true-false",
            questionId: "question_00000000-0000-4000-8000-000000000013",
            prompt: "맞나요?",
            correctAnswer: true,
          },
        ],
      }),
    ).toThrow("poll interactions cannot include quiz questions");

    expect(() =>
      interactionDraftSchema.parse({
        kind: "quiz",
        title: "투표가 섞인 퀴즈",
        questions: [
          {
            type: "open-text",
            questionId: "question_00000000-0000-4000-8000-000000000014",
            prompt: "의견",
            required: false,
          },
        ],
      }),
    ).toThrow("quiz interactions cannot include poll questions");
  });

  it("validates audience answer request shapes", () => {
    expect(
      submitInteractionResponseRequestSchema.parse({
        questionId: "question_00000000-0000-4000-8000-000000000015",
        answer: { type: "scale", value: 5 },
      }),
    ).toEqual({
      questionId: "question_00000000-0000-4000-8000-000000000015",
      answer: { type: "scale", value: 5 },
    });

    expect(() =>
      interactionAnswerSchema.parse({ type: "scale", value: 6 }),
    ).toThrow();
    expect(() =>
      interactionAnswerSchema.parse({
        type: "ranking",
        orderedOptionIds: ["a", "b", "c", "d", "e", "f"],
      }),
    ).toThrow();
  });

  it("validates private audience Q&A wrappers", () => {
    expect(
      submitAudienceQuestionRequestSchema.parse({ text: "  질문입니다  " }),
    ).toEqual({ text: "질문입니다" });

    const question = {
      questionId: "question_00000000-0000-4000-8000-000000000021",
      questionGroupId: "question_00000000-0000-4000-8000-000000000021",
      sessionId: "session_1",
      audienceId: "audience_00000000-0000-4000-8000-000000000001",
      text: "질문입니다",
      status: "pending",
      submittedAt: "2026-07-05T00:00:00.000Z",
      answeredAt: null,
    };

    expect(audienceQuestionResponseSchema.parse({ question })).toEqual({
      question,
    });
    expect(
      presenterQuestionQueueResponseSchema.parse({ questions: [question] }),
    ).toEqual({ questions: [question] });
  });

  it("requires contact consent before contact answers are stored", () => {
    expect(() =>
      surveyResponseSchema.parse({
        surveyId: "survey_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        submittedAt: "2026-07-05T00:00:00.000Z",
        answers: { satisfaction: 5 },
        contactConsent: false,
        contactAnswers: { email: "person@example.com" },
      }),
    ).toThrow();
  });
});
