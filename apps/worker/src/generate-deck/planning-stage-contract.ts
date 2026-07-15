import type { AiDeckGenerationStage } from "@orbit/shared";
import { z } from "zod";

export const aiDeckPlanningStageSchema = z.enum([
  "source-grounding",
  "content-planning",
  "design-planning",
  "layout-compile",
]);

const jsonObjectSchema = z.record(z.unknown());

export const sourceGroundingArtifactPayloadSchema = z
  .object({
    rawInput: jsonObjectSchema,
    sourceRecords: z.array(jsonObjectSchema),
    warnings: z.array(z.string()),
    webSourceCount: z.number().int().nonnegative(),
  })
  .strict();

export const contentPlanningArtifactPayloadSchema = z
  .object({
    rawInput: jsonObjectSchema,
    contentPlan: jsonObjectSchema,
  })
  .strict();

export const designPlanningArtifactPayloadSchema = z
  .object({ designPlan: jsonObjectSchema })
  .strict();

export const layoutCompileArtifactPayloadSchema = z
  .object({
    layoutResult: jsonObjectSchema,
    visualRequirements: jsonObjectSchema,
  })
  .strict();

export const planningArtifactPayloadSchemas = {
  "source-grounding": sourceGroundingArtifactPayloadSchema,
  "content-planning": contentPlanningArtifactPayloadSchema,
  "design-planning": designPlanningArtifactPayloadSchema,
  "layout-compile": layoutCompileArtifactPayloadSchema,
} as const;

export type AiDeckPlanningStage = keyof typeof planningArtifactPayloadSchemas;
export type SourceGroundingArtifactPayload = z.infer<
  typeof sourceGroundingArtifactPayloadSchema
>;
export type ContentPlanningArtifactPayload = z.infer<
  typeof contentPlanningArtifactPayloadSchema
>;
export type DesignPlanningArtifactPayload = z.infer<
  typeof designPlanningArtifactPayloadSchema
>;
export type LayoutCompileArtifactPayload = z.infer<
  typeof layoutCompileArtifactPayloadSchema
>;
export type AiDeckPlanningArtifactPayload =
  | SourceGroundingArtifactPayload
  | ContentPlanningArtifactPayload
  | DesignPlanningArtifactPayload
  | LayoutCompileArtifactPayload;

export function isAiDeckPlanningStage(
  stage: AiDeckGenerationStage,
): stage is AiDeckPlanningStage {
  return planningStages.has(stage);
}

export function parsePlanningArtifactPayload(
  stage: AiDeckPlanningStage,
  payload: unknown,
): AiDeckPlanningArtifactPayload {
  return planningArtifactPayloadSchemas[stage].parse(payload);
}

const planningStages = new Set<AiDeckGenerationStage>([
  "source-grounding",
  "content-planning",
  "design-planning",
  "layout-compile",
]);
