import { describe, expect, it } from "vitest";

import { companionDeckSnapshotSchema } from "./presenter-companion.schema";

const safeSnapshot = {
  deckId: "deck_companion_1",
  projectId: "project_companion_1",
  version: 3,
  canvas: {
    preset: "wide-16-9" as const,
    width: 1920 as const,
    height: 1080 as const,
    aspectRatio: "16:9" as const,
  },
  theme: {},
  slides: [
    {
      slideId: "slide_companion_1",
      kind: "content" as const,
      order: 1,
      style: {},
      elements: [
        {
          elementId: "el_companion_1",
          type: "image" as const,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          props: {
            src: "/api/v1/presentation-companion/session_1/assets/file_1/content",
          },
        },
      ],
      animations: [],
    },
  ],
};

describe("companionDeckSnapshotSchema", () => {
  it("accepts only audience rendering fields", () => {
    const snapshot = companionDeckSnapshotSchema.parse(safeSnapshot);

    expect(snapshot).toMatchObject({
      deckId: "deck_companion_1",
      projectId: "project_companion_1",
      version: 3,
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /speakerNotes|keywords|semanticCues|actions|aiNotes|metadata/,
    );
  });

  it.each([
    ["speakerNotes", "PRIVATE_SPEAKER_NOTES"],
    ["keywords", ["PRIVATE_KEYWORD"]],
    ["semanticCues", ["PRIVATE_SEMANTIC_CUE"]],
    ["actions", ["PRIVATE_ACTION"]],
    ["aiNotes", { emphasisPoints: ["PRIVATE_AI_NOTE"] }],
  ])("rejects the private slide field %s", (field, value) => {
    expect(
      companionDeckSnapshotSchema.safeParse({
        ...safeSnapshot,
        slides: [{ ...safeSnapshot.slides[0], [field]: value }],
      }).success,
    ).toBe(false);
  });

  it("rejects Deck metadata and generation provenance", () => {
    expect(
      companionDeckSnapshotSchema.safeParse({
        ...safeSnapshot,
        metadata: {
          createdFrom: { topic: "PRIVATE_GENERATION_PROMPT" },
        },
      }).success,
    ).toBe(false);
  });
});
