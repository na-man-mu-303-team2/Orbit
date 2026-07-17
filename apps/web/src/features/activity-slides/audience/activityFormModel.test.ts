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

  it("builds single and multiple choice answers with selection limits", () => {
    const poll = createActivitySlide(createDemoDeck(), "poll").activity;
    const pollDraft = createSatisfactionDraft(null);
    const pollQuestion = poll.questions[0]!;
    if (pollQuestion.type !== "single-choice") throw new Error("poll fixture");
    expect(validateSatisfactionDraft(poll, pollDraft)[pollQuestion.questionId]).toBeTruthy();
    pollDraft.singleChoice[pollQuestion.questionId] = pollQuestion.options[1]!.optionId;
    expect(buildSatisfactionAnswers(poll, pollDraft)).toEqual([{
      questionId: pollQuestion.questionId,
      type: "single-choice",
      optionId: pollQuestion.options[1]!.optionId
    }]);

    const multiple = {
      ...definition,
      questions: [{
        questionId: "question_multi",
        type: "multiple-choice" as const,
        prompt: "복수 선택",
        required: true,
        maxSelections: 1,
        options: [
          { optionId: "option_a", label: "A" },
          { optionId: "option_b", label: "B" }
        ]
      }]
    };
    const multipleDraft = createSatisfactionDraft(null);
    multipleDraft.multipleChoice.question_multi = ["option_a", "option_b"];
    expect(validateSatisfactionDraft(multiple, multipleDraft).question_multi).toContain("최대 1개");
  });
});
