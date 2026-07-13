import { describe, expect, it } from "vitest";

import {
  completeFocusedPracticeAudioRequestSchema,
  focusedPracticeAttemptSchema,
} from "./focused-practice.schema";

describe("completeFocusedPracticeAudioRequestSchema", () => {
  it("allows only the final timeline entry to remain open", () => {
    expect(
      completeFocusedPracticeAudioRequestSchema.safeParse({
        fileId: "file_1",
        durationMs: 10_000,
        slideTimeline: [
          { slideId: "slide_1", enteredAtMs: 0, exitedAtMs: null },
          { slideId: "slide_2", enteredAtMs: 5_000, exitedAtMs: null },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("focusedPracticeAttemptSchema", () => {
  it("rejects raw transcript and audio object keys", () => {
    const attempt = {
      attemptId: "attempt_1",
      projectId: "project_1",
      practiceSessionId: "practice_1",
      attemptNumber: 1,
      status: "succeeded",
      result: "passed",
      audioFileId: null,
      analysisJobId: "job_1",
      cleanupState: "deleted",
      cleanupGeneration: 1,
      rawAudioDeletedAt: "2026-07-11T00:00:10.000Z",
      rawAudioDeleteDeadlineAt: "2026-07-11T02:00:00.000Z",
      durationMs: 10_000,
      slideTimeline: [],
      goalOutcomes: [],
      errorCode: null,
      createdAt: "2026-07-11T00:00:00.000Z",
      completedAt: "2026-07-11T00:00:10.000Z",
    };

    expect(focusedPracticeAttemptSchema.parse(attempt).result).toBe("passed");
    expect(
      focusedPracticeAttemptSchema.safeParse({ ...attempt, transcript: "원문" }).success,
    ).toBe(false);
  });
});

