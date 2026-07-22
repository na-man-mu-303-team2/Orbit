import { z } from "zod";

import { themeColorSchema } from "./theme.schema";

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
