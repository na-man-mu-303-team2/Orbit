import { describe, expect, it } from "vitest";

import {
  criterionResultSchema,
  reportObservationSchema,
} from "./evaluation-criterion.schema";
import { practiceVerificationSummarySchema } from "./focused-practice.schema";
import { coachingActionSchema } from "./practice-goal.schema";
import {
  coachingReportViewSchema,
  trendSeriesSchema,
} from "../rehearsals/rehearsal.schema";

const evaluatedAt = "2026-07-12T00:00:00.000Z";

const observation = {
  observationId: "observation_1",
  criterionRef: { criterionId: "criterion_1", revision: 1 },
  scope: { type: "slide" as const, slideId: "slide_1" },
  measurementState: "measured" as const,
  value: { kind: "count" as const, metric: "filler-word-count" as const, value: 2 },
  evidenceRefs: [
    {
      kind: "time-range" as const,
      slideId: "slide_1",
      startMs: 1_000,
      endMs: 2_500,
    },
  ],
  observedAt: evaluatedAt,
};

const criterionResult = {
  criterionRef: observation.criterionRef,
  category: "delivery" as const,
  scope: observation.scope,
  measurementState: "measured" as const,
  evaluationStatus: "failed" as const,
  observationId: observation.observationId,
  reasonCode: "THRESHOLD_EXCEEDED" as const,
  evaluatedAt,
};

const action = {
  actionId: "action_1",
  priority: 1 as const,
  label: "2번 슬라이드 습관어 다시 연습",
  detail: "문제 구간을 확인한 뒤 같은 문장을 짧게 반복합니다.",
  target: {
    type: "focused-practice" as const,
    projectId: "project_1",
    goalId: "goal_1",
    sourceFullRunId: "run_2",
  },
  availability: "available" as const,
  unavailableReason: null,
};

const verification = {
  verificationId: "verification_1",
  projectId: "project_1",
  sourceGoalSetId: "goal-set_1",
  evaluatedFullRunId: "run_2",
  verificationStatus: "needs-follow-up" as const,
  items: [
    {
      goalId: "goal_1",
      resolutionStatus: "repeated" as const,
      criterionResult,
    },
  ],
  counts: { resolved: 0, repeated: 1, unmeasured: 0, incomparable: 0 },
  nextActions: [action],
  evaluatedAt,
};

const trend = {
  seriesId: "trend_filler_1",
  projectId: "project_1",
  metric: "filler-word-count" as const,
  unit: "count" as const,
  direction: "lower-is-better" as const,
  points: [
    {
      runId: "run_2",
      createdAt: evaluatedAt,
      measurementState: "measured" as const,
      comparability: "comparable" as const,
      value: 2,
      reasonCode: null,
    },
  ],
  calculatedAt: evaluatedAt,
};

describe("CriterionResult and ReportObservation contracts", () => {
  it("keeps measurement state separate from evaluation status", () => {
    expect(criterionResultSchema.parse(criterionResult).evaluationStatus).toBe("failed");
    expect(
      criterionResultSchema.safeParse({
        ...criterionResult,
        measurementState: "unmeasured",
        evaluationStatus: "failed",
        observationId: null,
        reasonCode: "NO_MEASUREMENT",
      }).success,
    ).toBe(false);
    expect(
      criterionResultSchema.safeParse({
        ...criterionResult,
        measurementState: "measured",
        evaluationStatus: "not-evaluated",
      }).success,
    ).toBe(false);
  });

  it("accepts bounded evidence references and rejects transcript or raw audio fields", () => {
    expect(reportObservationSchema.parse(observation).value.kind).toBe("count");
    expect(
      reportObservationSchema.safeParse({ ...observation, transcript: "민감한 원문" }).success,
    ).toBe(false);
    expect(
      reportObservationSchema.safeParse({
        ...observation,
        evidenceRefs: [{ ...observation.evidenceRefs[0], rawAudio: "bytes" }],
      }).success,
    ).toBe(false);
  });

  it("requires a none observation for unmeasured results", () => {
    expect(
      reportObservationSchema.safeParse({
        ...observation,
        measurementState: "unmeasured",
      }).success,
    ).toBe(false);
    expect(
      reportObservationSchema.safeParse({
        ...observation,
        measurementState: "unmeasured",
        value: { kind: "none" },
      }).success,
    ).toBe(true);
  });
});

