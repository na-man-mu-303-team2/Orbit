import { describe, expect, it } from "vitest";

import { deckSchema } from "./deck.schema";
import { deckChangeRecordSchema, deckPatchSchema } from "./patch.schema";

type DeckValidationInput = {
  deckId: string;
  projectId: string;
  title: string;
  version: number;
  targetDurationMinutes?: number;
  metadata: {
    language: string;
    locale: string;
    sourceType?: string;
    generatedBy?: string;
    audience?: string;
    purpose?: string;
    tone?: string;
    createdFrom?: {
      topic: string;
      references: Array<{ fileId: string }>;
    };
  };
  canvas: {
    preset: string;
    width: number;
    height: number;
    aspectRatio: string;
  };
  slides: Array<{
    slideId: string;
    order: number;
    title: string;
    thumbnailUrl: string;
    estimatedSeconds?: number;
    style: Record<string, unknown>;
    speakerNotes: string;
    aiNotes?: {
      emphasisPoints: string[];
      sourceEvidence: Array<{
        fileId: string;
        quote?: string;
        note?: string;
        confidence: number;
      }>;
    };
    keywords: Array<{
      keywordId: string;
      text: string;
      synonyms: string[];
      abbreviations: string[];
      required?: boolean;
    }>;
    elements: Array<Record<string, unknown>>;
    animations: Array<{
      animationId: string;
      elementId: string;
      type: string;
      order: number;
      durationMs: number;
      delayMs: number;
      easing: string;
    }>;
    actions?: Array<{
      actionId: string;
      trigger:
        | {
            kind: "cue";
            cue: string;
          }
        | {
            kind: "keyword";
            keywordId: string;
          };
      effect:
        | {
            kind: "play-animation";
            animationId: string;
          }
        | {
            kind: "go-to-next-slide";
          };
    }>;
    speechCues?: Array<{
      cueId: string;
      trigger: {
        phrases: string[];
        scriptAnchor?: {
          start: number;
          end: number;
        };
      };
      action:
        | {
            type: "highlight";
            elementId: string;
          }
        | {
            type: "animation";
            animationId: string;
          }
        | {
            type: "advance-slide";
          };
      source: "ai" | "user";
      enabled?: boolean;
    }>;
  }>;
};

const createValidDeck = (): DeckValidationInput => ({
  deckId: "deck_test_1",
  projectId: "project_test_1",
  title: "Test Deck",
  version: 1,
  metadata: {
    language: "ko",
    locale: "ko-KR"
  },
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  slides: [
    {
      slideId: "slide_1",
      order: 1,
      title: "Intro",
      thumbnailUrl: "",
      style: {},
      speakerNotes: "",
      keywords: [
        {
          keywordId: "kw_1",
          text: "ORBIT",
          synonyms: [],
          abbreviations: []
        }
      ],
      elements: [
        {
          elementId: "el_1",
          type: "text",
          role: "title",
          x: 120,
          y: 80,
          width: 640,
          height: 120,
          rotation: 0,
          opacity: 1,
          zIndex: 0,
          locked: false,
          visible: true,
          props: {
            text: "ORBIT"
          }
        }
      ],
      animations: [
        {
          animationId: "anim_1",
          elementId: "el_1",
          type: "fade-in",
          order: 1,
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out"
        }
      ],
      actions: []
    }
  ]
});

const createValidPatch = () => ({
  deckId: "deck_test_1",
  baseVersion: 1,
  source: "user",
  operations: [
    {
      type: "update_deck",
      title: "Updated Deck"
    }
  ]
});

const createValidChangeRecord = () => ({
  changeId: "change_1",
  deckId: "deck_test_1",
  beforeVersion: 1,
  afterVersion: 2,
  source: "user",
  createdAt: "2026-06-27T01:00:00+09:00",
  operations: [
    {
      type: "update_deck",
      title: "Updated Deck"
    }
  ]
});

const expectValidDeck = (deck: unknown) => {
  expect(deckSchema.safeParse(deck).success).toBe(true);
};

const expectInvalidDeck = (deck: unknown) => {
  expect(deckSchema.safeParse(deck).success).toBe(false);
};

