import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  audienceIdSchema,
  audienceSafePayloadSchema,
} from "../audience/audience.schema";

export const interactionIdSchema = z
  .string()
  .regex(/^interaction_[0-9a-f-]{36}$/);
export const questionIdSchema = z.string().regex(/^question_[0-9a-f-]{36}$/);
export const surveyIdSchema = z.string().regex(/^survey_[0-9a-f-]{36}$/);

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

export const questionStatusSchema = z.enum(["pending", "answered"]);

export const audienceQuestionSchema = z
  .object({
    questionId: questionIdSchema,
    sessionId: z.string().min(1),
    audienceId: audienceIdSchema,
    text: z.string().trim().min(1).max(1000),
    status: questionStatusSchema,
    submittedAt: isoDateTimeSchema,
    answeredAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const aiAnswerFailureReasonSchema = z.enum([
  "low-confidence",
  "timeout",
  "worker-error",
]);

export const audienceQuestionAnswerSchema = z
  .object({
    questionId: questionIdSchema,
    answerText: z.string().trim().min(1).nullable(),
    sourceReferences: z.array(z.string().min(1)).default([]),
    confidence: z.number().min(0).max(1).nullable(),
    failureReason: aiAnswerFailureReasonSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const surveyConsentSectionSchema = z
  .object({
    enabled: z.boolean(),
    consentText: z.string().trim().min(1).max(1000),
    fields: z.array(interactionQuestionSchema).default([]),
  })
  .strict();

export const surveyFormSchema = z
  .object({
    surveyId: surveyIdSchema,
    sessionId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    questions: z.array(interactionQuestionSchema).default([]),
    contact: surveyConsentSectionSchema,
    lockedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const surveyResponseSchema = z
  .object({
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

export type InteractionQuestion = z.infer<typeof interactionQuestionSchema>;
export type SessionInteraction = z.infer<typeof sessionInteractionSchema>;
export type AudienceQuestion = z.infer<typeof audienceQuestionSchema>;
export type AudienceQuestionAnswer = z.infer<
  typeof audienceQuestionAnswerSchema
>;
export type SurveyForm = z.infer<typeof surveyFormSchema>;
export type SurveyResponse = z.infer<typeof surveyResponseSchema>;
