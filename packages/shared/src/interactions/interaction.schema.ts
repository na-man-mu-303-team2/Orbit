import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  audienceIdSchema,
  audienceSafePayloadSchema,
} from "../audience/audience.schema";

export const interactionIdSchema = z
  .string()
  .regex(/^interaction_[0-9a-f-]{36}$/);
export const libraryInteractionIdSchema = z
  .string()
  .regex(/^library_interaction_[0-9a-f-]{36}$/);
export const questionIdSchema = z.string().regex(/^question_[0-9a-f-]{36}$/);
export const responseIdSchema = z.string().regex(/^response_[0-9a-f-]{36}$/);
export const surveyIdSchema = z.string().regex(/^survey_[0-9a-f-]{36}$/);
export const surveyResponseIdSchema = z
  .string()
  .regex(/^survey_response_[0-9a-f-]{36}$/);

export const interactionKindSchema = z.enum(["poll", "quiz"]);
export const interactionResultVisibilitySchema = z.enum([
  "hidden",
  "manual",
  "after-close",
  "live",
]);
export const quizScoringSchema = z.enum([
  "none",
  "correct-count",
  "speed-bonus",
]);

export const choiceOptionSchema = z
  .object({
    optionId: z.string().min(1),
    label: z.string().trim().min(1).max(160),
  })
  .strict();

export const interactionQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("choice"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      required: z.boolean(),
      options: z.array(choiceOptionSchema).min(2).max(10),
      allowMultiple: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal("scale"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      required: z.boolean(),
      min: z.literal(1),
      max: z.literal(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("open-text"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      required: z.boolean(),
      maxLength: z.number().int().min(1).max(1000).default(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("ranking"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      required: z.boolean(),
      options: z.array(choiceOptionSchema).min(2).max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz-multiple-choice"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      options: z.array(choiceOptionSchema).min(2).max(10),
      correctOptionIds: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz-true-false"),
      questionId: questionIdSchema,
      prompt: z.string().trim().min(1).max(500),
      correctAnswer: z.boolean(),
    })
    .strict(),
]);

export const sessionInteractionSchema = z
  .object({
    interactionId: interactionIdSchema,
    sessionId: z.string().min(1),
    kind: interactionKindSchema,
    title: z.string().trim().min(1).max(160),
    questions: z.array(interactionQuestionSchema).min(1),
    resultVisibility: interactionResultVisibilitySchema,
    quizScoring: quizScoringSchema.default("none"),
    source: z.enum(["library", "ad-hoc"]),
    order: z.number().int().nonnegative(),
    activatedAt: isoDateTimeSchema.nullable(),
    closedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const interactionDraftSchema = z
  .object({
    kind: interactionKindSchema,
    title: z.string().trim().min(1).max(160),
    questions: z.array(interactionQuestionSchema).min(1),
    resultVisibility: interactionResultVisibilitySchema.default("hidden"),
    quizScoring: quizScoringSchema.default("none"),
  })
  .strict()
  .superRefine((draft, context) => {
    const hasQuizQuestion = draft.questions.some((question) =>
      question.type.startsWith("quiz-"),
    );
    const hasPollQuestion = draft.questions.some(
      (question) => !question.type.startsWith("quiz-"),
    );

    if (draft.kind === "poll" && hasQuizQuestion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "poll interactions cannot include quiz questions",
        path: ["questions"],
      });
    }

    if (draft.kind === "quiz" && hasPollQuestion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quiz interactions cannot include poll questions",
        path: ["questions"],
      });
    }
  });

