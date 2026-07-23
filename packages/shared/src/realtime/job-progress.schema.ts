import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { slideRedesignProgressPayloadSchema } from "../deck/slide-redesign-job.schema";

const jobProgressEnvelopeShape = {
  roomId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  userId: z.literal("system"),
  sentAt: isoDateTimeSchema,
};

export const slideRedesignProgressEventSchema = z
  .object({
    ...jobProgressEnvelopeShape,
    payload: slideRedesignProgressPayloadSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.roomId !== event.payload.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roomId"],
        message: "roomId must match payload.projectId",
      });
    }
    if (event.sessionId !== event.payload.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessionId"],
        message: "sessionId must match payload.sessionId",
      });
    }
  });

export const slideRedesignProgressChannel =
  "orbit:realtime:slide-redesign-progress";

export type SlideRedesignProgressEvent = z.infer<
  typeof slideRedesignProgressEventSchema
>;
