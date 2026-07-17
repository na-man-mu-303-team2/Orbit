import { describe, expect, it } from "vitest";

import { aiDeckPreviewResponseSchema } from "./ai-deck-preview.schema";

const planningPreview = {
  jobId: "job-1",
  projectId: "project-1",
  status: "composing",
  progress: 40,
  expectedSlideCountRange: { min: 5, max: 8 },
  editable: false,
  outline: [{ order: 1, title: "시작", message: "핵심 메시지" }],
  deck: null,
  completedSlideIds: [],
  pendingSlideIds: [],
  updatedAt: "2026-07-17T00:00:00.000Z",
  error: null,
} as const;

describe("AI deck preview contract", () => {
  it("accepts a strict outline-only preview before layout", () => {
    expect(aiDeckPreviewResponseSchema.parse(planningPreview)).toEqual(
      planningPreview,
    );
    expect(
      aiDeckPreviewResponseSchema.safeParse({
        ...planningPreview,
        rawArtifact: { prompt: "secret" },
      }).success,
    ).toBe(false);
  });

  it("accepts grounding before the content outline exists", () => {
    expect(
      aiDeckPreviewResponseSchema.parse({
        ...planningPreview,
        status: "grounding",
        outline: [],
      }).status,
    ).toBe("grounding");
  });
});
