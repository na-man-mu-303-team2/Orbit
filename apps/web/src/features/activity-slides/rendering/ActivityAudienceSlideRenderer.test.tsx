import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import type { ActivityPublicResult } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityAudienceSlideRenderer,
  canonicalActivityUrl
} from "./ActivityAudienceSlideRenderer";

const slide = {
  ...createActivitySlide(createDemoDeck(), "satisfaction"),
  speakerNotes: "SPEAKER_NOTE_SENTINEL"
};

const publicResult: ActivityPublicResult = {
  activityRunId: "activity_run_1",
  activityId: slide.activity.activityId,
  status: "results",
  revision: 3,
  responseCount: 7,
  aggregates: slide.activity.questions.map((question) => ({
    questionId: question.questionId,
    type: question.type,
    responseCount: 7,
    average: question.type === "rating" ? 4.2 : null,
    choices: []
  })),
  approvedTextEntries: []
};

describe("ActivityAudienceSlideRenderer", () => {
  it("renders only the public result projection after reveal", () => {
    const html = renderToStaticMarkup(
      <ActivityAudienceSlideRenderer
        activity={slide.activity}
        audienceUrl="/audience/session_1/a/activity_1"
        publicResult={publicResult}
        status="results"
      />
    );

    expect(html).toContain("공개 결과");
    expect(html).toContain("4.2");
    expect(html).toContain(">7<");
    expect(html).not.toContain("SPEAKER_NOTE_SENTINEL");
    expect(html).not.toContain("displayName");
    expect(html).not.toContain("moderationStatus");
  });

  it("does not render aggregate values while results are hidden", () => {
    const html = renderToStaticMarkup(
      <ActivityAudienceSlideRenderer
        activity={slide.activity}
        audienceUrl="/audience/session_1/a/activity_1"
        publicResult={publicResult}
        status="closed"
      />
    );

    expect(html).toContain("응답이 마감되었습니다");
    expect(html).not.toContain("4.2");
    expect(html).not.toContain(">7<");
  });

  it("builds the canonical direct Activity path", () => {
    expect(canonicalActivityUrl("/audience/session_1", "activity_1")).toBe(
      "/audience/session_1/a/activity_1"
    );
  });
});
