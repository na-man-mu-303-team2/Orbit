import {
  createActivityResultsSlide,
  createActivitySlide,
  createDemoDeck
} from "@orbit/editor-core";
import { deckSchema } from "@orbit/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ActivitySlideInspector,
  convertQuestionType,
  moveQuestion
} from "./ActivitySlideInspector";
import { ActivitySlidePreview } from "./ActivitySlidePreview";
import {
  ActivityResultSlideInspector,
  findActivityResultSource
} from "./ActivityResultSlideInspector";

describe("activity slide editor", () => {
  const slide = createActivitySlide(createDemoDeck(), "satisfaction");

  it("renders role-specific previews from the same activity definition", () => {
    const audience = renderToStaticMarkup(<ActivitySlidePreview role="audience" slide={slide} />);
    const presenter = renderToStaticMarkup(<ActivitySlidePreview role="presenter" slide={slide} />);

    expect(audience).toContain("청중 참여 장표 미리보기");
    expect(audience).toContain("응답 제출");
    expect(presenter).toContain("발표자 참여 장표 미리보기");
    expect(presenter).toContain("응답 0");
  });

  it("keeps generated response controls in a locked system layer", () => {
    const html = renderToStaticMarkup(
      <ActivitySlideInspector onChange={vi.fn()} slide={slide} />
    );

    expect(html).toContain("청중 화면");
    expect(html).toContain("발표자 화면");
    expect(html).toContain("잠긴 시스템 레이어");
    expect(html).toContain('data-activity-system-layer="locked"');
    expect(html).toContain('data-semantic-locked="false"');
  });

  it("converts and reorders satisfaction questions without changing their IDs", () => {
    const source = slide.activity.questions[0]!;
    const converted = convertQuestionType(slide.activity, source, "single-choice");
    expect(converted.questionId).toBe(source.questionId);
    expect(converted.type).toBe("single-choice");
    if (converted.type !== "single-choice") throw new Error("choice fixture");
    expect(converted.options).toHaveLength(2);

    const moved = moveQuestion(slide.activity.questions, 1, -1);
    expect(moved.map((question) => question.questionId)).toEqual([
      slide.activity.questions[1]!.questionId,
      slide.activity.questions[0]!.questionId
    ]);
  });

  it.each(["pre-question", "poll", "satisfaction"] as const)(
    "renders the %s template inspector",
    (template) => {
      const templateSlide = createActivitySlide(createDemoDeck(), template);
      const html = renderToStaticMarkup(
        <ActivitySlideInspector onChange={vi.fn()} slide={templateSlide} />
      );
      expect(html).toContain(templateSlide.activity.title);
    }
  );

  it("renders result source recovery without persisting a session or response", () => {
    const deck = deckSchema.parse({
      ...createDemoDeck(),
      slides: [...createDemoDeck().slides, slide]
    });
    const resultSlide = createActivityResultsSlide(
      deck,
      slide.activity.activityId
    );
    const completeDeck = deckSchema.parse({
      ...deck,
      slides: [...deck.slides, resultSlide]
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ActivityResultSlideInspector
          deck={completeDeck}
          projectId={completeDeck.projectId}
          slide={resultSlide}
          onChange={vi.fn()}
          onSelectSourceSlide={vi.fn()}
        />
      </QueryClientProvider>
    );

    expect(html).toContain("원본 장표로 이동");
    expect(html).toContain("세션 선택과 응답 데이터는 Deck에 저장되지 않습니다");
    expect(resultSlide.activityResult).toEqual({
      sourceActivityId: slide.activity.activityId,
      display: "live",
      layout: "summary"
    });
  });

  it("detects a deleted result source for recovery", () => {
    const deck = deckSchema.parse({
      ...createDemoDeck(),
      slides: [...createDemoDeck().slides, slide]
    });
    const resultSlide = createActivityResultsSlide(
      deck,
      slide.activity.activityId
    );
    const danglingDeck = deckSchema.parse({
      ...deck,
      slides: [...createDemoDeck().slides, resultSlide]
    });

    expect(
      findActivityResultSource(
        danglingDeck,
        resultSlide.activityResult.sourceActivityId
      )
    ).toBeNull();
  });
});
