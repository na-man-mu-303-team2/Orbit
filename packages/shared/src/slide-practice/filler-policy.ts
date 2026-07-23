import { z } from "zod";

import rawPolicy from "./filler-policy.ko.v1.json";

export const fillerPolicySchema = z.object({
  version: z.literal(1),
  language: z.literal("ko"),
  tokens: z.array(z.string().trim().min(1).max(30)).min(1).max(100),
  phrases: z.array(z.string().trim().min(1).max(50)).max(100),
}).strict();

export const koreanFillerPolicyV1 = fillerPolicySchema.parse(rawPolicy);

export type FillerPolicy = z.infer<typeof fillerPolicySchema>;
