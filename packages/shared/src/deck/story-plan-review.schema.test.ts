import { describe, expect, it } from "vitest";

import {
  storyPlanApproveRequestSchema,
  storyPlanEditRequestSchema,
  storyPlanRegenerateRequestSchema,
  storyPlanReviewResponseSchema,
} from "./story-plan-review.schema";

const response = {
  jobId: "job-1",
  projectId: "project-1",
  status: "review-pending",
  styleContext: { topic: "ORBIT", tone: "professional" },
  plan: {
    revision: 1,
    regenerationCount: 0,
    regenerationLimit: 5,
    outline: { title: "ORBIT", slideTitles: ["문제", "해결"] },
    totalSeconds: 120,
    slideCount: 2,
    generatedAt: "2026-07-16T00:00:00.000Z",
    qualityWarnings: [],
    repairReasonCodes: [],
    slides: [
      {
        order: 1,
        sourceOrder: 1,
        slideType: "problem",
        title: "문제",
        message: "현재 문제를 정의합니다.",
        speakerNotes: "문제의 배경을 설명합니다.",
        targetSeconds: 60,
        sourceState: "connected",
        sources: [
          { title: "참고 문서", type: "uploaded", authority: "unknown" },
        ],
      },
    ],
  },
  error: null,
};

describe("Story Plan Review contracts", () => {
  it("strictly parses the public response without internal source identifiers", () => {
    expect(storyPlanReviewResponseSchema.parse(response)).toEqual(response);
    expect(
      storyPlanReviewResponseSchema.safeParse({
        ...response,
        plan: { ...response.plan, rawSource: "secret" },
      }).success,
    ).toBe(false);
  });

  it("accepts a 240 character regeneration instruction and rejects 241", () => {
    expect(
      storyPlanRegenerateRequestSchema.safeParse({
        expectedRevision: 1,
        instruction: "가".repeat(240),
      }).success,
    ).toBe(true);
    expect(
      storyPlanRegenerateRequestSchema.safeParse({
        expectedRevision: 1,
        instruction: "가".repeat(241),
      }).success,
    ).toBe(false);
  });

  it("accepts unique reorder and bounded speaker note edits", () => {
    expect(
      storyPlanEditRequestSchema.safeParse({
        kind: "reorder",
        expectedRevision: 1,
        orders: [2, 1],
      }).success,
    ).toBe(true);
    expect(
      storyPlanEditRequestSchema.safeParse({
        kind: "reorder",
        expectedRevision: 1,
        orders: [1, 1],
      }).success,
    ).toBe(false);
    expect(
      storyPlanEditRequestSchema.safeParse({
        kind: "speaker-notes",
        expectedRevision: 1,
        order: 1,
        speakerNotes: "가".repeat(5001),
      }).success,
    ).toBe(false);
  });

  it("rejects stale-shape and unknown approval fields", () => {
    expect(
      storyPlanApproveRequestSchema.safeParse({ expectedRevision: 1 }).success,
    ).toBe(true);
    expect(
      storyPlanApproveRequestSchema.safeParse({
        expectedRevision: 1,
        rawPrompt: "do not expose",
      }).success,
    ).toBe(false);
    expect(
      storyPlanApproveRequestSchema.safeParse({
        expectedRevision: 1,
        slides: [
          { sourceOrder: 2, title: "해결", message: "해결책을 제안합니다." },
          { sourceOrder: 1, title: "문제", message: "문제를 설명합니다." },
        ],
        designSelection: {
          paletteOptionId: "brandlogy-blue",
          paletteOverride: {
            primary: "#6846D8",
            secondary: "#1F1D3D",
            background: "#F7F7F5",
            surface: "#FFFFFF",
            muted: "#F1ECFF",
            border: "#E6E6E6",
            text: "#090909",
            accentColor: "#C5B0F4",
          },
          fontOverride: {
            fontId: "pretendard",
            name: "Pretendard",
            headingFontFamily: "Pretendard",
            bodyFontFamily: "Pretendard",
          },
        },
      }).success,
    ).toBe(true);
  });
});
