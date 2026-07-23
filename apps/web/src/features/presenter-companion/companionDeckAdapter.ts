import {
  deckSchema,
  type CompanionDeckSnapshot,
  type Deck,
} from "@orbit/shared";

export function materializeCompanionDeck(
  snapshot: CompanionDeckSnapshot,
): Deck {
  return deckSchema.parse({
    deckId: snapshot.deckId,
    projectId: snapshot.projectId,
    title: "발표 자료",
    version: snapshot.version,
    metadata: {},
    targetDurationMinutes: 10,
    canvas: snapshot.canvas,
    theme: snapshot.theme,
    slides: snapshot.slides.map((slide) => ({
      ...slide,
      title: "",
      speakerNotes: "",
      keywords: [],
      semanticCues: [],
      actions: [],
    })),
  });
}
