import { describe, expect, it } from "vitest";

import { buildAnimationKeywordTriggerPolicy } from "./keywordTriggerPolicy";

describe("buildAnimationKeywordTriggerPolicy", () => {
  it("allows keyword trigger animations on a single text element", () => {
    const policy = buildAnimationKeywordTriggerPolicy({
      element: {
        elementId: "el_text",
        type: "text",
        role: "body",
        x: 120,
        y: 180,
        width: 320,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        locked: false,
        visible: true,
        props: {
          text: "GitHub Projects",
          fontSize: 28,
          fontWeight: "bold",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      },
      keywordId: "keyword_1",
      slideAnimations: [],
      usageByKeywordId: {}
    });

    expect(policy.restrictionMessage).toBeNull();
    expect(policy.warningMessage).toBeNull();
    expect(policy.stepCount).toBe(0);
  });

  it("allows reusing the same keyword across multiple animation steps without warning", () => {
    const policy = buildAnimationKeywordTriggerPolicy({
      element: {
        elementId: "el_text",
        type: "text",
        role: "body",
        x: 120,
        y: 180,
        width: 320,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        locked: false,
        visible: true,
        props: {
          text: "Issue",
          fontSize: 28,
          fontWeight: "bold",
          align: "left",
          verticalAlign: "top",
          lineHeight: 1.2
        }
      },
      keywordId: "keyword_1",
      slideAnimations: [
        {
          animationId: "anim_1",
          elementId: "el_other",
          order: 1,
          type: "fade-in",
          durationMs: 400,
          delayMs: 0,
          easing: "ease-out"
        }
      ],
      usageByKeywordId: {
        keyword_1: {
          animationIds: ["anim_1"]
        }
      }
    });

    expect(policy.restrictionMessage).toBeNull();
    expect(policy.warningMessage).toBeNull();
    expect(policy.stepCount).toBe(1);
  });
});
