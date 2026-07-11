import { describe, expect, it } from "vitest";

import {
  pptAdvisorRequestSchema,
  pptAdvisorResponseSchema,
} from "./ppt-advisor.schema";

describe("ppt advisor schema", () => {
  it("accepts bounded session context and typed suggestions", () => {
    const request = pptAdvisorRequestSchema.parse({
      question: "7분 발표에 몇 장이 적당할까요?",
      brief: {
        topic: "MVP 회고",
        duration: 7,
        tone: "friendly",
      },
      design: {
        mediaPolicy: "ai-generated",
        referencePolicy: "references-first",
      },
      history: [{ role: "user", content: "임원 대상은 아닙니다." }],
    });
    const response = pptAdvisorResponseSchema.parse({
      answer: "토론 시간을 포함하면 7장이 안정적입니다.",
      suggestions: [
        {
          field: "slides",
          value: 7,
          label: "7장 구성",
          reason: "표지와 결론을 포함한 토론형 흐름입니다.",
        },
      ],
    });

    expect(request.history).toHaveLength(1);
    expect(response.suggestions[0]).toMatchObject({ field: "slides", value: 7 });
  });

  it("rejects invalid suggestion values and oversized history", () => {
    expect(() =>
      pptAdvisorResponseSchema.parse({
        answer: "추천",
        suggestions: [
          {
            field: "mediaPolicy",
            value: "always-generate",
            label: "이미지",
            reason: "잘못된 enum",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      pptAdvisorRequestSchema.parse({
        question: "질문",
        brief: { duration: 7, tone: "friendly" },
        design: {
          mediaPolicy: "minimal",
          referencePolicy: "topic-only",
        },
        history: Array.from({ length: 7 }, () => ({
          role: "user",
          content: "context",
        })),
      }),
    ).toThrow();
  });
});
