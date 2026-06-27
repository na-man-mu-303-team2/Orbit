import { z } from "zod";

const createPrefixedIdSchema = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}[A-Za-z0-9_-]+$`));

export const deckIdSchema = createPrefixedIdSchema("deck_");
export const deckSlideIdSchema = createPrefixedIdSchema("slide_");
export const deckElementIdSchema = createPrefixedIdSchema("el_");
export const deckAnimationIdSchema = createPrefixedIdSchema("anim_");
export const deckKeywordIdSchema = createPrefixedIdSchema("kw_");
export const deckChangeIdSchema = createPrefixedIdSchema("change_");

export type DeckId = z.infer<typeof deckIdSchema>;
export type DeckSlideId = z.infer<typeof deckSlideIdSchema>;
export type DeckElementId = z.infer<typeof deckElementIdSchema>;
export type DeckAnimationId = z.infer<typeof deckAnimationIdSchema>;
export type DeckKeywordId = z.infer<typeof deckKeywordIdSchema>;
export type DeckChangeId = z.infer<typeof deckChangeIdSchema>;
