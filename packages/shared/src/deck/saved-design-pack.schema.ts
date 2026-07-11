import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { themeColorSchema } from "./theme.schema";

export const savedDesignPackIdSchema = z.string().trim().min(1);
export const savedDesignPackOwnerTypeSchema = z.enum([
  "system",
  "user",
  "organization"
]);

export const savedDesignPackPaletteSchema = z
  .object({
    primary: themeColorSchema.optional(),
    secondary: themeColorSchema.optional(),
    background: themeColorSchema.optional(),
    surface: themeColorSchema.optional(),
    muted: themeColorSchema.optional(),
    border: themeColorSchema.optional(),
    text: themeColorSchema.optional(),
    accentColor: themeColorSchema.optional()
  })
  .partial()
  .default({});

export const savedDesignPackTypographySchema = z
  .object({
    headingFontFamily: z.string().trim().min(1).optional(),
    bodyFontFamily: z.string().trim().min(1).optional(),
    fallbackFamily: z.string().trim().min(1).optional(),
    titleSizeScale: z.number().min(0.8).max(1.2).default(1),
    bodySizeScale: z.number().min(0.8).max(1.2).default(1),
    lineHeight: z.number().min(1.2).max(1.3).optional()
  })
  .default({});

export const savedDesignPackPreferencesSchema = z.object({
  palette: savedDesignPackPaletteSchema,
  typography: savedDesignPackTypographySchema,
  tone: z
    .enum(["professional", "friendly", "confident", "concise"])
    .default("professional"),
  density: z.enum(["low", "medium", "high"]).default("medium"),
  titleStyle: z
    .enum(["action", "conclusion", "descriptive"])
    .default("action"),
  layoutPreference: z
    .enum(["stable", "varied", "editorial", "technical"])
    .default("varied"),
  imageDensity: z.enum(["none", "low", "medium", "high"]).default("low"),
  mediaPolicy: z
    .enum([
      "avoid",
      "balanced",
      "placeholder-ok",
      "provided-only",
      "public-assets",
      "ai-generated",
      "minimal"
    ])
    .default("balanced"),
  referencePolicy: z
    .enum([
      "topic-only",
      "user-input-only",
      "references-first",
      "references-only",
      "research-first"
    ])
    .default("topic-only"),
  qaStrictness: z.enum(["standard", "strict"]).default("standard")
});

export const savedDesignPackSchema = z.object({
  id: savedDesignPackIdSchema,
  ownerType: savedDesignPackOwnerTypeSchema,
  ownerId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  version: z.number().int().positive(),
  baseStylePackId: z.string().trim().min(1),
  preferences: savedDesignPackPreferencesSchema,
  isDefault: z.boolean().default(false),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const savedDesignPackSelectionSchema = z.object({
  id: savedDesignPackIdSchema,
  version: z.number().int().positive()
});

export const savedDesignPackSnapshotSchema = z.object({
  id: savedDesignPackIdSchema.optional(),
  name: z.string().trim().min(1),
  version: z.number().int().positive(),
  baseStylePackId: z.string().trim().min(1),
  preferences: savedDesignPackPreferencesSchema
});

export const createSavedDesignPackRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  baseStylePackId: z.string().trim().min(1).default("brandlogy-modern"),
  preferences: savedDesignPackPreferencesSchema,
  isDefault: z.boolean().default(false)
});

export const updateSavedDesignPackRequestSchema = createSavedDesignPackRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const savedDesignPackListResponseSchema = z.object({
  packs: z.array(savedDesignPackSchema)
});

export const duplicateSavedDesignPackRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional()
});

export type SavedDesignPack = z.infer<typeof savedDesignPackSchema>;
export type SavedDesignPackOwnerType = z.infer<
  typeof savedDesignPackOwnerTypeSchema
>;
export type SavedDesignPackPreferences = z.infer<
  typeof savedDesignPackPreferencesSchema
>;
export type SavedDesignPackSelection = z.infer<
  typeof savedDesignPackSelectionSchema
>;
export type SavedDesignPackSnapshot = z.infer<
  typeof savedDesignPackSnapshotSchema
>;
export type CreateSavedDesignPackRequest = z.infer<
  typeof createSavedDesignPackRequestSchema
>;
export type UpdateSavedDesignPackRequest = z.infer<
  typeof updateSavedDesignPackRequestSchema
>;
