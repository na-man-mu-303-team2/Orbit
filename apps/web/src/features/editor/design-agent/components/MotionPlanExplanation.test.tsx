import { createDemoDeck } from "@orbit/editor-core";
import type { MotionPlanMetadata } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MotionPlanExplanation } from "./MotionPlanExplanation";

describe("MotionPlanExplanation", () => {
  it("shows AI provenance and a text-free semantic beat list", () => {
    const deck = createDemoDeck();
    const slide = {
      ...deck.slides[0]!,
      elements: deck.slides[0]!.elements.map((element, index) =>
        index === 0 && element.type === "text"
          ? {
              ...element,
              props: { ...element.props, text: "PRIVATE_SLIDE_TEXT" },
            }
          : element,
      ),
    };
    const [first, second, third] = slide.elements;
    const motionPlan: MotionPlanMetadata = {
      source: "llm",
      model: "gpt-4.1-mini-2025-04-14",
      attemptCount: 2,
      compilerVersion: "motion-compiler-v2",
      plan: {
        schemaVersion: 2,
        pattern: "hero-then-support",
        pacing: "balanced",
        beats: [
          {
            beatId: "beat_intro",
            purpose: "orient",
            trigger: "entry",
            relation: "together",
            targets: [
              { elementId: first!.elementId, motionIntent: "introduce" },
            ],
          },
          {
            beatId: "beat_reveal",
            purpose: "reveal",
            trigger: "click",
            relation: "together",
            targets: [
              { elementId: second!.elementId, motionIntent: "reveal" },
            ],
          },
          {
            beatId: "beat_focus",
            purpose: "emphasize",
            trigger: "click",
            relation: "together",
            targets: [
              { elementId: third!.elementId, motionIntent: "focus" },
            ],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <MotionPlanExplanation motionPlan={motionPlan} slide={slide} />,
    );

    expect(html).toContain("AI 분석");
    expect(html).toContain("핵심 후 근거 · 균형 잡힌 속도");
    expect(html).toContain("자동 진입 · 주제 소개");
    expect(html).toContain("클릭 1 · 정보 공개");
    expect(html).toContain("클릭 2 · 핵심 강조");
    expect(html).toContain("2회 시도 후");
    expect(html).not.toContain("PRIVATE_SLIDE_TEXT");
    expect(html).not.toContain("gpt-4.1-mini");
  });
});
