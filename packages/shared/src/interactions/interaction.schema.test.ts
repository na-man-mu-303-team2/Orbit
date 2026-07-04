import { describe, expect, it } from "vitest";

import {
  interactionQuestionSchema,
  surveyResponseSchema,
} from "./interaction.schema";

describe("interaction schemas", () => {
  it("rejects rankings with more than five options", () => {
    expect(() =>
      interactionQuestionSchema.parse({
        type: "ranking",
        questionId: "question_00000000-0000-4000-8000-000000000001",
        prompt: "우선순위를 골라 주세요.",
        required: true,
        options: Array.from({ length: 6 }, (_, index) => ({
          optionId: `option_${index}`,
          label: `Option ${index}`,
        })),
      }),
    ).toThrow();
  });

  it("requires contact consent before contact answers are stored", () => {
    expect(() =>
      surveyResponseSchema.parse({
        surveyId: "survey_00000000-0000-4000-8000-000000000001",
        sessionId: "session_1",
        audienceId: "audience_00000000-0000-4000-8000-000000000001",
        submittedAt: "2026-07-05T00:00:00.000Z",
        answers: { satisfaction: 5 },
        contactConsent: false,
        contactAnswers: { email: "person@example.com" },
      }),
    ).toThrow();
  });
});
