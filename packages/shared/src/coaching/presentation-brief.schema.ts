import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  coachingIdSchema,
  evaluatorLensRefSchema,
} from "./coaching-common.schema";

export const briefRequirementKindSchema = z.enum([
  "must-cover",
  "opening",
  "closing",
]);
export const briefRequirementReviewStatusSchema = z.enum([
  "approved",
  "excluded",
]);

export const briefRequirementSchema = z
  .object({
    requirementId: coachingIdSchema,
    revision: z.number().int().positive(),
    kind: briefRequirementKindSchema,
    text: z.string().trim().min(1).max(240),
    reviewStatus: briefRequirementReviewStatusSchema,
  })
  .strict();

export const briefRequirementInputSchema = z
  .object({
    requirementId: coachingIdSchema.optional(),
    expectedRevision: z.number().int().positive().optional(),
    kind: briefRequirementKindSchema,
    text: z.string().trim().min(1).max(240),
    reviewStatus: briefRequirementReviewStatusSchema,
  })
  .strict()
  .superRefine((requirement, context) => {
    if (Boolean(requirement.requirementId) !== Boolean(requirement.expectedRevision)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "existing requirement identity and revision must be provided together.",
        path: [requirement.requirementId ? "expectedRevision" : "requirementId"],
      });
    }
  });

export const approvedReferenceSnapshotRefSchema = z
  .object({
    fileId: coachingIdSchema,
    fileContentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

const terminologyEntrySchema = z
  .object({
    term: z.string().trim().min(1).max(120),
    explanation: z.string().trim().min(1).max(120),
  })
  .strict();

const presentationBriefContentShape = {
    audience: z.enum(["novice", "practitioner", "decision-maker"]),
    purpose: z.enum(["inform", "persuade", "teach", "report"]),
    evaluatorLensRef: evaluatorLensRefSchema,
    targetDurationMinutes: z.number().int().min(1).max(120),
    desiredOutcome: z.string().trim().min(1).max(240),
    requirements: z.array(briefRequirementSchema).max(5),
    terminology: z.array(terminologyEntrySchema).max(10),
    challengeTopics: z.array(z.string().trim().min(1).max(120)).max(3),
    approvedReferences: z.array(approvedReferenceSnapshotRefSchema).max(10),
} as const;

export const presentationBriefSchema = z
  .object({
    ...presentationBriefContentShape,
    briefId: coachingIdSchema,
    projectId: coachingIdSchema,
    revision: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine(validateBriefCollections);

export const putPresentationBriefRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    audience: z.enum(["novice", "practitioner", "decision-maker"]),
    purpose: z.enum(["inform", "persuade", "teach", "report"]),
    evaluatorLensRef: evaluatorLensRefSchema,
    targetDurationMinutes: z.number().int().min(1).max(120),
    desiredOutcome: z.string().trim().min(1).max(240),
    requirements: z.array(briefRequirementInputSchema).max(5),
    terminology: z.array(terminologyEntrySchema).max(10),
    challengeTopics: z.array(z.string().trim().min(1).max(120)).max(3),
    approvedReferenceFileIds: z.array(coachingIdSchema).max(10),
  })
  .strict()
  .superRefine((brief, context) => {
    validateBriefCollections(
      { ...brief, approvedReferences: [] },
      context,
      "approvedReferenceFileIds",
    );
  });

export const getPresentationBriefResponseSchema = z
  .object({ brief: presentationBriefSchema.nullable() })
  .strict();

export const putPresentationBriefResponseSchema = z
  .object({ brief: presentationBriefSchema })
  .strict();

function validateBriefCollections(
  brief: {
    requirements: Array<{ kind: string }>;
    challengeTopics: string[];
    approvedReferences?: Array<{ fileId: string }>;
    approvedReferenceFileIds?: string[];
  },
  context: z.RefinementCtx,
  referenceKey: "approvedReferences" | "approvedReferenceFileIds" =
    "approvedReferences",
) {
  if (brief.requirements.filter((requirement) => requirement.kind === "must-cover").length > 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "must-cover requirements are limited to three.",
      path: ["requirements"],
    });
  }

  const topics = brief.challengeTopics.map((topic) => topic.toLocaleLowerCase());
  if (new Set(topics).size !== topics.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "challenge topics must be unique.",
      path: ["challengeTopics"],
    });
  }

  const referenceIds = referenceKey === "approvedReferences"
    ? (brief.approvedReferences ?? []).map((reference) => reference.fileId)
    : brief.approvedReferenceFileIds ?? [];
  if (new Set(referenceIds).size !== referenceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "approved references must be unique.",
      path: [referenceKey],
    });
  }
}

export type PresentationBrief = z.infer<typeof presentationBriefSchema>;
export type PutPresentationBriefRequest = z.infer<
  typeof putPresentationBriefRequestSchema
>;
export type BriefRequirement = z.infer<typeof briefRequirementSchema>;
export type BriefRequirementInput = z.infer<typeof briefRequirementInputSchema>;
export type ApprovedReferenceSnapshotRef = z.infer<
  typeof approvedReferenceSnapshotRefSchema
>;