export const projectInteractionLibraryItemSchema = z
  .object({
    libraryInteractionId: libraryInteractionIdSchema,
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    kind: interactionKindSchema,
    questions: z.array(interactionQuestionSchema).min(1),
    resultVisibility: interactionResultVisibilitySchema,
    quizScoring: quizScoringSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const createInteractionLibraryItemRequestSchema = interactionDraftSchema;

export const createInteractionLibraryItemResponseSchema = z
  .object({
    interaction: projectInteractionLibraryItemSchema,
  })
  .strict();

export const listInteractionLibraryItemsResponseSchema = z
  .object({
    interactions: z.array(projectInteractionLibraryItemSchema),
  })
  .strict();

export const selectSessionInteractionsRequestSchema = z
  .object({
    libraryInteractionIds: z.array(libraryInteractionIdSchema).max(20),
  })
  .strict();

export const listSessionInteractionsResponseSchema = z
  .object({
    interactions: z.array(sessionInteractionSchema),
  })
  .strict();

export const createAdHocSessionInteractionRequestSchema =
  interactionDraftSchema;

export const sessionInteractionResponseSchema = z
  .object({
    interaction: sessionInteractionSchema,
  })
  .strict();

export const interactionAnswerSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("choice"),
      selectedOptionIds: z.array(z.string().min(1)).min(1).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal("scale"),
      value: z.number().int().min(1).max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("open-text"),
      text: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      type: z.literal("ranking"),
      orderedOptionIds: z.array(z.string().min(1)).min(2).max(5),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz-multiple-choice"),
      selectedOptionIds: z.array(z.string().min(1)).min(1).max(10),
    })
    .strict(),
  z
    .object({
      type: z.literal("quiz-true-false"),
      answer: z.boolean(),
    })
    .strict(),
]);

