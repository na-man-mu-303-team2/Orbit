import { z } from "zod";

import { liveSttEngineSchema } from "./runtime";

export const runtimeConfigResponseSchema = z
  .object({
    liveSttEngine: liveSttEngineSchema
  })
  .strict();

export type RuntimeConfigResponse = z.infer<typeof runtimeConfigResponseSchema>;
