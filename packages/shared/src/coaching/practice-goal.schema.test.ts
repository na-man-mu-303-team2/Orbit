import { describe, expect, it } from "vitest";

import {
  practiceGoalSchema,
  practiceGoalSetSchema,
  practicePlanResponseSchema,
} from "./practice-goal.schema";

const goal = {
  goalId: "goal_1",
  goalSetId: "goal-set_1",
  projectId: "project_1",
  originFullRunId: "run_1",
  priority: 1 as const,
  patternKey: "a".repeat(64),
  category: "semantic" as const,
  criterionRef: { criterionId: "criterion_1", revision: 1 },
  targetScope: { type: "slide" as const, scopeId: "scope_1", slideId: "slide_1" },
  recommendedPracticeMode: "focused" as const,
  evidenceRefs: [
    { kind: "semantic-cue" as const, slideId: "slide_1", cueId: "cue_1", outcome: "missed" as const },
  ],
  problemLabel: "핵심 메시지가 빠졌습니다.",
  nextAction: "핵심 문장을 먼저 말합니다.",
  successCondition: "핵심 개념을 부분 이상 전달합니다.",
  measurementState: "measured" as const,
  createdAt: "2026-07-11T00:00:00.000Z",
};

describe("practiceGoalSchema", () => {
  it("requires focused goals to have a target scope", () => {
    expect(practiceGoalSchema.parse(goal).targetScope?.type).toBe("slide");
    expect(
      practiceGoalSchema.safeParse({ ...goal, targetScope: null }).success,
    ).toBe(false);
  });

  it("rejects raw evidence fields", () => {
    expect(
      practiceGoalSchema.safeParse({ ...goal, transcript: "민감한 원문" }).success,
    ).toBe(false);
  });
});

describe("practiceGoalSetSchema", () => {
  it("rejects duplicate deterministic priorities", () => {
    expect(
      practiceGoalSetSchema.safeParse({
        goalSetId: "goal-set_1",
        projectId: "project_1",
        sourceFullRunId: "run_1",
        revision: 1,
        sourceAnalysisRevision: 1,
        isCurrent: true,
        analysisState: "final",
        dataOrigin: "live",
        derivationVersion: 1,
        goals: [goal, { ...goal, goalId: "goal_2", patternKey: "b".repeat(64) }],
        createdAt: "2026-07-11T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("practicePlanResponseSchema", () => {
  it("keeps processing, no-goal, stale, and error distinct", () => {
    for (const state of [
      { status: "processing", sourceFullRunId: "run_1" },
      { status: "no-goal", sourceFullRunId: "run_1" },
      { status: "stale", sourceFullRunId: "run_1", reason: "SOURCE_STALE" },
      { status: "error", sourceFullRunId: "run_1", code: "SOURCE_FAILED" },
    ]) {
      expect(practicePlanResponseSchema.safeParse(state).success).toBe(true);
    }
    expect(
      practicePlanResponseSchema.safeParse({ status: "no-history", sourceFullRunId: "run_1" })
        .success,
    ).toBe(false);
  });
});
