import { z } from "zod";

import { themeColorSchema } from "./theme.schema";
import { deckPatchOperationSchema } from "./patch.schema";

export const slideRedesignPaletteSchema = z
  .object({
    dominant: themeColorSchema,
    surface: themeColorSchema,
    text: themeColorSchema,
    focal: themeColorSchema,
    secondary: themeColorSchema,
  })
  .strict();

export const slideRedesignPaletteOptionSchema = z
  .object({
    optionId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    isCurrentTheme: z.boolean(),
    palette: slideRedesignPaletteSchema,
    rationale: z.string().trim().max(500),
  })
  .strict();

export const slideRedesignPaletteOptionsSchema = z
  .array(slideRedesignPaletteOptionSchema)
  .length(3)
  .superRefine((options, ctx) => {
    if (!options[0]?.isCurrentTheme || options.slice(1).some((option) => option.isCurrentTheme)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "the first palette option must be the only current-theme option",
      });
    }
    if (new Set(options.map((option) => option.optionId)).size !== options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "palette optionId values must be unique",
      });
    }
  });

export type SlideRedesignPalette = z.infer<typeof slideRedesignPaletteSchema>;
export type SlideRedesignPaletteOption = z.infer<
  typeof slideRedesignPaletteOptionSchema
>;

export const slideRedesignOutcomeSchema = z.enum([
  "applicable",
  "fallback-allowed",
  "refused-unsafe",
]);

export const slideRedesignSlideTypeSchema = z.enum([
  "cover",
  "title",
  "problem",
  "solution",
  "feature-grid",
  "process",
  "architecture",
  "data",
  "chart",
  "comparison",
  "quote",
  "summary",
]);

export const slideRedesignSummarySchema = z
  .object({
    title: z.string(),
    message: z.string(),
    contentItems: z.array(
      z.object({ contentItemId: z.string().min(1), text: z.string() }).strict(),
    ),
    slideType: slideRedesignSlideTypeSchema,
    visualIntent: z.record(z.string(), z.unknown()),
    mediaIntent: z.object({ alt: z.string() }).strict(),
  })
  .strict();

export const slideRedesignElementConstraintsArtifactSchema = z
  .object({
    referencedElementIds: z.array(z.string()),
    lockedElementIds: z.array(z.string()),
    groupedElementIds: z.array(z.string()),
    ooxmlElementIds: z.array(z.string()),
  })
  .strict();

const slideRedesignStageResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(2_000),
    interpretedIntent: z
      .object({
        target: z.enum(["selected-elements", "current-slide"]),
        action: z.string().trim().min(1).max(1_000),
        alignment: z
          .enum([
            "canvas-left",
            "canvas-center",
            "canvas-right",
            "canvas-top",
            "canvas-bottom",
            "custom",
          ])
          .nullable(),
      })
      .strict(),
    operations: z.array(deckPatchOperationSchema).max(200),
    affectedElementIds: z.array(z.string()).max(200),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(20),
    paletteOptions: slideRedesignPaletteOptionsSchema.optional(),
    smartArtRequest: z.null().optional(),
    uiAction: z.null().optional(),
  })
  .strict();

export const slideRedesignInterpretArtifactSchema = z
  .object({
    stage: z.literal("interpret"),
    outcome: slideRedesignOutcomeSchema,
    reason: z.string().nullable().optional(),
    slideTypeSource: z.enum(["llm", "heuristic"]).nullable().optional(),
    summary: slideRedesignSummarySchema.nullable().optional(),
    provenance: z.record(z.string(), z.string()).default({}),
    constraints: slideRedesignElementConstraintsArtifactSchema.nullable().optional(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (
      artifact.outcome === "applicable" &&
      (!artifact.summary || !artifact.constraints || !artifact.slideTypeSource)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "applicable interpret artifact requires stage data",
      });
    }
  });

export const slideRedesignComposeArtifactSchema = z
  .object({
    stage: z.literal("compose"),
    outcome: slideRedesignOutcomeSchema,
    reason: z.string().nullable().optional(),
    response: slideRedesignStageResponseSchema.nullable().optional(),
    candidateCount: z.number().int().nonnegative().default(0),
    safeCandidateCount: z.number().int().nonnegative().default(0),
    chosenCompositionId: z.string().nullable().optional(),
    irreversibleCount: z.number().int().nonnegative().default(0),
    ornamentApplied: z.boolean().default(false),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (artifact.outcome === "applicable" && !artifact.response) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "applicable compose artifact requires response",
      });
    }
    if (artifact.safeCandidateCount > artifact.candidateCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "safeCandidateCount cannot exceed candidateCount",
      });
    }
  });

export const slideRedesignVerifyArtifactSchema = z
  .object({
    stage: z.literal("verify"),
    outcome: slideRedesignOutcomeSchema,
    reason: z.string().nullable().optional(),
    response: slideRedesignStageResponseSchema.nullable().optional(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (artifact.outcome === "applicable" && !artifact.response) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "applicable verify artifact requires response",
      });
    }
  });

export const slideRedesignStageArtifactSchema = z.union([
  slideRedesignInterpretArtifactSchema,
  slideRedesignComposeArtifactSchema,
  slideRedesignVerifyArtifactSchema,
]);

export type SlideRedesignInterpretArtifact = z.infer<
  typeof slideRedesignInterpretArtifactSchema
>;
export type SlideRedesignComposeArtifact = z.infer<
  typeof slideRedesignComposeArtifactSchema
>;
export type SlideRedesignVerifyArtifact = z.infer<
  typeof slideRedesignVerifyArtifactSchema
>;
