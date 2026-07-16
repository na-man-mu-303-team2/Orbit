import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { jobSchema } from "../jobs/job.schema";

const identifierSchema = z.string().trim().min(1).max(128);

export const slideQuestionSourceRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("slide"),
    slideId: identifierSchema,
    objectId: identifierSchema.nullable(),
    deckVersion: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  z.object({
    kind: z.literal("reference"),
    fileId: identifierSchema,
    chunkId: identifierSchema,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
]);

export const slideQuestionGuideSourceSnapshotSchema = z.object({
  slideId: identifierSchema,
  deckVersion: z.number().int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().max(500),
  content: z.string().trim().max(8_000),
}).strict();

export const slideQuestionTypeSchema = z.enum([
  "evidence",
  "objection",
  "decision",
]);

export const slideQuestionSupportStateSchema = z.enum([
  "grounded",
  "insufficient",
]);

export const slideQuestionGuideItemCoreSchema = z.object({
  questionId: identifierSchema,
  questionType: slideQuestionTypeSchema,
  questionText: z.string().trim().min(1).max(500),
  supportState: slideQuestionSupportStateSchema,
  keyConcepts: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    sourceRefs: z.array(slideQuestionSourceRefSchema).min(1).max(8),
  }).strict()).max(8),
  suggestedAnswer: z.object({
    summary: z.string().trim().min(1).max(1_000),
    structure: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
    caveats: z.array(z.string().trim().min(1).max(300)).max(6),
  }).strict().nullable(),
  remediation: z.object({
    message: z.string().trim().min(1).max(500),
    actions: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  }).strict().nullable(),
  sourceRefs: z.array(slideQuestionSourceRefSchema).max(12),
}).strict();

export const slideQuestionGuideItemSchema = slideQuestionGuideItemCoreSchema.superRefine((item, context) => {
  if (item.supportState === "grounded" && item.suggestedAnswer === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["suggestedAnswer"],
      message: "Grounded questions require a suggested answer",
    });
  }
  if (item.supportState === "insufficient" && item.remediation === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["remediation"],
      message: "Insufficient questions require remediation guidance",
    });
  }
});

export const createSlideQuestionGuideRequestSchema = z.object({
  clientRequestId: identifierSchema,
  deckId: identifierSchema,
  slideId: identifierSchema,
  expectedDeckVersion: z.number().int().positive(),
  questionCount: z.literal(3),
}).strict();

export const slideQuestionGuideJobPayloadSchema = z.object({
  jobId: identifierSchema,
  projectId: identifierSchema,
  guideId: identifierSchema,
}).strict();

export const slideQuestionGuideJobResultSchema = z.object({
  guideId: identifierSchema,
  projectId: identifierSchema,
  deckId: identifierSchema,
  deckVersion: z.number().int().positive(),
  slideId: identifierSchema,
  itemCount: z.number().int().min(0).max(3),
  generatedAt: isoDateTimeSchema,
}).strict();

export const slideQuestionGuideSchema = z.object({
  schemaVersion: z.literal(1),
  guideId: identifierSchema,
  projectId: identifierSchema,
  deckId: identifierSchema,
  deckVersion: z.number().int().positive(),
  slideId: identifierSchema,
  slideContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(slideQuestionGuideItemSchema).length(3),
  generatedAt: isoDateTimeSchema,
  promptVersion: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
}).strict();

export const slideQuestionGuideJobResponseSchema = z.object({
  job: jobSchema,
  guideId: identifierSchema,
}).strict();

export const slideQuestionGuideListResponseSchema = z.object({
  guides: z.array(slideQuestionGuideSchema).max(50),
}).strict();

export type SlideQuestionGuideItem = z.infer<typeof slideQuestionGuideItemSchema>;
export type SlideQuestionGuide = z.infer<typeof slideQuestionGuideSchema>;
export type CreateSlideQuestionGuideRequest = z.infer<typeof createSlideQuestionGuideRequestSchema>;
export type SlideQuestionGuideJobPayload = z.infer<typeof slideQuestionGuideJobPayloadSchema>;
export type SlideQuestionGuideJobResult = z.infer<typeof slideQuestionGuideJobResultSchema>;
