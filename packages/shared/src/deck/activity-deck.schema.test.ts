import { describe, expect, it } from "vitest";

import { deckSchema } from "./deck.schema";
import { deckPatchSchema } from "./patch.schema";

const wideCanvas = {
  preset: "wide-16-9" as const,
  width: 1920 as const,
  height: 1080 as const,
  aspectRatio: "16:9" as const
};

function slideBase(slideId: string, order: number) {
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
    actions: []
  };
}

function activityDefinition(activityId = "activity_1") {
  return {
    activityId,
    template: "satisfaction" as const,
    title: "만족도",
    description: "",
    questions: [
      {
        questionId: "question_1",
        type: "rating" as const,
        prompt: "발표가 유익했나요?",
        required: true,
        leftLabel: "아니요",
        rightLabel: "그래요"
      }
    ],
    allowDisplayName: false,
    hideResultsUntilReveal: true
  };
}

function deckWith(slides: unknown[], canvas: unknown = wideCanvas) {
  return {
    deckId: "deck_activity_1",
    projectId: "project_1",
    title: "Activity Deck",
    version: 1,
    canvas,
    slides
  };
}

describe("Activity slide Deck contract", () => {
  it("normalizes legacy slides without kind to content", () => {
    const deck = deckSchema.parse(deckWith([slideBase("slide_1", 1)]));

    expect(deck.slides[0]?.kind).toBe("content");
  });

  it("accepts an Activity slide only on a 16:9 Deck", () => {
    const activitySlide = {
      ...slideBase("slide_1", 1),
      kind: "activity",
      activity: activityDefinition()
    };
    const standardCanvas = {
      preset: "standard-4-3",
      width: 1024,
      height: 768,
      aspectRatio: "4:3"
    };

    expect(deckSchema.safeParse(deckWith([activitySlide])).success).toBe(true);
    expect(
      deckSchema.safeParse(deckWith([activitySlide], standardCanvas)).success
    ).toBe(false);
  });

  it("rejects duplicate Activity IDs", () => {
    const result = deckSchema.safeParse(
      deckWith([
        {
          ...slideBase("slide_1", 1),
          kind: "activity",
          activity: activityDefinition("activity_same")
        },
        {
          ...slideBase("slide_2", 2),
          kind: "activity",
          activity: activityDefinition("activity_same")
        }
      ])
    );

    expect(result.success).toBe(false);
  });

  it("allows a dangling result source for visible recovery", () => {
    const result = deckSchema.safeParse(
      deckWith([
        {
          ...slideBase("slide_1", 1),
          kind: "activity-results",
          activityResult: {
            sourceActivityId: "activity_missing",
            display: "live",
            layout: "summary"
          }
        }
      ])
    );

    expect(result.success).toBe(true);
  });

  it("rejects runtime data stored on Activity slides", () => {
    const result = deckSchema.safeParse(
      deckWith([
        {
          ...slideBase("slide_1", 1),
          kind: "activity",
          activity: activityDefinition(),
          responseCount: 12
        }
      ])
    );

    expect(result.success).toBe(false);
  });

  it("parses dedicated Activity definition patch operations", () => {
    expect(
      deckPatchSchema.safeParse({
        deckId: "deck_activity_1",
        baseVersion: 1,
        operations: [
          {
            type: "update_activity_definition",
            slideId: "slide_1",
            activity: activityDefinition()
          }
        ]
      }).success
    ).toBe(true);
  });
});