export const interactionResponseSchema = z
  .object({
    responseId: responseIdSchema,
    interactionId: interactionIdSchema,
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
    questionId: questionIdSchema,
    answer: interactionAnswerSchema,
    isCorrect: z.boolean().nullable(),
    score: z.number().nonnegative(),
    submittedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const submitInteractionResponseRequestSchema = z
  .object({
    questionId: questionIdSchema,
    answer: interactionAnswerSchema,
  })
  .strict();

export const submitInteractionResponseResponseSchema = z
  .object({
    response: interactionResponseSchema,
  })
  .strict();

export const interactionQuestionResultSchema = z
  .object({
    questionId: questionIdSchema,
    responseCount: z.number().int().nonnegative(),
    optionCounts: z.record(z.number().int().nonnegative()).default({}),
    average: z.number().nullable().default(null),
    openTextResponses: z.array(z.string()).default([]),
  })
  .strict();

export const interactionResultsSchema = z
  .object({
    interactionId: interactionIdSchema,
    sessionId: z.string().min(1),
    visibleToAudience: z.boolean(),
    responseCount: z.number().int().nonnegative(),
    questionResults: z.array(interactionQuestionResultSchema),
  })
  .strict();

export const interactionResultsResponseSchema = z
  .object({
    results: interactionResultsSchema,
  })
  .strict();

export const audienceActiveInteractionResponseSchema = z
  .object({
    interaction: sessionInteractionSchema.nullable(),
    results: interactionResultsSchema.nullable(),
  })
  .strict();

export const reactionTypeSchema = z.enum(["clap", "heart", "wow", "laugh"]);

export const submitReactionRequestSchema = z
  .object({
    reaction: reactionTypeSchema,
  })
  .strict();

export const submitReactionResponseSchema = z
  .object({
    reaction: reactionTypeSchema,
    accepted: z.literal(true),
  })
  .strict();

export const questionStatusSchema = z.enum(["pending", "answered"]);

export const audienceQuestionSchema = z
  .object({
    questionId: questionIdSchema,
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
    questionGroupId: questionIdSchema,
    text: z.string().trim().min(1).max(1000),
    status: questionStatusSchema,
    submittedAt: isoDateTimeSchema,
    answeredAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const submitAudienceQuestionRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

export const audienceQuestionResponseSchema = z
  .object({
    question: audienceQuestionSchema,
  })
  .strict();

export const presenterQuestionQueueResponseSchema = z
  .object({
    questions: z.array(audienceQuestionSchema),
  })
  .strict();

export const markAudienceQuestionAnsweredResponseSchema =
  audienceQuestionResponseSchema;

export const aiAnswerFailureReasonSchema = z.enum([
  "low-confidence",
  "no-grounding",
  "timeout",
  "worker-error",
]);

export const aiAnswerFeedbackSchema = z.enum(["resolved", "unresolved"]);

export const audienceQuestionAnswerSchema = z
  .object({
    questionId: questionIdSchema,
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
    answerText: z.string().trim().min(1).nullable(),
    sourceReferences: z.array(z.string().min(1)).default([]),
    confidence: z.number().min(0).max(1).nullable(),
    failureReason: aiAnswerFailureReasonSchema.nullable(),
    feedback: aiAnswerFeedbackSchema.nullable(),
    escalatedToPresenter: z.boolean(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const qnaWorkerAnswerRequestSchema = z
  .object({
    projectId: z.string().min(1),
    sessionId: z.string().min(1),
    questionId: questionIdSchema,
    questionText: z.string().trim().min(1).max(1000),
    publicSlideContext: z.string().max(8000).default(""),
    selectedReferenceIds: z.array(z.string().min(1)).default([]),
    retrievalLimit: z.number().int().min(1).max(20).default(5),
    confidenceThreshold: z.number().min(0).max(1).default(0.65),
  })
  .strict();

export const qnaWorkerAnswerResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("answered"),
      answerText: z.string().trim().min(1),
      sourceReferences: z.array(z.string().min(1)).default([]),
      confidence: z.number().min(0).max(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failureReason: aiAnswerFailureReasonSchema,
      sourceReferences: z.array(z.string().min(1)).default([]),
      confidence: z.number().min(0).max(1).nullable().default(null),
    })
    .strict(),
]);

export const audienceQuestionAnswerResponseSchema = z
  .object({
    question: audienceQuestionSchema,
    answer: audienceQuestionAnswerSchema.nullable(),
  })
  .strict();

export const updateAiAnswerFeedbackRequestSchema = z
  .object({
    feedback: aiAnswerFeedbackSchema,
  })
  .strict();

export const updateAiReferenceSelectionRequestSchema = z
  .object({
    referenceIds: z.array(z.string().min(1)).max(50),
  })
  .strict();

export const updateAiReferenceSelectionResponseSchema = z
  .object({
    referenceIds: z.array(z.string().min(1)),
  })
  .strict();

export const surveyConsentSectionSchema = z
  .object({
    enabled: z.boolean(),
    consentText: z.string().trim().min(1).max(1000),
    fields: z.array(interactionQuestionSchema).default([]),
  })
  .strict()
  .superRefine((section, context) => {
    for (const [index, field] of section.fields.entries()) {
      if (field.type.startsWith("quiz-")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "survey contact fields cannot include quiz questions",
          path: ["fields", index, "type"],
        });
      }

      if (containsForbiddenContactText(field.prompt)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "contact fields must not request sensitive or unique identifying information",
          path: ["fields", index, "prompt"],
        });
      }
    }
  });

export const surveyFormSchema = z
  .object({
    surveyId: surveyIdSchema,
    sessionId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    questions: z.array(interactionQuestionSchema).default([]),
    contact: surveyConsentSectionSchema,
    lockedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((form, context) => {
    for (const [index, question] of form.questions.entries()) {
      if (question.type.startsWith("quiz-")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "survey questions cannot include quiz questions",
          path: ["questions", index, "type"],
        });
      }
    }
  });

export const upsertSessionSurveyFormRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    questions: z.array(interactionQuestionSchema).default([]),
    contact: surveyConsentSectionSchema,
  })
  .strict()
  .superRefine((form, context) => {
    const validation = surveyFormSchema.safeParse({
      surveyId: "survey_00000000-0000-4000-8000-000000000001",
      sessionId: "session_validation",
      title: form.title,
      questions: form.questions,
      contact: form.contact,
      lockedAt: null,
    });

    if (!validation.success) {
      for (const issue of validation.error.issues) {
        context.addIssue(issue);
      }
    }
  });

export const sessionSurveyFormResponseSchema = z
  .object({
    survey: surveyFormSchema.nullable(),
  })
  .strict();