describe("deckSchema validation", () => {
  it("accepts a 1920x1080 wide-16-9 deck", () => {
    expectValidDeck(createValidDeck());
  });

  it("defaults deck targetDurationMinutes to the generation request default", () => {
    const deck = deckSchema.parse(createValidDeck());

    expect(deck.targetDurationMinutes).toBe(10);
  });

  it("defaults slide actions to an empty list", () => {
    const deck = createValidDeck();

    delete deck.slides[0].actions;

    const result = deckSchema.parse(deck);

    expect(result.slides[0].actions).toEqual([]);
  });

  it("defaults slide speech cues to an empty list", () => {
    const deck = createValidDeck();

    const result = deckSchema.parse(deck);

    expect(result.slides[0].speechCues).toEqual([]);
  });

  it("accepts explicit deck and slide presenter timing fields", () => {
    const deck = createValidDeck();

    deck.targetDurationMinutes = 20;
    deck.slides[0].estimatedSeconds = 90;

    const result = deckSchema.parse(deck);

    expect(result.targetDurationMinutes).toBe(20);
    expect(result.slides[0].estimatedSeconds).toBe(90);
  });

  it("accepts cue-driven slide actions", () => {
    const deck = createValidDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "강조"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      },
      {
        actionId: "act_2",
        trigger: {
          kind: "cue",
          cue: "다음"
        },
        effect: {
          kind: "go-to-next-slide"
        }
      }
    ];

    expectValidDeck(deck);
  });

  it("accepts slide speech cues and defaults enabled state", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "핵심 지표를 강조합니다. 다음 내용으로 넘어갑니다.";
    deck.slides[0].speechCues = [
      {
        cueId: "cue_highlight_1",
        trigger: {
          phrases: ["핵심 지표"],
          scriptAnchor: { start: 0, end: 5 }
        },
        action: {
          type: "highlight",
          elementId: "el_1"
        },
        source: "user"
      },
      {
        cueId: "cue_animation_1",
        trigger: {
          phrases: ["강조합니다"]
        },
        action: {
          type: "animation",
          animationId: "anim_1"
        },
        source: "ai",
        enabled: false
      },
      {
        cueId: "cue_advance_1",
        trigger: {
          phrases: ["넘어갑니다"]
        },
        action: {
          type: "advance-slide"
        },
        source: "user"
      }
    ];

    const result = deckSchema.parse(deck);

    expect(result.slides[0].speechCues[0].enabled).toBe(true);
    expect(result.slides[0].speechCues[1].enabled).toBe(false);
    expect(result.slides[0].speechCues[2].action).toEqual({
      type: "advance-slide"
    });
  });

  it("rejects invalid slide speech cue ids and empty phrases", () => {
    const invalidIdDeck = createValidDeck();
    invalidIdDeck.slides[0].speechCues = [
      {
        cueId: "bad_1",
        trigger: { phrases: ["강조"] },
        action: { type: "highlight", elementId: "el_1" },
        source: "user"
      }
    ];

    const emptyPhraseDeck = createValidDeck();
    emptyPhraseDeck.slides[0].speechCues = [
      {
        cueId: "cue_empty_1",
        trigger: { phrases: [] },
        action: { type: "highlight", elementId: "el_1" },
        source: "user"
      }
    ];

    expectInvalidDeck(invalidIdDeck);
    expectInvalidDeck(emptyPhraseDeck);
  });

  it("rejects duplicate slide speech cue ids", () => {
    const deck = createValidDeck();

    deck.slides[0].speechCues = [
      {
        cueId: "cue_duplicate_1",
        trigger: { phrases: ["강조"] },
        action: { type: "highlight", elementId: "el_1" },
        source: "user"
      },
      {
        cueId: "cue_duplicate_1",
        trigger: { phrases: ["다음"] },
        action: { type: "advance-slide" },
        source: "ai"
      }
    ];

    expectInvalidDeck(deck);
  });

  it("rejects slide speech cues with dangling element or animation targets", () => {
    const missingElementDeck = createValidDeck();
    missingElementDeck.slides[0].speechCues = [
      {
        cueId: "cue_missing_element_1",
        trigger: { phrases: ["강조"] },
        action: { type: "highlight", elementId: "el_missing" },
        source: "user"
      }
    ];

    const missingAnimationDeck = createValidDeck();
    missingAnimationDeck.slides[0].speechCues = [
      {
        cueId: "cue_missing_animation_1",
        trigger: { phrases: ["애니메이션"] },
        action: { type: "animation", animationId: "anim_missing" },
        source: "ai"
      }
    ];

    expectInvalidDeck(missingElementDeck);
    expectInvalidDeck(missingAnimationDeck);
  });

  it("rejects invalid slide speech cue script anchors", () => {
    const reversedAnchorDeck = createValidDeck();
    reversedAnchorDeck.slides[0].speakerNotes = "강조합니다.";
    reversedAnchorDeck.slides[0].speechCues = [
      {
        cueId: "cue_reversed_anchor_1",
        trigger: {
          phrases: ["강조"],
          scriptAnchor: { start: 4, end: 2 }
        },
        action: { type: "highlight", elementId: "el_1" },
        source: "user"
      }
    ];

    const outOfRangeAnchorDeck = createValidDeck();
    outOfRangeAnchorDeck.slides[0].speakerNotes = "강조합니다.";
    outOfRangeAnchorDeck.slides[0].speechCues = [
      {
        cueId: "cue_out_of_range_anchor_1",
        trigger: {
          phrases: ["강조"],
          scriptAnchor: { start: 0, end: 100 }
        },
        action: { type: "highlight", elementId: "el_1" },
        source: "user"
      }
    ];

    expectInvalidDeck(reversedAnchorDeck);
    expectInvalidDeck(outOfRangeAnchorDeck);
  });

  it("accepts keyword-triggered slide actions", () => {
    const deck = createValidDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword",
          keywordId: "kw_1"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectValidDeck(deck);
  });

  it("rejects slide actions that target missing animations", () => {
    const deck = createValidDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "cue",
          cue: "강조"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_missing"
        }
      }
    ];

    expectInvalidDeck(deck);
  });

  it("rejects keyword-triggered slide actions that target missing keywords", () => {
    const deck = createValidDeck();

    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword",
          keywordId: "kw_missing"
        },
        effect: {
          kind: "go-to-next-slide"
        }
      }
    ];

    expectInvalidDeck(deck);
  });

  it.each([0, -1, 1.5])(
    "rejects invalid slide estimatedSeconds value %s",
    (estimatedSeconds) => {
      const deck = createValidDeck();

      deck.slides[0].estimatedSeconds = estimatedSeconds;

      expectInvalidDeck(deck);
    }
  );

  it("accepts a 1024x768 standard-4-3 deck", () => {
    const deck = createValidDeck();

    deck.canvas = {
      preset: "standard-4-3",
      width: 1024,
      height: 768,
      aspectRatio: "4:3"
    };

    expectValidDeck(deck);
  });

  it.each([
    ["x", -1],
    ["y", -1],
    ["width", 0],
    ["height", 0]
  ])("rejects invalid element %s", (field, value) => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      [field]: value
    };

    expectInvalidDeck(deck);
  });

  it.each(["shape", "video", "unknown"])(
    "rejects unsupported object type %s",
    (type) => {
      const deck = createValidDeck();

      deck.slides[0].elements[0] = {
        ...deck.slides[0].elements[0],
        type,
        props: {}
      };

      expectInvalidDeck(deck);
    }
  );

  it.each(["area", "radar"])("rejects unsupported chart type %s", (type) => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "chart",
      props: {
        type,
        data: []
      }
    };

    expectInvalidDeck(deck);
  });

  it("accepts an empty supported chart", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "chart",
      props: {
        type: "bar",
        data: []
      }
    };

    expectValidDeck(deck);
  });

  it("accepts a custom shape with typed path editing props", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "customShape",
      props: {
        pathData:
          "M 20 20 L 200 20 L 200 100 L 92 100 L 48 148 L 56 100 L 20 100 Z",
        viewBoxWidth: 220,
        viewBoxHeight: 160,
        fill: "#f5edff",
        stroke: "#9333ea",
        strokeWidth: 2,
        closed: true,
        nodes: [
          { x: 20, y: 20, mode: "corner" },
          { x: 200, y: 20, mode: "corner" },
          { x: 200, y: 100, mode: "corner" },
          { x: 92, y: 100, mode: "corner" },
          { x: 48, y: 148, mode: "corner" },
          { x: 56, y: 100, mode: "corner" },
          { x: 20, y: 100, mode: "corner" }
        ]
      }
    };

    expectValidDeck(deck);
  });

  it("rejects a custom shape without pathData", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "customShape",
      props: {
        viewBoxWidth: 220,
        viewBoxHeight: 160,
        closed: true,
        nodes: []
      }
    };

    expectInvalidDeck(deck);
  });

  it("rejects negative radial chart values", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "chart",
      props: {
        type: "pie",
        data: [
          {
            label: "Loss",
            value: -1
          }
        ]
      }
    };

    expectInvalidDeck(deck);
  });

  it("rejects scatter chart data without x and y", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "chart",
      props: {
        type: "scatter",
        data: [
          {
            label: "Point",
            value: 10
          }
        ]
      }
    };

    expectInvalidDeck(deck);
  });

  it("rejects unsupported canvas preset", () => {
    const deck = createValidDeck();

    deck.canvas = {
      preset: "portrait-9-16",
      width: 1080,
      height: 1920,
      aspectRatio: "9:16"
    };

    expectInvalidDeck(deck);
  });

  it("rejects unsupported canvas size", () => {
    const deck = createValidDeck();

    deck.canvas = {
      preset: "wide-16-9",
      width: 1280,
      height: 720,
      aspectRatio: "16:9"
    };

    expectInvalidDeck(deck);
  });

  it("rejects mismatched canvas preset and aspect ratio", () => {
    const deck = createValidDeck();

    deck.canvas = {
      preset: "wide-16-9",
      width: 1920,
      height: 1080,
      aspectRatio: "4:3"
    };

    expectInvalidDeck(deck);
  });

  it("rejects unsupported metadata language", () => {
    const deck = createValidDeck();

    deck.metadata.language = "en";

    expectInvalidDeck(deck);
  });

  it("rejects unsupported metadata locale", () => {
    const deck = createValidDeck();

    deck.metadata.locale = "en-US";

    expectInvalidDeck(deck);
  });

  it("accepts AI metadata and slide notes on generated decks", () => {
    const deck = createValidDeck();

    deck.metadata = {
      ...deck.metadata,
      sourceType: "ai",
      generatedBy: "ai",
      audience: "technical",
      purpose: "inform",
      tone: "professional",
      createdFrom: {
        topic: "AI 발표 자동화",
        references: [{ fileId: "file_1" }]
      }
    };
    deck.slides[0].aiNotes = {
      emphasisPoints: ["근거 기반 메시지"],
      sourceEvidence: [
        {
          fileId: "file_1",
          quote: "reference",
          confidence: 0.8
        }
      ]
    };

    expectValidDeck(deck);
  });

  it("rejects empty and duplicate slide keyword terms", () => {
    const deck = createValidDeck();

    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: ["발표 도우미", ""],
        abbreviations: ["OD"]
      },
      {
        keywordId: "kw_2",
        text: "orbit",
        synonyms: ["발표 도우미"],
        abbreviations: ["od"]
      }
    ];

    expectInvalidDeck(deck);
  });

  it("rejects slide keyword terms duplicated across keyword types", () => {
    const deck = createValidDeck();

    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: ["발표 도우미"],
        abbreviations: ["OD"]
      },
      {
        keywordId: "kw_2",
        text: "리허설",
        synonyms: ["orbit"],
        abbreviations: []
      }
    ];

    expectInvalidDeck(deck);
  });

  it.each([
    ["deckId", "deckId"],
    ["slideId", "slides.0.slideId"],
    ["elementId", "slides.0.elements.0.elementId"],
    ["animationId", "slides.0.animations.0.animationId"],
    ["keywordId", "slides.0.keywords.0.keywordId"]
  ])("rejects invalid %s prefix", (_label, path) => {
    const deck = createValidDeck();

    if (path === "deckId") {
      deck.deckId = "bad_1";
    }

    if (path === "slides.0.slideId") {
      deck.slides[0].slideId = "bad_1";
    }

    if (path === "slides.0.elements.0.elementId") {
      deck.slides[0].elements[0].elementId = "bad_1";
    }

    if (path === "slides.0.animations.0.animationId") {
      deck.slides[0].animations[0].animationId = "bad_1";
    }

    if (path === "slides.0.keywords.0.keywordId") {
      deck.slides[0].keywords[0].keywordId = "bad_1";
    }

    expectInvalidDeck(deck);
  });

  it("rejects an empty slide list", () => {
    const deck = createValidDeck();

    deck.slides = [];

    expectInvalidDeck(deck);
  });

  it("rejects non-positive slide order", () => {
    const deck = createValidDeck();

    deck.slides[0].order = 0;

    expectInvalidDeck(deck);
  });

  it("rejects unsupported animation type", () => {
    const deck = createValidDeck();

    deck.slides[0].animations[0].type = "slide-in";

    expectInvalidDeck(deck);
  });

  it("rejects invalid element opacity", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0].opacity = 1.1;

    expectInvalidDeck(deck);
  });

  it("rejects invalid element zIndex", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0].zIndex = -1;

    expectInvalidDeck(deck);
  });
});

