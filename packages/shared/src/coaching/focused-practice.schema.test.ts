import { describe, expect, it } from "vitest";

import {
  completeFocusedPracticeAudioRequestSchema,
  focusedPracticeAttemptSummarySchema,
  focusedPracticeAttemptSchema,
  focusedPracticeSessionSchema,
} from "./focused-practice.schema";

const focusedPracticeSession = {
  practiceSessionId: "practice_1",
  projectId: "project_1",
  deckId: "deck_1",
  sourceFullRunId: "run_1",
  sourceGoalSetId: "goalset_1",
  goalIds: ["goal_1"],
  targetScope: { type: "slide" as const, scopeId: "scope_1", slideId: "slide_1" },
  snapshot: {
    deckVersion: 2,
    goalSetRef: { goalSetId: "goalset_1", revision: 3 },
    briefRef: { mode: "generic" as const },
    evaluatorLensRef: { lensId: "general-novice" as const, revision: 1 as const },
    criterionRefs: [{ criterionId: "criterion_1", revision: 1 }],
  },
  compatibilityState: "current" as const,
  status: "active" as const,
  dataOrigin: "live" as const,
  createdBy: "user_1",
  createdAt: "2026-07-15T00:00:00.000Z",
  completedAt: null,
};

describe("focusedPracticeSessionSchema", () => {
  it("freezes the source goal-set revision in the session snapshot", () => {
    expect(focusedPracticeSessionSchema.parse(focusedPracticeSession).snapshot.goalSetRef)
      .toEqual({ goalSetId: "goalset_1", revision: 3 });
  });

  it("rejects a goal-set snapshot that does not match the session source", () => {
    expect(focusedPracticeSessionSchema.safeParse({
      ...focusedPracticeSession,
      snapshot: {
        ...focusedPracticeSession.snapshot,
        goalSetRef: { goalSetId: "goalset_2", revision: 3 },
      },
    }).success).toBe(false);
    expect(focusedPracticeSessionSchema.safeParse({
      ...focusedPracticeSession,
      snapshot: {
        ...focusedPracticeSession.snapshot,
        goalSetRef: { goalSetId: "goalset_1", revision: 0 },
      },
    }).success).toBe(false);
  });
});

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

describe("focusedPracticeAttemptSummarySchema", () => {
  it("exposes only passed counts", () => {
    expect(focusedPracticeAttemptSummarySchema.parse({
      sourceFullRunId: "run-a",
      goals: [{ goalId: "goal-a", passedCount: 2 }],
    }).goals).toEqual([{ goalId: "goal-a", passedCount: 2 }]);
    expect(focusedPracticeAttemptSummarySchema.safeParse({
      sourceFullRunId: "run-a",
      goals: [{ goalId: "goal-a", passedCount: 2, unexpectedCount: 3 }],
    }).success).toBe(false);
  });
});
