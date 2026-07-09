import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";
import { deckIdSchema, deckSlideIdSchema } from "../deck/id.schema";

export const E5_EMBEDDING_DIM = 384;
export const CONTEXT_MATCH_THRESHOLD = 0.8;

export const slideContextItemSchema = z.object({
  itemId: z.string().uuid(),
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  slideId: deckSlideIdSchema,
  itemOrder: z.number().int().nonnegative(),
  label: z.string().trim().min(1).max(200),
  sentence: z.string().trim().min(1).max(1000),
  hasEmbedding: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const slideContextItemWithEmbeddingSchema = slideContextItemSchema.extend({
  embedding: z.array(z.number()).length(E5_EMBEDDING_DIM)
});

export const extractSlideContextItemsRequestSchema = z.object({
  projectId: z.string().min(1),
  deckId: deckIdSchema,
  slides: z
    .array(
      z.object({
        slideId: deckSlideIdSchema,
        slideText: z.string(),
        speakerNotes: z.string()
      })
    )
    .min(1)
});

export const extractSlideContextItemsResponseSchema = z.object({
  items: z.array(slideContextItemSchema)
});

export const getSlideContextItemsResponseSchema = z.object({
  items: z.array(slideContextItemWithEmbeddingSchema)
});

export const listSlideContextItemsResponseSchema = z.object({
  items: z.array(slideContextItemSchema)
});

export const updateSlideContextItemRequestSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    sentence: z.string().trim().min(1).max(1000).optional()
  })
  .refine((data) => data.label !== undefined || data.sentence !== undefined, {
    message: "label 또는 sentence 중 하나 이상 필요합니다"
  });

export const updateSlideContextItemResponseSchema = z.object({
  item: slideContextItemSchema
});

export const deleteSlideContextItemResponseSchema = z.object({
  itemId: z.string().uuid()
});

export type SlideContextItem = z.infer<typeof slideContextItemSchema>;
export type SlideContextItemWithEmbedding = z.infer<
  typeof slideContextItemWithEmbeddingSchema
>;
export type ExtractSlideContextItemsRequest = z.infer<
  typeof extractSlideContextItemsRequestSchema
>;
export type ExtractSlideContextItemsResponse = z.infer<
  typeof extractSlideContextItemsResponseSchema
>;
export type GetSlideContextItemsResponse = z.infer<
  typeof getSlideContextItemsResponseSchema
>;
export type UpdateSlideContextItemRequest = z.infer<
  typeof updateSlideContextItemRequestSchema
>;
export type UpdateSlideContextItemResponse = z.infer<
  typeof updateSlideContextItemResponseSchema
>;
export type ListSlideContextItemsResponse = z.infer<
  typeof listSlideContextItemsResponseSchema
>;
