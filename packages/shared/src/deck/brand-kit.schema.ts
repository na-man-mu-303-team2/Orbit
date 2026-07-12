import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { themeColorSchema } from "./theme.schema";

export const brandKitIdSchema = z.string().trim().min(1);
export const brandKitLockedFieldSchema = z.enum([
  "palette",
  "typography",
  "tone",
  "mediaPolicy",
  "logo",
  "cover",
  "footer"
]);

export const brandKitPaletteSchema = z.object({
  primary: themeColorSchema,
  secondary: themeColorSchema,
  background: themeColorSchema,
  surface: themeColorSchema,
  muted: themeColorSchema,
  border: themeColorSchema,
  text: themeColorSchema,
  accentColor: themeColorSchema
});

export const brandKitTypographySchema = z.object({
  headingFontFamily: z.string().trim().min(1),
  bodyFontFamily: z.string().trim().min(1),
  fallbackFamily: z.string().trim().min(1).default("Arial")
});

export const brandKitValuesSchema = z.object({
  logoAssetId: z.string().trim().min(1).optional(),
  palette: brandKitPaletteSchema,
  forbiddenColors: z.array(themeColorSchema).default([]),
  typography: brandKitTypographySchema,
  tone: z
    .enum(["professional", "friendly", "confident", "concise"])
    .default("professional"),
  mediaPolicy: z
    .enum([
      "avoid",
      "balanced",
      "placeholder-ok",
      "provided-only",
      "public-assets",
      "ai-generated",
      "hybrid",
      "minimal"
    ])
    .default("balanced"),
  writingStyle: z.string().trim().max(500).default(""),
  coverRules: z.string().trim().max(500).default(""),
  footerRules: z.string().trim().max(500).default(""),
  approvedAssetIds: z.array(z.string().trim().min(1)).default([]),
  lockedFields: z.array(brandKitLockedFieldSchema).default([])
});

export const brandKitSchema = z.object({
  id: brandKitIdSchema,
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  version: z.number().int().positive(),
  values: brandKitValuesSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const brandKitSelectionSchema = z.object({
  id: brandKitIdSchema,
  version: z.number().int().positive()
});

export const brandKitSnapshotSchema = z.object({
  id: brandKitIdSchema,
  organizationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  version: z.number().int().positive(),
  values: brandKitValuesSchema
});

export const createBrandKitRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  values: brandKitValuesSchema
});

export const updateBrandKitRequestSchema = createBrandKitRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided"
  });

export const brandKitListResponseSchema = z.object({
  brandKits: z.array(brandKitSchema)
});

export type BrandKit = z.infer<typeof brandKitSchema>;
export type BrandKitValues = z.infer<typeof brandKitValuesSchema>;
export type BrandKitSnapshot = z.infer<typeof brandKitSnapshotSchema>;
export type BrandKitLockedField = z.infer<typeof brandKitLockedFieldSchema>;
