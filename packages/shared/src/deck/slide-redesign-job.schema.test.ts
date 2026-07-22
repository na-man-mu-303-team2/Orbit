import { describe, expect, it } from "vitest";

import { designAgentCapabilities } from "./design-agent.schema";
import {
  createSlideRedesignJobRequestSchema,
  slideRedesignJobPayloadSchema,
  slideRedesignJobResultSchema,
  slideRedesignProgressPayloadSchema,
} from "./slide-redesign-job.schema";

const selectedPaletteOption = {
  optionId: "calm-blue",
  name: "Calm blue",
  isCurrentTheme: false,
  palette: {
    dominant: "#EFF6FF",
    surface: "#FFFFFF",
    text: "#172554",
    focal: "#2563EB",
    secondary: "#0F766E",
  },
  rationale: "Uses a restrained blue palette.",
};

describe("slide redesign job contracts", () => {
  const context = {
    deckId: "deck_1",
    baseVersion: 1,
    canvas: {
      preset: "wide-16-9" as const,
      width: 1920 as const,
      height: 1080 as const,
      aspectRatio: "16:9" as const,
    },
    slide: {
      slideId: "slide_1",
      order: 1,
      title: "Sample",
      style: {},
      elements: [],
      animations: [],
      semanticCues: [],
      actions: [],
    },
    selectedElementIds: [],
    theme: {
      themeId: "theme-1",
      name: "Default",
      backgroundColor: "#FFFFFF",
      textColor: "#111111",
      accentColor: "#2563EB",
      fontFamily: "Pretendard",
    },
  };

  it("requires a completed palette selection to create a job", () => {
    expect(
      createSlideRedesignJobRequestSchema.parse({
        sessionId: "session-1",
        content: "Redesign this slide",
        selectedPaletteOptionId: selectedPaletteOption.optionId,
        context,
      }).selectedPaletteOptionId,
    ).toBe("calm-blue");
    expect(
      createSlideRedesignJobRequestSchema.safeParse({
        sessionId: "session-1",
        content: "Redesign this slide",
        selectedPaletteOptionId: null,
        context,
      }).success,
    ).toBe(false);
  });

  it("validates the worker payload at the queue boundary", () => {
    expect(
      slideRedesignJobPayloadSchema.parse({
        jobId: "job-redesign-1",
        projectId: "project-1",
        userId: "user-1",
        requestMessageId: "message-1",
        sessionId: "session-1",
        question: "Redesign this slide",
        context,
        history: [],
        capabilities: designAgentCapabilities,
        selectedPaletteOption,
      }).selectedPaletteOption.optionId,
    ).toBe("calm-blue");
  });

  it("accepts ordered completed stages and allows illustrating to be skipped", () => {
    expect(
      slideRedesignProgressPayloadSchema.parse({
        jobId: "job-redesign-1",
        projectId: "project-1",
        sessionId: "session-1",
        stage: "verifying",
        completedStages: [
          "interpreting",
          "composing",
          "coloring",
          "ornamenting",
        ],
      }).stage,
    ).toBe("verifying");
  });

  it("rejects duplicate, out-of-order, and future completed stages", () => {
    for (const completedStages of [
      ["interpreting", "interpreting"],
      ["composing", "interpreting"],
      ["interpreting", "verifying"],
    ]) {
      expect(
        slideRedesignProgressPayloadSchema.safeParse({
          jobId: "job-redesign-1",
          projectId: "project-1",
          sessionId: "session-1",
          stage: "composing",
          completedStages,
        }).success,
      ).toBe(false);
    }
  });

  it("keeps a completed applicable result self-contained for polling clients", () => {
    const proposal = {
      proposalId: "proposal-1",
      projectId: "project-1",
      deckId: context.deckId,
      slideId: context.slide.slideId,
      requestMessageId: "message-request-1",
      responseMessageId: "message-response-1",
      baseVersion: context.baseVersion,
      title: "Slide redesign proposal",
      operations: [
        {
          type: "update_slide_style" as const,
          slideId: context.slide.slideId,
          style: { backgroundColor: "#F8FAFC" },
        },
      ],
      affectedElementIds: [],
      warnings: [],
      status: "pending" as const,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    };

    expect(
      slideRedesignJobResultSchema.parse({
        outcome: "applicable",
        sessionId: "session-1",
        requestMessageId: "message-request-1",
        responseMessageId: "message-response-1",
        proposal,
        stale: false,
      }).proposal,
    ).toEqual(proposal);
  });

  it("rejects proposal/outcome and stale/status contradictions", () => {
    const result = {
      outcome: "fallback-allowed",
      sessionId: "session-1",
      requestMessageId: "message-request-1",
      responseMessageId: "message-response-1",
      stale: true,
    };

    expect(slideRedesignJobResultSchema.safeParse(result).success).toBe(false);
    expect(
      slideRedesignJobResultSchema.safeParse({
        ...result,
        outcome: "applicable",
        stale: false,
      }).success,
    ).toBe(false);
  });
});
