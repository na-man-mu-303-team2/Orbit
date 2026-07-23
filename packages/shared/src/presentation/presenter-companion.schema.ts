import { z } from "zod";

import {
  activityDefinitionSchema,
  activityResultDefinitionSchema,
} from "../activity/activity-definition.schema";
import { animationSchema } from "../deck/animation.schema";
import {
  deckCanvasSchema,
  slideImportRenderModeSchema,
  slideKindSchema,
  slideOrderSchema,
  slideStyleSchema,
  slideTransitionSchema,
} from "../deck/deck.schema";
import { deckElementSchema } from "../deck/slide-object.schema";
import { deckIdSchema, deckSlideIdSchema } from "../deck/id.schema";
import { themeSchema } from "../deck/theme.schema";

const companionSlideBaseFields = {
  slideId: deckSlideIdSchema,
  kind: slideKindSchema,
  order: slideOrderSchema,
  thumbnailUrl: z.string().min(1).optional(),
  transition: slideTransitionSchema.optional(),
  style: slideStyleSchema,
  importRenderMode: slideImportRenderModeSchema.optional(),
  elements: z.array(deckElementSchema),
  animations: z.array(animationSchema),
};

export const companionContentSlideSchema = z
  .object({
    ...companionSlideBaseFields,
    kind: z.literal("content"),
  })
  .strict();

export const companionActivitySlideSchema = z
  .object({
    ...companionSlideBaseFields,
    kind: z.literal("activity"),
    activity: activityDefinitionSchema,
  })
  .strict();

export const companionActivityResultSlideSchema = z
  .object({
    ...companionSlideBaseFields,
    kind: z.literal("activity-results"),
    activityResult: activityResultDefinitionSchema,
  })
  .strict();

export const companionSlideSchema = z.discriminatedUnion("kind", [
  companionContentSlideSchema,
  companionActivitySlideSchema,
  companionActivityResultSlideSchema,
]);

export const companionDeckSnapshotSchema = z
  .object({
    deckId: deckIdSchema,
    projectId: z.string().min(1),
    version: z.number().int().positive(),
    canvas: deckCanvasSchema,
    theme: themeSchema,
    slides: z.array(companionSlideSchema).min(1),
  })
  .strict();

export type CompanionSlide = z.infer<typeof companionSlideSchema>;
export type CompanionDeckSnapshot = z.infer<
  typeof companionDeckSnapshotSchema
>;
