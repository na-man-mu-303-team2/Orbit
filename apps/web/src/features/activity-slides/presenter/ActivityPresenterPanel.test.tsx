import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import type { ActivityPresenterResult } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityPresenterResults,
  getActivityPrimaryCommand
} from "./ActivityPresenterPanel";

describe("ActivityPresenterPanel", () => {
  it("maps every runtime state to one primary presenter command", () => {
    expect(getActivityPrimaryCommand("draft")).toEqual({
      label: "응답 열기",
      nextStatus: "open"
    });
    expect(getActivityPrimaryCommand("open")).toEqual({
      label: "응답 마감",
      nextStatus: "closed"
    });
    expect(getActivityPrimaryCommand("closed")).toEqual({
      label: "결과 공개",
      nextStatus: "results"
    });
    expect(getActivityPrimaryCommand("results")).toEqual({
      label: "결과 숨기기",
      nextStatus: "closed"
    });
  });

  it("renders poll distribution and presenter-only question text", () => {
    const slide = createActivitySlide(createDemoDeck(), "poll");
    const question = slide.activity.questions[0]!;
    if (question.type !== "single-choice") throw new Error("poll fixture");
    const result: ActivityPresenterResult = {
      activityRunId: "activity_run_1",
      activityId: slide.activity.activityId,
      status: "closed",
      revision: 3,
      responseCount: 2,
      aggregates: [{
        questionId: question.questionId,
        type: question.type,
        responseCount: 2,
        average: null,
        choices: question.options.map((option, index) => ({
          optionId: option.optionId,
          count: index === 0 ? 2 : 0,
          ratio: index === 0 ? 1 : 0
        }))
      }],
      textEntries: [{
        entryId: "activity_text_1",
        questionId: question.questionId,
        text: "PRESENTER_TEXT_SENTINEL",
        displayName: "익명 발표자",
        moderationStatus: "pending",
        answeredAt: null,
        updatedAt: "2026-07-17T00:00:00.000Z"
      }]
    };
    const html = renderToStaticMarkup(<ActivityPresenterResults result={result} slide={slide} />);
    expect(html).toContain("100%");
    expect(html).toContain("PRESENTER_TEXT_SENTINEL");
  });

  it("renders keyboard-operable moderation controls for 50 text fixtures", () => {
    const slide = createActivitySlide(createDemoDeck(), "pre-question");
    const result: ActivityPresenterResult = {
      activityRunId: "activity_run_1",
      activityId: slide.activity.activityId,
      status: "open",
      revision: 50,
      responseCount: 50,
      aggregates: [],
      textEntries: Array.from({ length: 50 }, (_, index) => ({
        entryId: `activity_text_${index + 1}`,
        questionId: slide.activity.questions[0]!.questionId,
        text: `질문 ${index + 1}`,
        displayName: null,
        moderationStatus: "pending" as const,
        answeredAt: null,
        updatedAt: "2026-07-17T00:00:00.000Z"
      }))
    };
    const html = renderToStaticMarkup(
      <ActivityPresenterResults onModerate={() => undefined} result={result} slide={slide} />
    );
    expect((html.match(/<button/g) ?? [])).toHaveLength(150);
    expect(html).toContain("질문 50");
  });
});
