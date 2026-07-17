import { z } from "zod";

import { deckElementIdSchema } from "./id.schema";
import { deckElementRoleSchema, deckElementTypeSchema } from "./slide-object.schema";

export const smartArtLayoutTypeSchema = z.enum([
  "list",
  "process",
  "card_grid",
  "comparison",
  "classification_grid",
  "timeline",
  "metric_cards"
]);

export const smartArtItemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional()
});

export const smartArtRequestSchema = z.object({
  layoutType: smartArtLayoutTypeSchema,
  sourceElementIds: z.array(deckElementIdSchema).max(100).default([]),
  items: z.array(smartArtItemSchema).min(1).max(12)
});

export const smartArtElementTemplateTextFieldSchema = z.enum(["title", "description"]);

export const smartArtElementTemplateSchema = z.object({
  elementIdSuffix: z.string().trim().min(1),
  type: deckElementTypeSchema,
  itemIndex: z.number().int().min(0).nullable(),
  role: deckElementRoleSchema.optional(),
  xFrac: z.number().finite(),
  yFrac: z.number().finite(),
  widthFrac: z.number().finite().positive(),
  heightFrac: z.number().finite().positive(),
  rotation: z.number().finite().default(0),
  zIndex: z.number().int().nonnegative(),
  textField: smartArtElementTemplateTextFieldSchema.optional(),
  props: z.record(z.unknown()).default({})
});

export const smartArtLayoutSchema = z.object({
  layoutId: z.string().trim().min(1),
  layoutType: smartArtLayoutTypeSchema,
  name: z.string().trim().min(1),
  itemCountMin: z.number().int().positive(),
  itemCountMax: z.number().int().positive(),
  elements: z.array(smartArtElementTemplateSchema).min(1),
  sourceFile: z.string().trim().min(1).nullable().default(null),
  isActive: z.boolean().default(true)
});

export type SmartArtLayoutType = z.infer<typeof smartArtLayoutTypeSchema>;
export type SmartArtItem = z.infer<typeof smartArtItemSchema>;
export type SmartArtRequest = z.infer<typeof smartArtRequestSchema>;
export type SmartArtElementTemplateTextField = z.infer<
  typeof smartArtElementTemplateTextFieldSchema
>;
export type SmartArtElementTemplate = z.infer<typeof smartArtElementTemplateSchema>;
export type SmartArtLayout = z.infer<typeof smartArtLayoutSchema>;
