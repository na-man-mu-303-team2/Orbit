import { describe, expect, it } from "vitest";

import { createActivityDefinitionFingerprint } from "./activity-definition-fingerprint";

const definition = {
  activityId: "activity_1",
  template: "poll" as const,
  title: "선호 기능",
  description: "하나를 골라 주세요.",
  questions: [
    {
      questionId: "question_1",
      type: "single-choice" as const,
      prompt: "어떤 기능이 좋은가요?",
      required: true,
      options: [
        { optionId: "option_1", label: "협업" },
        { optionId: "option_2", label: "발표" }
      ]
    }
  ],
  allowDisplayName: false,
  hideResultsUntilReveal: true
};

describe("createActivityDefinitionFingerprint", () => {
  it("is deterministic and changes for semantic definition edits", () => {
    const fingerprint = createActivityDefinitionFingerprint(definition);
    expect(fingerprint).toHaveLength(64);
    expect(createActivityDefinitionFingerprint({ ...definition })).toBe(fingerprint);
    expect(
      createActivityDefinitionFingerprint({ ...definition, title: "변경된 제목" })
    ).not.toBe(fingerprint);
  });
});
