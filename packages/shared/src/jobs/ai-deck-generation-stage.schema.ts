import { z } from "zod";

export const aiDeckGenerationStageSchema = z.enum([
  "reference-extract-file",
  "source-grounding",
  "content-planning",
  "design-planning",
  "layout-compile",
  "image-slide",
  "semantic-quality",
  "rendered-visual-quality",
  "publication",
]);

export const aiDeckGenerationStageStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

const transportIdSegmentSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim() === value, {
    message: "Transport ID segments cannot have surrounding whitespace",
  })
  .refine((value) => !value.includes(":"), {
    message: "Transport ID segments cannot contain colons",
  });

const shardKeySchema = z
  .string()
  .refine((value) => value.trim() === value, {
    message: "shardKey cannot have surrounding whitespace",
  })
  .refine((value) => !value.includes(":"), {
    message: "shardKey cannot contain colons",
  });

const fanOutStages = new Set<AiDeckGenerationStage>([
  "reference-extract-file",
  "image-slide",
]);

export const aiDeckGenerationStageMessageSchema = z
  .object({
    pipelineJobId: transportIdSegmentSchema,
    projectId: z.string().trim().min(1),
    stage: aiDeckGenerationStageSchema,
    shardKey: shardKeySchema,
  })
  .strict()
  .superRefine((message, context) => {
    const isFanOut = fanOutStages.has(message.stage);
    if (isFanOut && message.shardKey.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shardKey"],
        message: `${message.stage} requires a non-empty shardKey`,
      });
    }
    if (!isFanOut && message.shardKey !== "") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shardKey"],
        message: `${message.stage} requires an empty shardKey`,
      });
    }
  });

export type AiDeckGenerationStage = z.infer<
  typeof aiDeckGenerationStageSchema
>;
export type AiDeckGenerationStageStatus = z.infer<
  typeof aiDeckGenerationStageStatusSchema
>;
export type AiDeckGenerationStageMessage = z.infer<
  typeof aiDeckGenerationStageMessageSchema
>;
