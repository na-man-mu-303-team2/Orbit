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

  it("describes v3 card units as complete semantic composites", () => {
    const deck = createDemoDeck();
    const sourceSlide = deck.slides[0]!;
    const title = sourceSlide.elements[0]!;
    const sourceText = sourceSlide.elements[1]!;
    const background = {
      ...sourceSlide.elements[2]!,
      role: "decoration" as const,
    };
    const number = {
      ...sourceText,
      elementId: "el_card_number",
      role: "highlight" as const,
    };
    const body = {
      ...sourceText,
      elementId: "el_card_body",
      role: "body" as const,
    };
    const conclusion = {
      ...sourceText,
      elementId: "el_conclusion",
      role: "highlight" as const,
    };
    const slide = {
      ...sourceSlide,
      elements: [title, background, number, body, conclusion],
    };
    const motionPlan: MotionPlanMetadata = {
      source: "llm",
      model: "gpt-4.1-mini-2025-04-14",
      attemptCount: 1,
      compilerVersion: "motion-compiler-v3",
      units: [
        {
          unitId: "motion_unit_title",
          kind: "element",
          animationElementIds: [title.elementId],
          memberElementIds: [title.elementId],
          semanticRole: "title",
          readingOrder: 1,
        },
        {
          unitId: "motion_unit_card",
          kind: "spatial-cluster",
          animationElementIds: [
            background.elementId,
            number.elementId,
            body.elementId,
          ],
          memberElementIds: [
            background.elementId,
            number.elementId,
            body.elementId,
          ],
          semanticRole: "card",
          readingOrder: 2,
        },
        {
          unitId: "motion_unit_conclusion",
          kind: "element",
          animationElementIds: [conclusion.elementId],
          memberElementIds: [conclusion.elementId],
          semanticRole: "focal",
          readingOrder: 3,
        },
      ],
      plan: {
        schemaVersion: 3,
        pattern: "stepwise-process",
        pacing: "deliberate",
        beats: [
          {
            beatId: "beat_entry",
            purpose: "orient",
            trigger: "entry",
            relation: "together",
            targets: [
              {
                unitId: "motion_unit_title",
                motionIntent: "introduce",
              },
            ],
          },
          {
            beatId: "beat_click_1",
            purpose: "conclude",
            trigger: "click",
            relation: "sequence",
            targets: [
              {
                unitId: "motion_unit_card",
                motionIntent: "reveal",
              },
              {
                unitId: "motion_unit_conclusion",
                motionIntent: "conclude",
              },
            ],
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <MotionPlanExplanation motionPlan={motionPlan} slide={slide} />,
    );

    expect(html).toContain("단계별 전개 · 차분한 속도");
    expect(html).toContain("자동 진입 1 · 클릭 1 · 모션 단위 3개 · 요소 5개");
    expect(html).toContain("1단계 카드 전체 · 배경+번호+본문");
    expect(html).toContain("결론 문구 전체 · 텍스트");
    expect(html).toContain("→");
  });
});
