import { z } from "zod";

import { deckActionIdSchema, deckAnimationIdSchema } from "./id.schema";

export const slideActionCueSchema = z.string().trim().min(1);

export const slideActionTriggerSchema = z.object({
  kind: z.literal("cue"),
  cue: slideActionCueSchema
});

export const playAnimationActionEffectSchema = z.object({
  kind: z.literal("play-animation"),
  animationId: deckAnimationIdSchema
});

export const goToNextSlideActionEffectSchema = z.object({
  kind: z.literal("go-to-next-slide")
});

export const slideActionEffectSchema = z.discriminatedUnion("kind", [
  playAnimationActionEffectSchema,
  goToNextSlideActionEffectSchema
]);

export const slideActionSchema = z.object({
  actionId: deckActionIdSchema,
  trigger: slideActionTriggerSchema,
  effect: slideActionEffectSchema
});

export const slideActionPatchSchema = z
  .object({
    trigger: slideActionTriggerSchema.optional(),
    effect: slideActionEffectSchema.optional()
  })
  .refine(
    (value) => value.trigger !== undefined || value.effect !== undefined,
    {
      message: "slide action patch must update at least one field"
    }
  );

export type SlideActionCue = z.infer<typeof slideActionCueSchema>;
export type DeckSlideActionTrigger = z.infer<typeof slideActionTriggerSchema>;
export type PlayAnimationActionEffect = z.infer<
  typeof playAnimationActionEffectSchema
>;
export type GoToNextSlideActionEffect = z.infer<
  typeof goToNextSlideActionEffectSchema
>;
export type DeckSlideActionEffect = z.infer<typeof slideActionEffectSchema>;
export type DeckSlideAction = z.infer<typeof slideActionSchema>;
export type DeckSlideActionPatch = z.infer<typeof slideActionPatchSchema>;
