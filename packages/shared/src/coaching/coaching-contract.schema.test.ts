import { describe, expect, it } from "vitest";

import {
  criterionResultSchema,
  reportObservationSchema,
} from "./evaluation-criterion.schema";
import {
  focusedPracticeGoalOutcomeSchema,
  practiceVerificationSummarySchema,
} from "./focused-practice.schema";
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
  criterionRef: observation.criterionRef,
  observationIds: [observation.observationId],
  label: "2번 슬라이드 습관어 다시 연습",
  detail: "문제 구간을 확인한 뒤 같은 문장을 짧게 반복합니다.",
  audienceImpact: "핵심 수치의 신뢰도가 낮아질 수 있습니다.",
  instruction: "습관어 없이 수치를 한 문장으로 설명합니다.",
  successCondition: "습관어를 한 번 이하로 사용합니다.",
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
      resolutionReasonCode: "FAILED" as const,
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
  metricDefinitionVersion: 1,
  unit: "count" as const,
  direction: "lower-is-better" as const,
  targetRange: null,
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

  it("rejects reason codes that contradict the evaluation status", () => {
    expect(
      criterionResultSchema.safeParse({
        ...criterionResult,
        evaluationStatus: "passed",
        reasonCode: "NO_MEASUREMENT",
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

  it("rejects resolution and summary statuses that contradict criterion results", () => {
    expect(
      practiceVerificationSummarySchema.safeParse({
        ...verification,
        verificationStatus: "verified",
        items: [
          {
            ...verification.items[0],
            resolutionStatus: "resolved",
            resolutionReasonCode: "PASSED",
          },
        ],
        counts: { resolved: 1, repeated: 0, unmeasured: 0, incomparable: 0 },
      }).success,
    ).toBe(false);
  });

  it("rejects verification actions for another project", () => {
    expect(
      practiceVerificationSummarySchema.safeParse({
        ...verification,
        nextActions: [
          {
            ...action,
            target: { ...action.target, projectId: "project_other" },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("FocusedPracticeGoalOutcome contract", () => {
  it("rejects measurement, outcome, and reason combinations that contradict each other", () => {
    expect(
      focusedPracticeGoalOutcomeSchema.safeParse({
        goalId: "goal_1",
        criterionRef: observation.criterionRef,
        measurementState: "measured",
        outcome: "unmeasured",
        observation: { kind: "count", metric: "filler-word-count", value: 1 },
        threshold: { kind: "max-count", metric: "filler-word-count", value: 1 },
        reasonCode: "PASSED",
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

  it("rejects metric, unit, and direction combinations with different meanings", () => {
    expect(
      trendSeriesSchema.safeParse({
        ...trend,
        unit: "ratio",
        direction: "higher-is-better",
      }).success,
    ).toBe(false);

    expect(
      trendSeriesSchema.safeParse({
        ...trend,
        metric: "duration-seconds",
        unit: "seconds",
        direction: "target-range",
        targetRange: null,
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
    readiness: "needs-practice" as const,
    criterionResults: [criterionResult],
    observations: [observation],
    topActions: [action],
    practiceVerification: verification,
    trendSeries: [trend],
    timelineEvents: [
      {
        eventId: "timeline_1",
        observationId: observation.observationId,
        category: "delivery" as const,
        slideId: "slide_1",
        startMs: 1_000,
        endMs: 2_500,
        severity: "high" as const,
      },
    ],
    qnaAssessment: {
      qnaSessionId: "qna_1",
      projectId: "project_1",
      sourceFullRunId: "run_2",
      criterionResults: [criterionResult],
      assessedAt: evaluatedAt,
    },
    nextPracticePlan: {
      steps: [{ order: 1 as const, action }],
    },
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

  it("rejects criterion results linked to an observation from another criterion or scope", () => {
    expect(
      coachingReportViewSchema.safeParse({
        ...view,
        criterionResults: [
          {
            ...criterionResult,
            criterionRef: { criterionId: "criterion_other", revision: 1 },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires evidence-backed Top actions and valid timeline references", () => {
    expect(
      coachingReportViewSchema.safeParse({
        ...view,
        topActions: [{ ...action, observationIds: [] }],
      }).success,
    ).toBe(false);
    expect(
      coachingReportViewSchema.safeParse({
        ...view,
        timelineEvents: [{ ...view.timelineEvents[0], observationId: "missing" }],
      }).success,
    ).toBe(false);
  });
});
