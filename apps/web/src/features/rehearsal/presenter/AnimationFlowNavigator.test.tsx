import { describe, expect, it } from "vitest";
import { p0AnimationDeck } from "./__fixtures__/animationDeck";
import { createAnimationFlowModel } from "./AnimationFlowNavigator";

describe("AnimationFlowNavigator", () => {
  it("builds slide and trigger labels from the slideshow animation plan", () => {
    const deck = {
      ...p0AnimationDeck,
      slides: p0AnimationDeck.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              keywords: [
                {
                  abbreviations: [],
                  keywordId: "kw_flow",
                  required: true,
                  synonyms: [],
                  text: "탐색",
                },
              ],
              actions: [
                {
                  actionId: "act_flow_keyword",
                  trigger: {
                    kind: "keyword-occurrence" as const,
                    keywordId: "kw_flow",
                    occurrenceId: "kwo_slide_p0_1_kw_flow_0_2",
                  },
                  effect: {
                    kind: "play-animation" as const,
                    animationId: "anim_image_zoom_in",
                  },
                },
                {
                  actionId: "act_flow_click",
                  trigger: {
                    kind: "cue" as const,
                    cue: "다음",
                  },
                  effect: {
                    kind: "play-animation" as const,
                    animationId: "anim_chart_zoom_out",
                  },
                },
              ],
            }
          : slide,
      ),
    };
    const model = createAnimationFlowModel(deck);

    expect(model).toHaveLength(p0AnimationDeck.slides.length);
    expect(model[0]).toMatchObject({
      slideIndex: 0,
      title: deck.slides[0]?.title,
    });
    expect(model[0]?.entryEffectsLabel).toContain("나타나기");
    expect(model[0]?.steps.map((step) => step.stepIndex)).toEqual([1, 2]);
    expect(model[0]?.steps[0]).toMatchObject({
      effectsLabel: expect.stringContaining("확대"),
      triggerLabel: expect.stringContaining("발화"),
    });
  });
});
