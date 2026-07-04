import { describe, expect, it } from "vitest";

import {
  createInteractionLibraryItemRequestSchema,
  interactionAnswerSchema,
  audienceQuestionResponseSchema,
  audienceAggregateReportSchema,
  interactionDraftSchema,
  interactionQuestionSchema,
  presenterQuestionQueueResponseSchema,
  submitReactionRequestSchema,
  submitAudienceQuestionRequestSchema,
  submitInteractionResponseRequestSchema,
  submitSurveyResponseRequestSchema,
  surveyResponseSchema,
  upsertSessionSurveyFormRequestSchema,
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

  it("validates the fixed audience reaction set", () => {
    expect(submitReactionRequestSchema.parse({ reaction: "clap" })).toEqual({
      reaction: "clap",
    });
    expect(() =>
      submitReactionRequestSchema.parse({ reaction: "custom" }),
    ).toThrow();
  });

  it("requires contact consent before contact answers are stored", () => {
    expect(() =>
      surveyResponseSchema.parse({
        responseId: "survey_response_00000000-0000-4000-8000-000000000001",
        surveyId: "survey_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        submittedAt: "2026-07-05T00:00:00.000Z",
        answers: { satisfaction: 5 },
        contactConsent: false,
        contactAnswers: { email: "person@example.com" },
      }),
    ).toThrow();

    expect(() =>
      submitSurveyResponseRequestSchema.parse({
        answers: {},
        contactConsent: false,
        contactAnswers: { email: "person@example.com" },
      }),
    ).toThrow("contactAnswers require contactConsent");
  });

  it("validates survey form and contact field boundaries", () => {
    const form = {
      title: "발표 설문",
      questions: [
        {
          type: "scale" as const,
          questionId: "question_00000000-0000-4000-8000-000000000001",
          prompt: "발표 만족도",
          required: true,
          min: 1 as const,
          max: 5 as const,
        },
      ],
      contact: {
        enabled: true,
        consentText: "후속 연락에 동의합니다.",
        fields: [
          {
            type: "open-text" as const,
            questionId: "question_00000000-0000-4000-8000-000000000002",
            prompt: "이메일",
            required: false,
            maxLength: 160,
          },
        ],
      },
    };

    expect(upsertSessionSurveyFormRequestSchema.parse(form)).toEqual(form);
    expect(() =>
      upsertSessionSurveyFormRequestSchema.parse({
        ...form,
        questions: [
          {
            type: "quiz-true-false",
            questionId: "question_00000000-0000-4000-8000-000000000003",
            prompt: "퀴즈",
            correctAnswer: true,
          },
        ],
      }),
    ).toThrow("survey questions cannot include quiz questions");
    expect(() =>
      upsertSessionSurveyFormRequestSchema.parse({
        ...form,
        contact: {
          ...form.contact,
          fields: [
            {
              type: "open-text",
              questionId: "question_00000000-0000-4000-8000-000000000004",
              prompt: "주민등록번호",
              required: false,
              maxLength: 160,
            },
          ],
        },
      }),
    ).toThrow("sensitive or unique identifying");
  });

  it("validates anonymous audience aggregate reports", () => {
    expect(
      audienceAggregateReportSchema.parse({
        reportId: "audience_report_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        status: "final",
        aggregate: {
          qna: { total: 2, unanswered: 1 },
          reactions: { clap: 3 },
        },
        generatedAt: "2026-07-05T00:00:00.000Z",
        rawDataDeletedAt: null,
      }),
    ).toMatchObject({ status: "final" });
    expect(() =>
      audienceAggregateReportSchema.parse({
        reportId: "audience_report_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        status: "final",
        aggregate: { rawAudio: "private" },
        generatedAt: "2026-07-05T00:00:00.000Z",
        rawDataDeletedAt: null,
      }),
    ).toThrow("rawAudio");
  });
});
