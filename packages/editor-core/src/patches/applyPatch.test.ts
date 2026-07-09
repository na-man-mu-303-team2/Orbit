import { describe, expect, it } from "vitest";

import type {
  Deck,
  DeckElement,
  DeckPatch,
  DeckPatchOperation,
  Slide,
} from "@orbit/shared";

import { createDemoDeck } from "../index";
import { applyDeckPatch } from "./applyPatch";
import type { ApplyDeckPatchResult, ApplyDeckPatchSuccess } from "./deckPatch";

const fixedCreatedAt = "2026-06-27T01:00:00+09:00";

function createPatch(
  operations: DeckPatchOperation[],
  baseVersion = 1,
  deckId = "deck_demo_1",
): DeckPatch {
  return {
    deckId,
    baseVersion,
    source: "user",
    operations,
  };
}

function createSlide(slideId: string, order: number): Slide {
  return {
    slideId,
    order,
    title: `Slide ${order}`,
    thumbnailUrl: "",
    style: {},
    speakerNotes: "",
    elements: [],
    keywords: [],
    semanticCues: [],
    animations: [],
    actions: [],
  };
}

function createTextElement(elementId: string): DeckElement {
  return {
    elementId,
    type: "text",
    role: "body",
    x: 200,
    y: 160,
    width: 480,
    height: 96,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    props: {
      text: "New text",
      fontSize: 24,
      fontWeight: "normal",
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
    },
  };
}

function createPatchTestDeck(): Deck {
  const deck = createDemoDeck();
  const slide: Slide = {
    ...createSlide("slide_1", 1),
    title: "Opening",
    thumbnailUrl: "/files/thumbnails/slide_1.png",
    speakerNotes: "ORBIT 데모 흐름을 소개합니다.",
    keywords: [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: ["발표 도우미"],
        abbreviations: ["OBT"],
        required: true,
      },
    ],
    elements: [createTextElement("el_1")],
    animations: [
      {
        animationId: "anim_1",
        elementId: "el_1",
        type: "fade-in",
        order: 1,
        durationMs: 400,
        delayMs: 0,
        easing: "ease-out",
      },
    ],
    actions: [],
  };

  return {
    ...deck,
    slides: [slide],
  };
}

function createDeckWithSecondSlide(): Deck {
  const deck = createPatchTestDeck();

  deck.slides.push(createSlide("slide_2", 2));

  return deck;
}

function expectPatchSuccess(
  result: ApplyDeckPatchResult,
): ApplyDeckPatchSuccess {
  if (!result.ok) {
    throw new Error(result.error.code);
  }

  return result;
}

function applyPatchOrFail(deck: Deck, patch: DeckPatch): ApplyDeckPatchSuccess {
  return expectPatchSuccess(
    applyDeckPatch(deck, patch, {
      changeId: `change_${patch.deckId}_${patch.baseVersion + 1}`,
      createdAt: fixedCreatedAt,
    }),
  );
}

