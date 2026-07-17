import {
  generateDeckJobResultSchema,
  generateDeckResponseSchema,
  slideSchema,
  type AiDeckGenerationStage,
} from "@orbit/shared";
import { z } from "zod";

export const aiDeckExecutionStageSchema = z.enum([
  "image-slide",
  "semantic-quality",
  "rendered-visual-quality",
  "publication",
]);
export type AiDeckExecutionStage = z.infer<typeof aiDeckExecutionStageSchema>;

export const imageSlideArtifactPayloadSchema = z
  .object({
    slide: slideSchema,
    warnings: z.array(z.string()),
  })
  .strict();

export const qualityArtifactPayloadSchema = z
  .object({
    workerPayload: generateDeckResponseSchema,
  })
  .strict();

export const publicationArtifactPayloadSchema = z
  .object({
    result: generateDeckJobResultSchema,
  })
  .strict();

export const executionArtifactPayloadSchemas: Record<
  AiDeckExecutionStage,
  z.ZodTypeAny
> = {
  "image-slide": imageSlideArtifactPayloadSchema,
  "semantic-quality": qualityArtifactPayloadSchema,
  "rendered-visual-quality": qualityArtifactPayloadSchema,
  publication: publicationArtifactPayloadSchema,
};
export type AiDeckExecutionArtifactPayload =
  | z.infer<typeof imageSlideArtifactPayloadSchema>
  | z.infer<typeof qualityArtifactPayloadSchema>
  | z.infer<typeof publicationArtifactPayloadSchema>;

export function isAiDeckExecutionStage(
  stage: AiDeckGenerationStage,
): stage is AiDeckExecutionStage {
  return executionStages.has(stage);
}

export function parseExecutionArtifactPayload(
  stage: AiDeckExecutionStage,
  payload: unknown,
): AiDeckExecutionArtifactPayload {
  return executionArtifactPayloadSchemas[stage].parse(
    payload,
  ) as AiDeckExecutionArtifactPayload;
}

const executionStages = new Set<AiDeckGenerationStage>([
  "image-slide",
  "semantic-quality",
  "rendered-visual-quality",
  "publication",
]);
