import { Deck, deckSchema, demoIds } from "@orbit/shared";

export function createDemoDeck(): Deck {
  return deckSchema.parse({
    deckId: demoIds.deckId,
    projectId: demoIds.projectId,
    title: "ORBIT Demo Deck",
    version: 1,
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "Opening",
        thumbnailUrl: "/files/thumbnails/slide_1.png",
        speakerNotes: "ORBIT 데모 흐름을 소개합니다.",
        keywords: [
          {
            keywordId: "kw_1",
            text: "ORBIT",
            synonyms: ["발표 도우미"],
            abbreviations: []
          }
        ],
        elements: [
          {
            elementId: "el_1",
            type: "text",
            x: 120,
            y: 96,
            width: 640,
            height: 120,
            props: {
              text: "ORBIT",
              fontSize: 56,
              color: "#111827"
            },
            animations: [
              {
                animationId: "anim_1",
                elementId: "el_1",
                type: "fade-in",
                order: 1
              }
            ]
          }
        ],
        animations: []
      }
    ]
  });
}

export function validateDeck(deck: unknown): Deck {
  return deckSchema.parse(deck);
}

export function nextDeckVersion(deck: Deck): Deck {
  return {
    ...deck,
    version: deck.version + 1
  };
}

