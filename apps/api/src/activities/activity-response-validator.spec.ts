import { describe, expect, it } from "vitest";

import { validateActivityResponseInput } from "./activity-response-validator";

const definition = {
  activityId: "activity_1",
  template: "satisfaction" as const,
  title: "만족도",
  description: "",
  questions: [
    {
      questionId: "question_rating",
      type: "rating" as const,
      prompt: "평점",
      required: true,
      leftLabel: "낮음",
      rightLabel: "높음"
    },
    {
      questionId: "question_text",
      type: "free-text" as const,
      prompt: "의견",
      required: false
    }
  ],
  allowDisplayName: false,
  hideResultsUntilReveal: true
};

describe("validateActivityResponseInput", () => {
  it("accepts answers that match the immutable snapshot", () => {
    expect(
      validateActivityResponseInput(definition, {
        clientMutationId: "mutation_1",
        answers: [{ questionId: "question_rating", type: "rating", value: 5 }]
      })
    ).toEqual({
      answers: [{ questionId: "question_rating", type: "rating", value: 5 }],
      displayName: null
    });
  });

  it("rejects missing required and mismatched answer types", () => {
    expect(() =>
      validateActivityResponseInput(definition, {
        clientMutationId: "mutation_1",
        answers: [{ questionId: "question_text", type: "free-text", text: "좋아요" }]
      })
    ).toThrow("required");
    expect(() =>
      validateActivityResponseInput(definition, {
        clientMutationId: "mutation_2",
        answers: [
          { questionId: "question_rating", type: "free-text", text: "잘못된 타입" }
        ]
      })
    ).toThrow("snapshot");
  });

  it("rejects a display name when the definition disallows it", () => {
    expect(() =>
      validateActivityResponseInput(definition, {
        clientMutationId: "mutation_1",
        displayName: "이름",
        answers: [{ questionId: "question_rating", type: "rating", value: 4 }]
      })
    ).toThrow("Display name");
  });

  it("rejects an option that is absent from the snapshot", () => {
    expect(() =>
      validateActivityResponseInput(
        {
          ...definition,
          template: "poll",
          questions: [
            {
              questionId: "question_choice",
              type: "single-choice",
              prompt: "선택",
              required: true,
              options: [
                { optionId: "option_1", label: "하나" },
                { optionId: "option_2", label: "둘" }
              ]
            }
          ]
        },
        {
          clientMutationId: "mutation_choice",
          answers: [
            {
              questionId: "question_choice",
              type: "single-choice",
              optionId: "option_missing"
            }
          ]
        }
      )
    ).toThrow("Unknown choice option");
  });
});
