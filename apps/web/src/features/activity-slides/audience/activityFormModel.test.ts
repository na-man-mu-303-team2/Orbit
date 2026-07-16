import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import { describe, expect, it } from "vitest";

import {
  buildSatisfactionAnswers,
  createSatisfactionDraft,
  hasSatisfactionDraft,
  validateSatisfactionDraft
} from "./activityFormModel";

const definition = createActivitySlide(
  createDemoDeck(),
  "satisfaction"
).activity;

describe("satisfaction audience form model", () => {
  it("requires the rating and omits an empty optional free-text answer", () => {
    const draft = createSatisfactionDraft(null);
    expect(validateSatisfactionDraft(definition, draft)).toEqual({
      [definition.questions[0]!.questionId]: "평점을 선택해 주세요."
    });

    draft.ratings[definition.questions[0]!.questionId] = 4;
    expect(validateSatisfactionDraft(definition, draft)).toEqual({});
    expect(buildSatisfactionAnswers(definition, draft)).toEqual([
      {
        questionId: definition.questions[0]!.questionId,
        type: "rating",
        value: 4
      }
    ]);
  });

  it("detects a local draft before an active-activity transition", () => {
    const draft = createSatisfactionDraft(null);
    expect(hasSatisfactionDraft(draft)).toBe(false);
    draft.freeText[definition.questions[1]!.questionId] = "아직 제출하지 않은 의견";
    expect(hasSatisfactionDraft(draft)).toBe(true);
  });
});
