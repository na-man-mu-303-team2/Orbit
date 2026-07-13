import {
  criterionResultSchema,
  evaluationCriterionSchema,
  reportObservationSchema,
  type CriterionResult,
  type EvaluationCriterion,
  type ReportObservation,
} from "@orbit/shared";

export type CriterionUnavailableReason = Extract<
  CriterionResult["reasonCode"],
  | "NO_MEASUREMENT"
  | "NOT_APPLICABLE"
  | "SOURCE_INCOMPARABLE"
  | "EVALUATION_UNAVAILABLE"
>;

export type CriterionEvaluationInput = {
  criterion: EvaluationCriterion;
  observation: ReportObservation | null;
  unavailableReason?: CriterionUnavailableReason;
  evaluatedAt: string;
};

export function evaluateCriterion(input: CriterionEvaluationInput): CriterionResult {
  const criterion = evaluationCriterionSchema.parse(input.criterion);
  const observation = input.observation
    ? reportObservationSchema.parse(input.observation)
    : null;

  if (!observation) {
    return unavailableResult(
      criterion,
      input.evaluatedAt,
      input.unavailableReason ?? "NO_MEASUREMENT",
    );
  }

  if (!sameCriterionRef(criterion, observation)) {
    return unavailableResult(
      criterion,
      input.evaluatedAt,
      "SOURCE_INCOMPARABLE",
    );
  }

  if (!sameScope(criterion.scope, observation.scope)) {
    return unavailableResult(
      criterion,
      input.evaluatedAt,
      "SOURCE_INCOMPARABLE",
    );
  }

  if (observation.measurementState === "unmeasured") {
    return unavailableResult(
      criterion,
      input.evaluatedAt,
      input.unavailableReason ?? "NO_MEASUREMENT",
    );
  }

  if (
    criterion.measurement.type === "semantic-coverage" &&
    observation.value.kind === "semantic"
  ) {
    const semanticResult = {
      covered: { evaluationStatus: "passed", reasonCode: "PASSED" },
      partial: { evaluationStatus: "partial", reasonCode: "PARTIAL" },
      missed: { evaluationStatus: "failed", reasonCode: "CONCEPT_MISSED" },
      contradicted: {
        evaluationStatus: "failed",
        reasonCode: "CONCEPT_MISSED",
      },
    } as const;
    return measuredResult(
      criterion,
      observation,
      input.evaluatedAt,
      semanticResult[observation.value.value],
    );
  }

  if (
    criterion.measurement.type === "max-duration-seconds" &&
    observation.value.kind === "duration-seconds"
  ) {
    const passed = observation.value.value <= criterion.measurement.maximum;
    return passed
      ? measuredResult(criterion, observation, input.evaluatedAt, {
          evaluationStatus: "passed",
          reasonCode: "PASSED",
        })
      : measuredResult(criterion, observation, input.evaluatedAt, {
          evaluationStatus: "failed",
          reasonCode: "THRESHOLD_EXCEEDED",
        });
  }

  if (
    criterion.measurement.type === "max-count" &&
    observation.value.kind === "count" &&
    observation.value.metric === criterion.measurement.metric
  ) {
    const passed = observation.value.value <= criterion.measurement.maximum;
    return passed
      ? measuredResult(criterion, observation, input.evaluatedAt, {
          evaluationStatus: "passed",
          reasonCode: "PASSED",
        })
      : measuredResult(criterion, observation, input.evaluatedAt, {
          evaluationStatus: "failed",
          reasonCode: "THRESHOLD_EXCEEDED",
        });
  }

  return unavailableResult(
    criterion,
    input.evaluatedAt,
    "EVALUATION_UNAVAILABLE",
  );
}

function measuredResult(
  criterion: EvaluationCriterion,
  observation: ReportObservation,
  evaluatedAt: string,
  result:
    | { evaluationStatus: "passed"; reasonCode: "PASSED" }
    | { evaluationStatus: "partial"; reasonCode: "PARTIAL" }
    | {
        evaluationStatus: "failed";
        reasonCode: "THRESHOLD_EXCEEDED" | "CONCEPT_MISSED";
      },
): CriterionResult {
  return criterionResultSchema.parse({
    criterionRef: criterionRef(criterion),
    category: criterion.category,
    scope: criterion.scope,
    measurementState: "measured",
    evaluationStatus: result.evaluationStatus,
    observationId: observation.observationId,
    reasonCode: result.reasonCode,
    evaluatedAt,
  });
}

function unavailableResult(
  criterion: EvaluationCriterion,
  evaluatedAt: string,
  reasonCode: CriterionUnavailableReason,
): CriterionResult {
  return criterionResultSchema.parse({
    criterionRef: criterionRef(criterion),
    category: criterion.category,
    scope: criterion.scope,
    measurementState: "unmeasured",
    evaluationStatus: "not-evaluated",
    observationId: null,
    reasonCode,
    evaluatedAt,
  });
}

function criterionRef(criterion: EvaluationCriterion) {
  return {
    criterionId: criterion.criterionId,
    revision: criterion.revision,
  };
}

function sameCriterionRef(
  criterion: EvaluationCriterion,
  observation: ReportObservation,
) {
  return (
    criterion.criterionId === observation.criterionRef.criterionId &&
    criterion.revision === observation.criterionRef.revision
  );
}

function sameScope(
  criterionScope: EvaluationCriterion["scope"],
  observationScope: ReportObservation["scope"],
) {
  if (criterionScope.type !== observationScope.type) return false;
  if (criterionScope.type === "run") return true;
  if (criterionScope.type === "slide" && observationScope.type === "slide") {
    return criterionScope.slideId === observationScope.slideId;
  }
  if (
    criterionScope.type === "slide-range" &&
    observationScope.type === "slide-range"
  ) {
    return (
      criterionScope.startSlideId === observationScope.startSlideId &&
      criterionScope.endSlideId === observationScope.endSlideId
    );
  }
  if (
    criterionScope.type === "time-window" &&
    observationScope.type === "time-window"
  ) {
    return criterionScope.window === observationScope.window;
  }
  return false;
}