describe("deckPatchSchema validation", () => {
  it("accepts a valid deck patch", () => {
    expect(deckPatchSchema.safeParse(createValidPatch()).success).toBe(true);
  });

  it("rejects empty patch operations", () => {
    const patch = createValidPatch();

    patch.operations = [];

    expect(deckPatchSchema.safeParse(patch).success).toBe(false);
  });

  it("rejects unsupported patch source", () => {
    const patch = createValidPatch();

    patch.source = "assistant";

    expect(deckPatchSchema.safeParse(patch).success).toBe(false);
  });
});

describe("deckChangeRecordSchema validation", () => {
  it("accepts a valid deck change record", () => {
    expect(deckChangeRecordSchema.safeParse(createValidChangeRecord()).success).toBe(
      true
    );
  });

  it("rejects invalid changeId prefix", () => {
    const record = createValidChangeRecord();

    record.changeId = "bad_1";

    expect(deckChangeRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects afterVersion equal to beforeVersion", () => {
    const record = createValidChangeRecord();

    record.afterVersion = record.beforeVersion;

    expect(deckChangeRecordSchema.safeParse(record).success).toBe(false);
  });

  it("rejects afterVersion less than beforeVersion", () => {
    const record = createValidChangeRecord();

    record.afterVersion = record.beforeVersion - 1;

    expect(deckChangeRecordSchema.safeParse(record).success).toBe(false);
  });
});
