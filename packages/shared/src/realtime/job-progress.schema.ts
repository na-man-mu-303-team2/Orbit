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
  .strict();

export type SlideRedesignProgressEvent = z.infer<
  typeof slideRedesignProgressEventSchema
>;
