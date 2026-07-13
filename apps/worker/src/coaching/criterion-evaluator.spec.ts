import {
  evaluationCriterionSchema,
  reportObservationSchema,
  type EvaluationCriterion,
  type ReportObservation,
} from "@orbit/shared";
import { describe, expect, it } from "vitest";

import { evaluateCriterion } from "./criterion-evaluator";

const evaluatedAt = "2026-07-13T00:00:00.000Z";

describe("evaluateCriterion", () => {
  it.each([
    ["covered", "passed", "PASSED"],
    ["partial", "partial", "PARTIAL"],
    ["missed", "failed", "CONCEPT_MISSED"],
    ["contradicted", "failed", "CONCEPT_MISSED"],
  ] as const)(
    "maps semantic %s without swapping partial and missed",
    (value, evaluationStatus, reasonCode) => {
      const criterion = semanticCriterion();
      const result = evaluateCriterion({
        criterion,
        observation: observation(criterion, { kind: "semantic", value }),
        evaluatedAt,
      });

      expect(result).toMatchObject({
        measurementState: "measured",
        evaluationStatus,
        reasonCode,
      });
    },
  );

  it.each([
    [12, "passed", "PASSED"],
    [12.01, "failed", "THRESHOLD_EXCEEDED"],
  ] as const)("applies the duration maximum boundary", (value, status, reason) => {
    const criterion = durationCriterion();
    expect(
      evaluateCriterion({
        criterion,
        observation: observation(criterion, {
          kind: "duration-seconds",
          value,
        }),
        evaluatedAt,
      }),
    ).toMatchObject({ evaluationStatus: status, reasonCode: reason });
  });

  it.each([
    ["filler-word-count", 1, "passed"],
    ["filler-word-count", 2, "failed"],
    ["pause-count", 0, "passed"],
    ["pause-count", 1, "failed"],
  ] as const)("applies the %s boundary at %s", (metric, value, status) => {
    const criterion = countCriterion(metric);
    expect(
      evaluateCriterion({
        criterion,
        observation: observation(criterion, { kind: "count", metric, value }),
        evaluatedAt,
      }).evaluationStatus,
    ).toBe(status);
  });

  it("keeps missing and unmeasured observations out of failure results", () => {
    const criterion = semanticCriterion();
    const missing = evaluateCriterion({
      criterion,
      observation: null,
      evaluatedAt,
    });
    const unmeasured = evaluateCriterion({
      criterion,
      observation: observation(
        criterion,
        { kind: "none" },
        "unmeasured",
      ),
      unavailableReason: "EVALUATION_UNAVAILABLE",
      evaluatedAt,
    });

    expect(missing).toMatchObject({
      measurementState: "unmeasured",
      evaluationStatus: "not-evaluated",
      observationId: null,
      reasonCode: "NO_MEASUREMENT",
    });
    expect(unmeasured).toMatchObject({
      measurementState: "unmeasured",
      evaluationStatus: "not-evaluated",
      observationId: null,
      reasonCode: "EVALUATION_UNAVAILABLE",
    });
  });

  it("marks criterion ref and scope mismatches as incomparable", () => {
    const criterion = durationCriterion();
    const mismatchedRef = observation(criterion, {
      kind: "duration-seconds",
      value: 13,
    });
    const mismatchedScope = observation(criterion, {
      kind: "duration-seconds",
      value: 13,
    });

    expect(
      evaluateCriterion({
        criterion,
        observation: {
          ...mismatchedRef,
          criterionRef: { criterionId: "criterion_other", revision: 1 },
        },
        evaluatedAt,
      }).reasonCode,
    ).toBe("SOURCE_INCOMPARABLE");
    expect(
      evaluateCriterion({
        criterion,
        observation: {
          ...mismatchedScope,
          scope: { type: "slide", slideId: "slide_other" },
        },
        evaluatedAt,
      }).reasonCode,
    ).toBe("SOURCE_INCOMPARABLE");
  });

  it("marks value type and metric mismatches as evaluation unavailable", () => {
    const duration = durationCriterion();
    const filler = countCriterion("filler-word-count");

    expect(
      evaluateCriterion({
        criterion: duration,
        observation: observation(duration, {
          kind: "count",
          metric: "pause-count",
          value: 1,
        }),
        evaluatedAt,
      }).reasonCode,
    ).toBe("EVALUATION_UNAVAILABLE");
    expect(
      evaluateCriterion({
        criterion: filler,
        observation: observation(filler, {
          kind: "count",
          metric: "pause-count",
          value: 1,
        }),
        evaluatedAt,
      }).reasonCode,
    ).toBe("EVALUATION_UNAVAILABLE");
  });

  it("returns the same result for identical inputs without an execution-kind branch", () => {
    const criterion = countCriterion("pause-count");
    const input = {
      criterion,
      observation: observation(criterion, {
        kind: "count" as const,
        metric: "pause-count" as const,
        value: 1,
      }),
      evaluatedAt,
    };

    expect(evaluateCriterion(input)).toEqual(evaluateCriterion(input));
  });
});

function semanticCriterion(): EvaluationCriterion {
  return evaluationCriterionSchema.parse({
    criterionId: "criterion_semantic_1",
    revision: 2,
    category: "semantic",
    source: "brief",
    scope: { type: "run" },
    label: "핵심 내용을 전달한다.",
    measurement: {
      type: "semantic-coverage",
      expectedConceptIds: ["concept_1"],
    },
  });
}

function durationCriterion(): EvaluationCriterion {
  return evaluationCriterionSchema.parse({
    criterionId: "criterion_timing_1",
    revision: 1,
    category: "timing",
    source: "system",
    scope: { type: "slide", slideId: "slide_1" },
    label: "첫 슬라이드 목표 시간",
    measurement: { type: "max-duration-seconds", maximum: 12 },
  });
}

function countCriterion(
  metric: "filler-word-count" | "pause-count",
): EvaluationCriterion {
  return evaluationCriterionSchema.parse({
    criterionId: `criterion_${metric}`,
    revision: 1,
    category: "delivery",
    source: "system",
    scope: { type: "run" },
    label: metric,
    measurement: {
      type: "max-count",
      metric,
      maximum: metric === "filler-word-count" ? 1 : 0,
    },
  });
}

function observation(
  criterion: EvaluationCriterion,
  value: ReportObservation["value"],
  measurementState: ReportObservation["measurementState"] = "measured",
): ReportObservation {
  return reportObservationSchema.parse({
    observationId: `observation_${criterion.criterionId}`,
    criterionRef: {
      criterionId: criterion.criterionId,
      revision: criterion.revision,
    },
    scope: criterion.scope,
    measurementState,
    value,
    evidenceRefs: [],
    observedAt: "2026-07-13T00:00:00.000Z",
  });
}
