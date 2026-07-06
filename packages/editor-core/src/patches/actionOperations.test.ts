import { describe, expect, it } from "vitest";

import type { Deck } from "@orbit/shared";
import { createDemoDeck } from "../index";
import {
  createAddAnimationWithKeywordTriggerPatch,
  createKeyword,
  createReplaceKeywordsPatch,
  createSlideActionId,
  createUpdateAnimationKeywordTriggerPatch,
  createUpsertAdvanceSlideKeywordActionPatch,
  deriveKeywordUsage,
  findKeywordByTerm,
  getAnimationTriggerAction
} from "./actionOperations";
import { createDefaultAnimation } from "./animationOperations";

describe("action operations", () => {
  it("creates a batched patch for animation authoring with a keyword trigger", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const animation = createDefaultAnimation(deck, slide, "el_1");

    expect(
      createAddAnimationWithKeywordTriggerPatch(
        deck,
        slide.slideId,
        animation,
        "kw_1"
      )
    ).toMatchObject({
      operations: [
        {
          type: "add_animation",
          slideId: slide.slideId,
          animation
        },
        {
          type: "add_slide_action",
          slideId: slide.slideId,
          action: {
            trigger: {
              kind: "keyword",
              keywordId: "kw_1"
            },
            effect: {
              kind: "play-animation",
              animationId: animation.animationId
            }
          }
        }
      ]
    });
  });

  it("updates an existing animation trigger action to a keyword trigger", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      actions: [
        {
          actionId: "act_9",
          trigger: {
            kind: "cue",
            cue: "강조"
          },
          effect: {
            kind: "play-animation" as const,
            animationId: "anim_1"
          }
        }
      ]
    } satisfies Deck["slides"][number];

    expect(
      createUpdateAnimationKeywordTriggerPatch(
        {
          ...deck,
          slides: [slide, ...deck.slides.slice(1)]
        },
        slide.slideId,
        "anim_1",
        "kw_1"
      )
    ).toMatchObject({
      operations: [
        {
          type: "update_slide_action",
          actionId: "act_9",
          action: {
            trigger: {
              kind: "keyword",
              keywordId: "kw_1"
            }
          }
        }
      ]
    });
  });

  it("upserts and deletes next-slide keyword actions", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;
    const addPatch = createUpsertAdvanceSlideKeywordActionPatch(
      deck,
      slide.slideId,
      "kw_1",
      true
    );

    expect(addPatch).toMatchObject({
      operations: [
        {
          type: "add_slide_action",
          slideId: slide.slideId,
          action: {
            trigger: {
              kind: "keyword",
              keywordId: "kw_1"
            },
            effect: {
              kind: "go-to-next-slide"
            }
          }
        }
      ]
    });

    const deckWithAction = {
      ...deck,
      slides: [
        {
          ...slide,
          actions: [
            {
              actionId: "act_1",
              trigger: {
                kind: "keyword" as const,
                keywordId: "kw_1"
              },
              effect: {
                kind: "go-to-next-slide" as const
              }
            }
          ]
        },
        ...deck.slides.slice(1)
      ]
    };

    expect(
      createUpsertAdvanceSlideKeywordActionPatch(
        deckWithAction,
        slide.slideId,
        "kw_1",
        false
      )
    ).toMatchObject({
      operations: [
        {
          type: "delete_slide_action",
          slideId: slide.slideId,
          actionId: "act_1"
        }
      ]
    });
  });

  it("derives keyword usage from keyword-triggered slide actions", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      actions: [
        {
          actionId: "act_1",
          trigger: {
            kind: "keyword",
            keywordId: "kw_1"
          },
          effect: {
            kind: "play-animation" as const,
            animationId: "anim_1"
          }
        },
        {
          actionId: "act_2",
          trigger: {
            kind: "keyword",
            keywordId: "kw_1"
          },
          effect: {
            kind: "go-to-next-slide" as const
          }
        }
      ]
    } satisfies Deck["slides"][number];

    expect(deriveKeywordUsage(slide)).toMatchObject({
      kw_1: {
        keywordId: "kw_1",
        animationIds: ["anim_1"],
        advancesSlide: true
      }
    });
  });

  it("finds keywords by text, synonym, and abbreviation", () => {
    const deck = createDemoDeck();
    const slide = deck.slides[0]!;

    expect(findKeywordByTerm(slide, "orbit")?.keywordId).toBe("kw_1");
    expect(findKeywordByTerm(slide, "발표 도우미")?.keywordId).toBe("kw_1");
    expect(findKeywordByTerm(slide, "obt")?.keywordId).toBe("kw_1");
  });

  it("creates new keyword and action ids without colliding", () => {
    const deck = createDemoDeck();

    expect(createSlideActionId(deck)).toBe("act_1");
    expect(createKeyword(deck, "새 키워드", { required: false })).toMatchObject({
      keywordId: "kw_4",
      text: "새 키워드",
      required: false
    });
  });

  it("returns the preferred trigger action for an animation", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      actions: [
        {
          actionId: "act_1",
          trigger: {
            kind: "cue",
            cue: "강조"
          },
          effect: {
            kind: "play-animation" as const,
            animationId: "anim_1"
          }
        },
        {
          actionId: "act_2",
          trigger: {
            kind: "keyword",
            keywordId: "kw_1"
          },
          effect: {
            kind: "play-animation" as const,
            animationId: "anim_1"
          }
        }
      ]
    } satisfies Deck["slides"][number];

    expect(getAnimationTriggerAction(slide, "anim_1")?.actionId).toBe("act_2");
  });

  it("creates replace_keywords patches with persisted keyword defaults", () => {
    const deck = createDemoDeck();
    const keyword = createKeyword(deck, "새 단어");

    expect(
      createReplaceKeywordsPatch(deck, deck.slides[0]!.slideId, [
        ...deck.slides[0]!.keywords,
        keyword
      ])
    ).toMatchObject({
      operations: [
        {
          type: "replace_keywords",
          keywords: expect.arrayContaining([
            expect.objectContaining({
              keywordId: keyword.keywordId,
              required: true
            })
          ])
        }
      ]
    });
  });
});
