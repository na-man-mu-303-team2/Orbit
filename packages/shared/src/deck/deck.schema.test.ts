import { describe, expect, it } from "vitest";

import { deckSchema } from "./deck.schema";
import { createKeywordOccurrenceId } from "./keyword-occurrences";
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
    thumbnailSource?: string;
    generatedBy?: string;
    audience?: string;
    purpose?: string;
    tone?: string;
    createdFrom?: {
      topic: string;
      references: Array<{ fileId: string }>;
      designReferences?: Array<{ fileId: string }>;
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
          }
        | {
            kind: "keyword-occurrence";
            keywordId: string;
            occurrenceId: string;
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

  it("accepts keyword occurrence-triggered slide actions", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "ORBIT 다시 ORBIT";
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: "kwo_slide_1_kw_1_9_14"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectValidDeck(deck);
  });

  it("accepts keyword occurrence actions from case-insensitive speaker note matches", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "ai 흐름을 설명합니다.";
    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "AI",
        synonyms: [],
        abbreviations: []
      }
    ];
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: createKeywordOccurrenceId("slide_1", "kw_1", 0, 2)
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectValidDeck(deck);
  });

  it("accepts keyword occurrence actions from synonym and abbreviation matches", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "발표 도우미와 OBT를 소개합니다.";
    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: ["발표 도우미"],
        abbreviations: ["OBT"]
      }
    ];
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: createKeywordOccurrenceId("slide_1", "kw_1", 0, 6)
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      },
      {
        actionId: "act_2",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: createKeywordOccurrenceId("slide_1", "kw_1", 8, 11)
        },
        effect: {
          kind: "go-to-next-slide"
        }
      }
    ];

    expectValidDeck(deck);
  });

  it("rejects keyword occurrence-triggered slide actions that target missing keywords", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "ORBIT 다시 ORBIT";
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_missing",
          occurrenceId: "kwo_slide_1_kw_missing_9_14"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectInvalidDeck(deck);
  });

  it("rejects keyword occurrence-triggered slide actions that target missing occurrences", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "ORBIT 다시 ORBIT";
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: "kwo_slide_1_kw_1_20_25"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectInvalidDeck(deck);
  });

  it("rejects keyword occurrence-triggered slide actions with mismatched keyword IDs", () => {
    const deck = createValidDeck();

    deck.slides[0].speakerNotes = "ORBIT AI";
    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: [],
        abbreviations: []
      },
      {
        keywordId: "kw_2",
        text: "AI",
        synonyms: [],
        abbreviations: []
      }
    ];
    deck.slides[0].actions = [
      {
        actionId: "act_1",
        trigger: {
          kind: "keyword-occurrence",
          keywordId: "kw_1",
          occurrenceId: "kwo_slide_1_kw_2_6_8"
        },
        effect: {
          kind: "play-animation",
          animationId: "anim_1"
        }
      }
    ];

    expectInvalidDeck(deck);
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

  it("accepts image crop focus controls", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      elementId: "el_1",
      type: "image",
      role: "media",
      x: 120,
      y: 80,
      width: 640,
      height: 360,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        alt: "Hero",
        fit: "cover",
        focusX: 0.25,
        focusY: 0.75,
        src: "/hero.png"
      }
    };

    expectValidDeck(deck);
  });

  it("accepts editable SVG media elements", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      elementId: "el_1",
      type: "svg",
      role: "media",
      x: 120,
      y: 80,
      width: 320,
      height: 180,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
      locked: false,
      visible: true,
      props: {
        alt: "Vector logo",
        fit: "stretch",
        focusX: 0.5,
        focusY: 0.5,
        src: "/logo.svg"
      }
    };

    expectValidDeck(deck);
  });

  it("accepts editable pattern fill props", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "rect",
      role: "decoration",
      props: {
        fill: {
          type: "pattern",
          preset: "pct20",
          foreground: "#111827",
          background: "#F59E0B"
        },
        stroke: "transparent",
        strokeWidth: 0
      }
    };

    expectValidDeck(deck);
  });

  it("accepts high fidelity PPTX visual props", () => {
    const deck = createValidDeck();

    deck.slides[0].elements = [
      {
        elementId: "el_text",
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
          text: "Hello World",
          runs: [
            {
              text: "Hello ",
              fontFamily: "Aptos",
              fontSize: 36,
              fontWeight: "bold",
              color: "#111827"
            },
            {
              text: "World",
              fontFamily: "Aptos",
              fontSize: 36,
              fontWeight: "normal",
              color: "#2563eb"
            }
          ],
          paragraphs: [
            {
              text: "Hello World",
              runs: [
                {
                  text: "Hello ",
                  fontFamily: "Aptos",
                  fontSize: 36,
                  fontWeight: "bold",
                  color: "#111827"
                },
                {
                  text: "World",
                  fontFamily: "Aptos",
                  fontSize: 36,
                  fontWeight: "normal",
                  color: "#2563eb"
                }
              ],
              align: "left",
              lineHeight: 1.15,
              spaceBefore: 0,
              spaceAfter: 8,
              indent: 12
            }
          ],
          bodyInset: {
            left: 14,
            right: 14,
            top: 7,
            bottom: 7
          },
          writingMode: "vertical-270",
          bullet: {
            enabled: true,
            character: "\u2022",
            indent: 24
          }
        }
      },
      {
        elementId: "el_shape",
        type: "rect",
        role: "decoration",
        x: 80,
        y: 240,
        width: 400,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        locked: false,
        visible: true,
        props: {
          fill: {
            type: "linear-gradient",
            angle: 90,
            stops: [
              { offset: 0, color: "#2563eb", opacity: 1 },
              { offset: 1, color: "#7c3aed", opacity: 0.75 }
            ]
          },
          stroke: "#111827",
          strokeWidth: 2,
          dash: [8, 4],
          lineCap: "round",
          lineJoin: "round"
        }
      },
      {
        elementId: "el_image",
        type: "image",
        role: "media",
        x: 520,
        y: 240,
        width: 320,
        height: 180,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        locked: false,
        visible: true,
        props: {
          src: "/image.png",
          fit: "stretch",
          crop: {
            left: 0.1,
            top: 0.05,
            right: 0.2,
            bottom: 0.15
          }
        }
      }
    ];

    expectValidDeck(deck);
  });

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

  it("accepts an editable table element", () => {
    const deck = createValidDeck();

    deck.slides[0].elements[0] = {
      ...deck.slides[0].elements[0],
      type: "table",
      role: "table",
      props: {
        rows: [
          [
            { text: "A", fill: "#EFF6FF", borderColor: "#93C5FD" },
            { text: "B", fill: "#EFF6FF", borderColor: "#93C5FD" }
          ],
          [
            { text: "C", borderColor: "#CBD5E1" },
            { text: "D", borderColor: "#CBD5E1" }
          ]
        ],
        columnWidths: [240, 240],
        rowHeights: [80, 80],
        borderColor: "#CBD5E1",
        borderWidth: 1
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

  it("defaults AI metadata design references to an empty list", () => {
    const deck = createValidDeck();

    deck.metadata = {
      ...deck.metadata,
      sourceType: "ai",
      generatedBy: "ai",
      createdFrom: {
        topic: "AI design reference",
        references: []
      }
    };

    const result = deckSchema.parse(deck);

    expect(result.metadata.createdFrom?.designReferences).toEqual([]);
  });

  it("accepts imported deck thumbnail source metadata", () => {
    const deck = createValidDeck();

    deck.metadata = {
      ...deck.metadata,
      sourceType: "import",
      thumbnailSource: "import-render"
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

  it("rejects duplicate slide keyword IDs", () => {
    const deck = createValidDeck();

    deck.slides[0].keywords = [
      {
        keywordId: "kw_1",
        text: "ORBIT",
        synonyms: [],
        abbreviations: []
      },
      {
        keywordId: "kw_1",
        text: "리허설",
        synonyms: [],
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

  it("accepts deck metadata update patches", () => {
    const patch: unknown = {
      ...createValidPatch(),
      operations: [
        {
          metadata: {
            thumbnailSource: "canvas"
          },
          type: "update_deck"
        }
      ]
    };

    expect(deckPatchSchema.safeParse(patch).success).toBe(true);
  });

  it("rejects replace keyword patches with duplicate keyword IDs", () => {
    const patch: unknown = {
      ...createValidPatch(),
      operations: [
        {
          type: "replace_keywords",
          slideId: "slide_1",
          keywords: [
            {
              keywordId: "kw_1",
              text: "ORBIT",
              synonyms: [],
              abbreviations: []
            },
            {
              keywordId: "kw_1",
              text: "리허설",
              synonyms: [],
              abbreviations: []
            }
          ]
        }
      ]
    };

    expect(deckPatchSchema.safeParse(patch).success).toBe(false);
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