describe("CoachingAction contract", () => {
  it("uses typed targets instead of client-generated URLs", () => {
    expect(coachingActionSchema.parse(action).target.type).toBe("focused-practice");
    expect(
      coachingActionSchema.safeParse({ ...action, href: "/private/report" }).success,
    ).toBe(false);
    expect(
      coachingActionSchema.safeParse({
        ...action,
        target: { ...action.target, audioFileId: "file_private" },
      }).success,
    ).toBe(false);
  });

  it("requires an unavailable reason only for unavailable actions", () => {
    expect(
      coachingActionSchema.safeParse({
        ...action,
        availability: "unavailable",
        unavailableReason: null,
      }).success,
    ).toBe(false);
    expect(
      coachingActionSchema.safeParse({
        ...action,
        availability: "unavailable",
        unavailableReason: "SOURCE_STALE",
      }).success,
    ).toBe(true);
  });
});

describe("PracticeVerificationSummary contract", () => {
  it("counts full-run goal resolutions without duplicating measurement state", () => {
    const parsed = practiceVerificationSummarySchema.parse(verification);
    expect(parsed.counts.repeated).toBe(1);
    expect(parsed.items[0]).not.toHaveProperty("measurementState");
    expect(
      practiceVerificationSummarySchema.safeParse({
        ...verification,
        counts: { ...verification.counts, repeated: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects private evidence fields at the summary boundary", () => {
    expect(
      practiceVerificationSummarySchema.safeParse({
        ...verification,
        rawAudio: "bytes",
      }).success,
    ).toBe(false);
  });

  it("requires unmeasured resolutions to carry an unmeasured criterion result", () => {
    expect(
      practiceVerificationSummarySchema.safeParse({
        ...verification,
        verificationStatus: "incomplete",
        items: [
          {
            ...verification.items[0],
            resolutionStatus: "unmeasured",
          },
        ],
        counts: { resolved: 0, repeated: 0, unmeasured: 1, incomparable: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("TrendSeries contract", () => {
  it("keeps comparability independent from measurement state", () => {
    expect(trendSeriesSchema.parse(trend).points[0]?.value).toBe(2);
    expect(
      trendSeriesSchema.safeParse({
        ...trend,
        points: [
          {
            ...trend.points[0],
            measurementState: "unmeasured",
            value: 2,
            reasonCode: "NO_MEASUREMENT",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      trendSeriesSchema.safeParse({
        ...trend,
        points: [
          {
            ...trend.points[0],
            comparability: "incomparable",
            reasonCode: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("CoachingReportView contract", () => {
  const view = {
    reportId: "report_2",
    runId: "run_2",
    projectId: "project_1",
    viewState: "ready" as const,
    criterionResults: [criterionResult],
    observations: [observation],
    topActions: [action],
    practiceVerification: verification,
    trendSeries: [trend],
    generatedAt: evaluatedAt,
  };

  it("composes bounded coaching contracts for parallel consumers", () => {
    expect(coachingReportViewSchema.parse(view).topActions).toHaveLength(1);
  });

  it("rejects sensitive fields and dangling observation references", () => {
    expect(
      coachingReportViewSchema.safeParse({ ...view, transcript: "민감한 원문" }).success,
    ).toBe(false);
    expect(
      coachingReportViewSchema.safeParse({
        ...view,
        criterionResults: [{ ...criterionResult, observationId: "observation_missing" }],
      }).success,
    ).toBe(false);
  });
});