export const surveyResponseSchema = z
  .object({
    responseId: surveyResponseIdSchema,
    surveyId: surveyIdSchema,
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
    submittedAt: isoDateTimeSchema,
    answers: audienceSafePayloadSchema,
    contactConsent: z.boolean(),
    contactAnswers: audienceSafePayloadSchema.default({}),
  })
  .strict()
  .refine(
    (response) =>
      response.contactConsent ||
      Object.keys(response.contactAnswers).length === 0,
    {
      message: "contactAnswers require contactConsent",
    },
  );

export const submitSurveyResponseRequestSchema = z
  .object({
    answers: audienceSafePayloadSchema.default({}),
    contactConsent: z.boolean(),
    contactAnswers: audienceSafePayloadSchema.default({}),
  })
  .strict()
  .refine(
    (response) =>
      response.contactConsent ||
      Object.keys(response.contactAnswers).length === 0,
    {
      message: "contactAnswers require contactConsent",
    },
  );

export const submitSurveyResponseResponseSchema = z
  .object({
    response: surveyResponseSchema,
  })
  .strict();

export type InteractionQuestion = z.infer<typeof interactionQuestionSchema>;
export type InteractionDraft = z.infer<typeof interactionDraftSchema>;
export type ProjectInteractionLibraryItem = z.infer<
  typeof projectInteractionLibraryItemSchema
>;
export type SessionInteraction = z.infer<typeof sessionInteractionSchema>;
export type InteractionAnswer = z.infer<typeof interactionAnswerSchema>;
export type InteractionResponse = z.infer<typeof interactionResponseSchema>;
export type SubmitInteractionResponseResponse = z.infer<
  typeof submitInteractionResponseResponseSchema
>;
export type InteractionResults = z.infer<typeof interactionResultsSchema>;
export type AudienceActiveInteractionResponse = z.infer<
  typeof audienceActiveInteractionResponseSchema
>;
export type ReactionType = z.infer<typeof reactionTypeSchema>;
export type SubmitReactionResponse = z.infer<
  typeof submitReactionResponseSchema
>;
export type AudienceQuestion = z.infer<typeof audienceQuestionSchema>;
export type AudienceQuestionResponse = z.infer<
  typeof audienceQuestionResponseSchema
>;
export type PresenterQuestionQueueResponse = z.infer<
  typeof presenterQuestionQueueResponseSchema
>;
export type AudienceQuestionAnswer = z.infer<
  typeof audienceQuestionAnswerSchema
>;
export type QnaWorkerAnswerRequest = z.infer<
  typeof qnaWorkerAnswerRequestSchema
>;
export type QnaWorkerAnswerResponse = z.infer<
  typeof qnaWorkerAnswerResponseSchema
>;
export type AudienceQuestionAnswerResponse = z.infer<
  typeof audienceQuestionAnswerResponseSchema
>;
export type SurveyForm = z.infer<typeof surveyFormSchema>;
export type SurveyResponse = z.infer<typeof surveyResponseSchema>;
export type UpsertSessionSurveyFormRequest = z.infer<
  typeof upsertSessionSurveyFormRequestSchema
>;
export type SessionSurveyFormResponse = z.infer<
  typeof sessionSurveyFormResponseSchema
>;
export type SubmitSurveyResponseRequest = z.infer<
  typeof submitSurveyResponseRequestSchema
>;
export type SubmitSurveyResponseResponse = z.infer<
  typeof submitSurveyResponseResponseSchema
>;

function containsForbiddenContactText(value: string) {
  const normalized = value.toLocaleLowerCase();
  return forbiddenContactText.some((term) => normalized.includes(term));
}

const forbiddenContactText = [
  "주민등록",
  "resident registration",
  "social security",
  "ssn",
  "passport",
  "여권",
  "driver",
  "운전면허",
  "credit card",
  "카드번호",
  "bank account",
  "계좌",
  "password",
  "비밀번호",
  "token",
  "medical",
  "health",
  "건강",
  "병력",
];