describe("applyDeckPatch", () => {
  it("applies update_deck and returns version metadata with change record", () => {
    const deck = createPatchTestDeck();
    const result = applyPatchOrFail(
      deck,
      createPatch([
        {
          type: "update_deck",
          title: "Updated Deck",
        },
      ]),
    );

    expect(result.deck.title).toBe("Updated Deck");
    expect(result.deck.version).toBe(2);
    expect(result.metadata).toEqual({
      deckId: deck.deckId,
      baseVersion: 1,
      nextVersion: 2,
    });
    expect(result.changeRecord).toMatchObject({
      changeId: "change_deck_demo_1_2",
      deckId: deck.deckId,
      beforeVersion: 1,
      afterVersion: 2,
      source: "user",
      createdAt: fixedCreatedAt,
    });
    expect(deck.title).toBe("ORBIT Demo Deck");
  });

  it("applies update_deck metadata patch", () => {
    const deck = createPatchTestDeck();
    deck.metadata.sourceType = "import";
    deck.metadata.thumbnailSource = "import-render";

    const result = applyPatchOrFail(
      deck,
      createPatch([
        {
          metadata: {
            thumbnailSource: "canvas",
          },
          type: "update_deck",
        },
      ]),
    );

    expect(result.deck.metadata.thumbnailSource).toBe("canvas");
    expect(result.deck.metadata.sourceType).toBe("import");
    expect(result.deck.title).toBe(deck.title);
  });

  it("adds a slide and keeps slides sorted by order", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "add_slide",
          slide: createSlide("slide_2", 2),
        },
      ]),
    );

    expect(result.deck.slides.map((slide) => slide.slideId)).toEqual([
      "slide_1",
      "slide_2",
    ]);
  });

  it("updates slide title and thumbnailUrl", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_slide",
          slideId: "slide_1",
          title: "Opening Updated",
          thumbnailUrl: "/files/thumbnails/updated.png",
        },
      ]),
    );

    expect(result.deck.slides[0].title).toBe("Opening Updated");
    expect(result.deck.slides[0].thumbnailUrl).toBe(
      "/files/thumbnails/updated.png",
    );
  });

  it("deletes a slide", () => {
    const result = applyPatchOrFail(
      createDeckWithSecondSlide(),
      createPatch([
        {
          type: "delete_slide",
          slideId: "slide_2",
        },
      ]),
    );

    expect(result.deck.slides.map((slide) => slide.slideId)).toEqual([
      "slide_1",
    ]);
  });

  it("reorders slides", () => {
    const result = applyPatchOrFail(
      createDeckWithSecondSlide(),
      createPatch([
        {
          type: "reorder_slides",
          slideOrders: [
            {
              slideId: "slide_2",
              order: 1,
            },
            {
              slideId: "slide_1",
              order: 2,
            },
          ],
        },
      ]),
    );

    expect(result.deck.slides.map((slide) => slide.slideId)).toEqual([
      "slide_2",
      "slide_1",
    ]);
  });

  it("adds an element", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "add_element",
          slideId: "slide_1",
          element: createTextElement("el_2"),
        },
      ]),
    );

    expect(
      result.deck.slides[0].elements.map((element) => element.elementId),
    ).toEqual(["el_1", "el_2"]);
  });

  it("updates element frame fields", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_element_frame",
          slideId: "slide_1",
          elementId: "el_1",
          frame: {
            x: 320,
            y: 240,
            width: 720,
            height: 180,
            zIndex: 3,
            locked: true,
            role: "highlight",
          },
        },
      ]),
    );
    const element = result.deck.slides[0].elements[0];

    expect(element).toMatchObject({
      x: 320,
      y: 240,
      width: 720,
      height: 180,
      zIndex: 3,
      locked: true,
      role: "highlight",
    });
  });

  it("updates element props", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_1",
          props: {
            text: "Changed text",
            fontSize: 64,
          },
        },
      ]),
    );
    const element = result.deck.slides[0].elements[0];

    expect(element.type).toBe("text");

    if (element.type === "text") {
      expect(element.props.text).toBe("Changed text");
      expect(element.props.fontSize).toBe(64);
    }
  });

  it("deletes an element and removes animations and actions targeting it", () => {
    const deck = createPatchTestDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "강조",
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1",
        },
      },
    ];

    const result = applyPatchOrFail(
      deck,
      createPatch([
        {
          type: "delete_element",
          slideId: "slide_1",
          elementId: "el_1",
        },
      ]),
    );

    expect(result.deck.slides[0].elements).toEqual([]);
    expect(result.deck.slides[0].animations).toEqual([]);
    expect(result.deck.slides[0].actions).toEqual([]);
  });

  it("applies theme, slide style, notes, animation, and slide action operations", () => {
    const result = applyPatchOrFail(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_theme",
          theme: {
            accentColor: "#ff0000",
            typography: {
              bodySize: 30,
            },
          },
        },
        {
          type: "update_slide_style",
          slideId: "slide_1",
          style: {
            layout: "quote",
            backgroundColor: "#f3f4f6",
          },
        },
        {
          type: "update_speaker_notes",
          slideId: "slide_1",
          speakerNotes: "Updated notes",
        },
        {
          type: "replace_keywords",
          slideId: "slide_1",
          keywords: [
            {
              keywordId: "kw_2",
              text: "패치",
              synonyms: [],
              abbreviations: [],
              required: true,
            },
          ],
        },
        {
          type: "add_animation",
          slideId: "slide_1",
          animation: {
            animationId: "anim_2",
            elementId: "el_1",
            type: "appear",
            order: 2,
            durationMs: 300,
            delayMs: 0,
            easing: "ease-out",
          },
        },
        {
          type: "update_animation",
          slideId: "slide_1",
          animationId: "anim_1",
          animation: {
            durationMs: 1000,
          },
        },
        {
          type: "delete_animation",
          slideId: "slide_1",
          animationId: "anim_2",
        },
        {
          type: "add_slide_action",
          slideId: "slide_1",
          action: {
            actionId: "act_1",
            trigger: {
              kind: "cue",
              cue: "강조",
            },
            effect: {
              kind: "play-animation",
              animationId: "anim_1",
            },
          },
        },
        {
          type: "update_slide_action",
          slideId: "slide_1",
          actionId: "act_1",
          action: {
            trigger: {
              kind: "cue",
              cue: "다음",
            },
            effect: {
              kind: "go-to-next-slide",
            },
          },
        },
      ]),
    );
    const slide = result.deck.slides[0];

    expect(result.deck.theme.accentColor).toBe("#ff0000");
    expect(result.deck.theme.typography.bodySize).toBe(30);
    expect(slide.style.layout).toBe("quote");
    expect(slide.style.backgroundColor).toBe("#f3f4f6");
    expect(slide.speakerNotes).toBe("Updated notes");
    expect(slide.keywords).toEqual([
      {
        keywordId: "kw_2",
        text: "패치",
        synonyms: [],
        abbreviations: [],
        required: true,
      },
    ]);
    expect(slide.animations).toHaveLength(1);
    expect(slide.animations[0].durationMs).toBe(1000);
    expect(slide.actions).toEqual([
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "다음",
        },
        effect: {
          kind: "go-to-next-slide",
        },
      },
    ]);
  });

  it("deletes slide actions that target a deleted animation", () => {
    const deck = createPatchTestDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "강조",
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1",
        },
      },
    ];

    const result = applyPatchOrFail(
      deck,
      createPatch([
        {
          type: "delete_animation",
          slideId: "slide_1",
          animationId: "anim_1",
        },
      ]),
    );

    expect(result.deck.slides[0].animations).toEqual([]);
    expect(result.deck.slides[0].actions).toEqual([]);
  });

  it("deletes keyword-triggered slide actions when the keyword is removed", () => {
    const deck = createPatchTestDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword",
          keywordId: "kw_1",
        },
        effect: {
          kind: "go-to-next-slide",
        },
      },
    ];

    const result = applyPatchOrFail(
      deck,
      createPatch([
        {
          type: "replace_keywords",
          slideId: "slide_1",
          keywords: [],
        },
      ]),
    );

    expect(result.deck.slides[0].keywords).toEqual([]);
    expect(result.deck.slides[0].actions).toEqual([]);
  });

  it("fails when deckId does not match", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch(
        [
          {
            type: "update_deck",
            title: "Updated Deck",
          },
        ],
        1,
        "deck_other_1",
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DECK_ID_MISMATCH",
      },
    });
  });

  it("fails when patch payload validation fails", () => {
    const result = applyDeckPatch(createDemoDeck(), {
      deckId: "deck_demo_1",
      baseVersion: 1,
      source: "user",
      operations: [],
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "PATCH_VALIDATION_FAILED",
      },
    });
  });

  it("fails when baseVersion does not match current deck version", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch(
        [
          {
            type: "update_deck",
            title: "Updated Deck",
          },
        ],
        2,
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "BASE_VERSION_MISMATCH",
      },
    });
  });

  it("fails when target slide does not exist", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_slide",
          slideId: "slide_missing",
          title: "Missing",
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SLIDE_NOT_FOUND",
      },
    });
  });

  it("fails when target element does not exist", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch([
        {
          type: "update_element_props",
          slideId: "slide_1",
          elementId: "el_missing",
          props: {
            text: "Missing",
          },
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "ELEMENT_NOT_FOUND",
      },
    });
  });

  it("fails when a slide action targets a missing animation", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch([
        {
          type: "add_slide_action",
          slideId: "slide_1",
          action: {
            actionId: "act_1",
            trigger: {
              kind: "cue",
              cue: "강조",
            },
            effect: {
              kind: "play-animation",
              animationId: "anim_missing",
            },
          },
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "SLIDE_ACTION_ANIMATION_NOT_FOUND",
      },
    });
  });

  it("fails when the patched deck violates DeckSchema", () => {
    const result = applyDeckPatch(
      createPatchTestDeck(),
      createPatch([
        {
          type: "delete_slide",
          slideId: "slide_1",
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "DECK_VALIDATION_FAILED",
      },
    });
  });
});
