import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { allowedRehearsalAudioMimeTypes } from "../files/file.schema";
import {
  cleanupStateSchema,
  clientRequestIdSchema,
  coachingErrorCodeSchema,
  coachingIdSchema,
  evaluatorLensRefSchema,
  frozenBriefRefSchema,
} from "./coaching-common.schema";
import { approvedReferenceSnapshotRefSchema } from "./presentation-brief.schema";

const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const challengeQnaSourceSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("checkpoint"),
      sourcePracticeSessionId: coachingIdSchema,
      sourceAttemptId: coachingIdSchema,
      questionCount: z.literal(1),
    })
    .strict(),
  z
    .object({
      mode: z.literal("final"),
      sourceFullRunId: coachingIdSchema,
      questionCount: z.literal(3),
    })
    .strict(),
]);

export const challengeQnaSourceSnapshotSchema = z
  .object({
    snapshotVersion: z.literal(1),
    projectId: coachingIdSchema,
    deck: z
      .object({
        deckId: coachingIdSchema,
        deckVersion: z.number().int().positive(),
        deckContentHash: contentHashSchema,
        slides: z
          .array(
            z
              .object({
                slideId: coachingIdSchema,
                order: z.number().int().positive(),
                title: z.string().trim().min(1).max(240),
                visibleText: z.string().max(12_000),
                contentHash: contentHashSchema,
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    briefRef: frozenBriefRefSchema,
    evaluatorLensRef: evaluatorLensRefSchema,
    linkedGoalRefs: z
      .array(
        z
          .object({
            goalId: coachingIdSchema,
            criterionId: coachingIdSchema,
            criterionRevision: z.number().int().positive(),
          })
          .strict(),
      )
      .max(3),
    approvedReferences: z.array(approvedReferenceSnapshotRefSchema).max(10),
    capturedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const totalVisibleText = snapshot.deck.slides.reduce(
      (total, slide) => total + slide.visibleText.length,
      0,
    );
    if (totalVisibleText > 100_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Q&A source visible text is limited to 100,000 characters.",
        path: ["deck", "slides"],
      });
    }
  });

export const challengeQnaGroundingSnapshotSchema = z
  .object({
    snapshotVersion: z.literal(1),
    chunks: z
      .array(
        z
          .object({
            fileId: coachingIdSchema,
            fileContentHash: contentHashSchema,
            chunkId: coachingIdSchema,
            content: z.string().trim().min(1).max(2_000),
            contentHash: contentHashSchema,
          })
          .strict(),
      )
      .max(20),
    capturedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (
      snapshot.chunks.reduce((total, chunk) => total + chunk.content.length, 0) >
      40_000
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Q&A grounding content is limited to 40,000 characters.",
        path: ["chunks"],
      });
    }
  });

export const challengeQnaSessionStatusSchema = z.enum([
  "preparing",
  "ready",
  "active",
  "completed",
  "failed",
  "cancelled",
]);
export const assistanceLevelSchema = z.enum([
  "none",
  "concept-hint",
  "slide-hint",
  "full-guide",
]);

export const challengeQnaSessionSchema = z
  .object({
    qnaSessionId: coachingIdSchema,
    projectId: coachingIdSchema,
    deckId: coachingIdSchema,
    source: challengeQnaSourceSchema,
    sourceSnapshot: challengeQnaSourceSnapshotSchema,
    groundingSnapshot: challengeQnaGroundingSnapshotSchema.nullable(),
    status: challengeQnaSessionStatusSchema,
    generationRevision: z.number().int().positive(),
    generationJobId: coachingIdSchema.nullable(),
    activeQuestionOrder: z.number().int().min(1).max(3).nullable(),
    executionMode: z.enum(["provider", "fixture"]),
    errorCode: coachingErrorCodeSchema.nullable(),
    createdBy: coachingIdSchema,
    createdAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const challengeSourceReferenceSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("slide"),
      slideId: coachingIdSchema,
      deckVersion: z.number().int().positive(),
      slideOrder: z.number().int().positive(),
      title: z.string().trim().min(1).max(240),
      contentHash: contentHashSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("reference"),
      fileId: coachingIdSchema,
      fileContentHash: contentHashSchema,
      chunkId: coachingIdSchema,
      contentHash: contentHashSchema,
    })
    .strict(),
]);

const challengeAnswerGuideShape = {
  supportState: z.enum(["grounded", "insufficient"]),
  mustIncludeConcepts: z
    .array(
      z
        .object({
          conceptId: coachingIdSchema,
          label: z.string().trim().min(1).max(160),
          sourceRefs: z.array(challengeSourceReferenceSchema).max(10),
        })
        .strict(),
    )
    .max(8),
  suggestedStructure: z.array(z.string().trim().min(1).max(240)).min(1).max(5),
  caveats: z.array(z.string().trim().min(1).max(240)).max(3),
  remediation: z
    .object({
      message: z.string().trim().min(1).max(240),
      suggestedSlideIds: z.array(coachingIdSchema).max(3),
      action: z.enum(["add-reference", "revise-slide", "narrow-claim"]),
    })
    .strict()
    .nullable(),
} as const;

