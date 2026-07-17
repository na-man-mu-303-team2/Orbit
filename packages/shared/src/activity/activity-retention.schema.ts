import { z } from "zod";

import { activityPresenterResultSchema } from "./activity-results.schema";

export const activityResponseRetentionJobPayloadSchema = z
  .object({
    jobId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
    presentationSessionId: z.string().trim().min(1),
  })
  .strict();

export const activityResponseRetentionJobResultSchema = z
  .object({
    presentationSessionId: z.string().trim().min(1),
    outcome: z.enum([
      "retained-aggregate",
      "already-retained",
      "owner-deleted",
      "session-missing",
    ]),
    snapshotCount: z.number().int().nonnegative(),
    deletedResponseCount: z.number().int().nonnegative(),
  })
  .strict();

export const activityRetentionSnapshotSchema = activityPresenterResultSchema.superRefine(
  (snapshot, ctx) => {
    if (snapshot.textEntries.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["textEntries"],
        message: "retention snapshots cannot contain free-text entries",
      });
    }
  },
);

export type ActivityResponseRetentionJobPayload = z.infer<
  typeof activityResponseRetentionJobPayloadSchema
>;
export type ActivityResponseRetentionJobResult = z.infer<
  typeof activityResponseRetentionJobResultSchema
>;
