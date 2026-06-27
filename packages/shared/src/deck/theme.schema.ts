import { z } from "zod";

export const themeColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const themeSchema = z.object({
  name: z.string().min(1).default("Default"),
  fontFamily: z.string().min(1).default("Inter"),
  backgroundColor: themeColorSchema.default("#ffffff"),
  textColor: themeColorSchema.default("#111827"),
  accentColor: themeColorSchema.default("#2563eb")
});

export type DeckTheme = z.infer<typeof themeSchema>;