export const challengeAnswerGuideSchema = z
  .object(challengeAnswerGuideShape)
  .strict()
  .superRefine((guide, context) => {
    if (guide.supportState === "grounded") {
      if (guide.mustIncludeConcepts.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "grounded guides require at least one sourced concept.",
          path: ["mustIncludeConcepts"],
        });
      }
      if (guide.remediation !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "grounded guides must not include remediation.",
          path: ["remediation"],
        });
      }
      guide.mustIncludeConcepts.forEach((concept, index) => {
        if (concept.sourceRefs.length === 0) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "grounded concepts require a source reference.",
            path: ["mustIncludeConcepts", index, "sourceRefs"],
          });
        }
      });
    } else if (guide.remediation === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "insufficient guides require remediation.",
        path: ["remediation"],
      });
    }
  });

export const challengeQuestionSchema = z
  .object({
    questionId: coachingIdSchema,
    projectId: coachingIdSchema,
    qnaSessionId: coachingIdSchema,
    revision: z.number().int().positive(),
    order: z.number().int().min(1).max(3),
    questionType: z.enum(["clarification", "evidence", "objection", "decision"]),
    difficulty: z.enum(["standard", "challenging"]),
    questionText: z.string().trim().min(1).max(500),
    linkedGoalIds: z.array(coachingIdSchema).max(3),
    sourceRefs: z.array(challengeSourceReferenceSchema).max(20),
    answerGuide: challengeAnswerGuideSchema,
    provenance: z
      .object({
        generator: z.string().trim().min(1).max(120),
        model: z.string().trim().min(1).max(120),
        schemaVersion: z.literal(1),
        promptTemplateVersion: z.string().trim().min(1).max(120),
      })
      .strict(),
  })
  .strict();

export const challengeQnaAnswerAttemptStatusSchema = z.enum([
  "created",
  "uploading",
  "queued",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
]);

export const challengeQnaAnswerAttemptSchema = z
  .object({
    answerAttemptId: coachingIdSchema,
    projectId: coachingIdSchema,
    qnaSessionId: coachingIdSchema,
    questionId: coachingIdSchema,
    questionRevision: z.number().int().positive(),
    attemptNumber: z.number().int().positive(),
    inputMode: z.enum(["voice", "text"]),
    assistanceLevel: assistanceLevelSchema,
    status: challengeQnaAnswerAttemptStatusSchema,
    analysisJobId: coachingIdSchema.nullable(),
    audioFileId: coachingIdSchema.nullable(),
    cleanupState: cleanupStateSchema,
    cleanupGeneration: z.number().int().positive(),
    rawAudioDeletedAt: isoDateTimeSchema.nullable(),
    rawAudioDeleteDeadlineAt: isoDateTimeSchema.nullable(),
    durationMs: z.number().int().min(1).max(120_000).nullable(),
    evidenceExpiresAt: isoDateTimeSchema.nullable(),
    conceptOutcomes: z
      .array(
        z
          .object({
            conceptId: coachingIdSchema,
            outcome: z.enum(["covered", "partial", "missed", "unmeasured"]),
          })
          .strict(),
      )
      .max(8),
    clarity: z.enum(["clear", "needs-focus", "unmeasured"]).nullable(),
    audienceFit: z
      .enum(["appropriate", "too-technical", "too-vague", "unmeasured"])
      .nullable(),
    errorCode: coachingErrorCodeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((attempt, context) => {
    if (attempt.inputMode === "text" && (attempt.audioFileId !== null || attempt.durationMs !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "text answer attempts must not retain audio metadata.",
        path: ["audioFileId"],
      });
    }
  });

export const createChallengeQnaSessionRequestSchema = z
  .object({ clientRequestId: clientRequestIdSchema, source: challengeQnaSourceSchema })
  .strict();

export const retryChallengeQnaGenerationRequestSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    expectedGenerationRevision: z.number().int().positive(),
  })
  .strict();

export const revealAssistanceRequestSchema = z
  .object({
    questionRevision: z.number().int().positive(),
    level: z.enum(["concept-hint", "slide-hint", "full-guide"]),
  })
  .strict();

const answerAttemptBaseShape = {
  clientRequestId: clientRequestIdSchema,
  questionRevision: z.number().int().positive(),
} as const;

export const createChallengeQnaAnswerAttemptRequestSchema = z.discriminatedUnion(
  "inputMode",
  [
    z
      .object({
        ...answerAttemptBaseShape,
        inputMode: z.literal("voice"),
        mimeType: z.enum(allowedRehearsalAudioMimeTypes),
        size: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        ...answerAttemptBaseShape,
        inputMode: z.literal("text"),
        answerText: z.string().trim().min(1).max(8_000),
      })
      .strict(),
  ],
);

export const completeChallengeQnaAudioRequestSchema = z
  .object({
    fileId: coachingIdSchema,
    durationMs: z.number().int().min(1).max(120_000),
  })
  .strict();

export type ChallengeQnaSource = z.infer<typeof challengeQnaSourceSchema>;
export type ChallengeQnaSourceSnapshot = z.infer<
  typeof challengeQnaSourceSnapshotSchema
>;
export type ChallengeQnaGroundingSnapshot = z.infer<
  typeof challengeQnaGroundingSnapshotSchema
>;
export type ChallengeQnaSession = z.infer<typeof challengeQnaSessionSchema>;
export type ChallengeQuestion = z.infer<typeof challengeQuestionSchema>;
export type ChallengeQnaAnswerAttempt = z.infer<
  typeof challengeQnaAnswerAttemptSchema
>;

