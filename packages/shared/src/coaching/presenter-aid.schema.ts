import { z } from "zod";

import { coachingIdSchema, criterionRefSchema } from "./coaching-common.schema";

export const presenterAidSchema = z
  .object({
    runId: coachingIdSchema,
    slideId: coachingIdSchema,
    remainingSeconds: z.number().int().nonnegative(),
    keywords: z.array(z.string().trim().min(1).max(80)).max(3),
    unresolvedIssue: z
      .object({
        criterionRef: criterionRefSchema,
        label: z.string().trim().min(1).max(160),
      })
      .strict()
      .nullable(),
    scriptVisible: z.literal(false),
  })
  .strict();

export type PresenterAid = z.infer<typeof presenterAidSchema>;
