import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import {
  coachingIdSchema,
  focusedPracticeTargetScopeSchema,
} from "./coaching-common.schema";

export const rehearsalFocusKindSchema = z.enum([
  "opening",
  "closing",
  "timing",
  "semantic-coverage",
  "filler-words",
  "pauses",
  "custom",
]);

export const rehearsalFocusItemSchema = z
  .object({
    focusItemId: coachingIdSchema,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    kind: rehearsalFocusKindSchema,
    label: z.string().trim().min(1).max(160),
    targetScope: focusedPracticeTargetScopeSchema.nullable(),
  })
  .strict();

export const rehearsalFocusItemsSchema = z
  .array(rehearsalFocusItemSchema)
  .max(3)
  .superRefine((items, context) => {
    const ids = items.map((item) => item.focusItemId);
    const priorities = items.map((item) => item.priority);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rehearsal focus item IDs must be unique.",
      });
    }
    if (new Set(priorities).size !== priorities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rehearsal focus priorities must be unique.",
      });
    }
    items.forEach((item, index) => {
      if (item.priority !== index + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rehearsal focus priorities must be contiguous from one.",
          path: [index, "priority"],
        });
      }
    });
  });

export const rehearsalFocusProfileSchema = z
  .object({
    profileId: coachingIdSchema,
    projectId: coachingIdSchema,
    revision: z.number().int().positive(),
    items: rehearsalFocusItemsSchema,
    createdBy: coachingIdSchema,
    updatedBy: coachingIdSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const putRehearsalFocusProfileRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    items: rehearsalFocusItemsSchema,
  })
  .strict();

export const rehearsalFocusProfileRevisionConflictSchema = z
  .object({
    code: z.literal("REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT"),
    expectedRevision: z.number().int().nonnegative(),
    actualRevision: z.number().int().positive(),
    currentProfile: rehearsalFocusProfileSchema,
  })
  .strict();

export const frozenRehearsalFocusProfileRefSchema = z
  .object({
    profileId: coachingIdSchema,
    revision: z.number().int().positive(),
  })
  .strict();

export const rehearsalFocusProfileSnapshotSchema = z
  .object({
    profileRef: frozenRehearsalFocusProfileRefSchema,
    items: rehearsalFocusItemsSchema,
  })
  .strict();

export type RehearsalFocusKind = z.infer<typeof rehearsalFocusKindSchema>;
export type RehearsalFocusItem = z.infer<typeof rehearsalFocusItemSchema>;
export type RehearsalFocusProfile = z.infer<typeof rehearsalFocusProfileSchema>;
export type PutRehearsalFocusProfileRequest = z.infer<
  typeof putRehearsalFocusProfileRequestSchema
>;
export type RehearsalFocusProfileRevisionConflict = z.infer<
  typeof rehearsalFocusProfileRevisionConflictSchema
>;
export type RehearsalFocusProfileSnapshot = z.infer<
  typeof rehearsalFocusProfileSnapshotSchema
>;
