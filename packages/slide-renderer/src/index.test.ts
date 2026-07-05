import { describe, expect, it } from "vitest";
import { deckSchema } from "@orbit/shared";
import { renderSlideSnapshot } from "./index";

const deck = deckSchema.parse({
  deckId: "deck_1",
  projectId: "project_1",
  title: "Demo",
  version: 1,
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
  },
  slides: [
    {
      slideId: "slide_1",
      order: 1,
      title: "공개 슬라이드",
      speakerNotes: "private presenter script",
      style: {},
      elements: [
        {
          elementId: "el_1",
          type: "text",
          x: 100,
          y: 200,
          width: 800,
          height: 120,
          props: { text: "청중에게 보이는 문장" },
        },
      ],
    },
  ],
});

describe("renderSlideSnapshot", () => {
  it("renders a deterministic audience-safe SVG snapshot", () => {
    const snapshot = renderSlideSnapshot({
      deck,
      slideId: "slide_1",
      effectState: { stepIndex: 2, triggerAnimationIds: ["anim_1"] },
    });

    expect(snapshot.contentType).toBe("image/svg+xml");
    expect(snapshot.body).toContain("공개 슬라이드");
    expect(snapshot.body).toContain("청중에게 보이는 문장");
    expect(snapshot.body).toContain("step 2");
    expect(snapshot.body).not.toContain("speakerNotes");
    expect(snapshot.body).not.toContain("private presenter script");
    expect(snapshot.contentHash).toHaveLength(64);
  });
});
