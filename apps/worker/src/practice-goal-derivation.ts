import {
  practiceGoalSetSchema,
  reportObservationSchema,
  type CriterionResult,
  type EvaluationCriterion,
  type PracticeGoal,
  type PracticeGoalResolution,
  type PracticeGoalSet,
  type RehearsalFocusItem,
  type RehearsalFocusProfileSnapshot,
  type RehearsalEvaluationSnapshot,
  type RehearsalReport,
  type ReportObservation,
} from "@orbit/shared";
import { createHash } from "node:crypto";
import type { DataSource } from "typeorm";

import {
  evaluateCriterion,
  type CriterionUnavailableReason,
} from "./coaching/criterion-evaluator";

type QueryExecutor = Pick<DataSource, "query">;

type Candidate = {
  category: PracticeGoal["category"];
  criterion: EvaluationCriterion;
  evaluationStatus: Extract<CriterionResult["evaluationStatus"], "partial" | "failed">;
  severity: number;
  slideOrder: number;
  targetScope: PracticeGoal["targetScope"];
  evidenceRefs: PracticeGoal["evidenceRefs"];
  observationIds: string[];
  problemLabel: string;
  nextAction: string;
  successCondition: string;
  measurementState: PracticeGoal["measurementState"];
  focusPriority: number | null;
  lensPriority: number;
  hasBoundedEvidence: boolean;
  repeated: boolean;
};

export type FullRunCriterionEvaluation = {
  observations: ReportObservation[];
  results: CriterionResult[];
};

export function derivePracticeGoalSet(input: {
  projectId: string;
  sourceFullRunId: string;
  sourceAnalysisRevision: number;
  snapshot: RehearsalEvaluationSnapshot;
  report: RehearsalReport;
  dataOrigin?: "live" | "fixture";
  repeatedPatternKeys?: ReadonlySet<string>;
}): PracticeGoalSet | null {
  const plan = input.snapshot.evaluationPlan;
  if (!plan || input.sourceAnalysisRevision < 1) return null;

  const evaluation = evaluateFullRunCriteria({
    sourceFullRunId: input.sourceFullRunId,
    snapshot: input.snapshot,
    report: input.report,
  });
  const candidates = deriveProblemCandidates({
    criteria: plan.criteria,
    results: evaluation.results,
    observations: evaluation.observations,
    focusProfileSnapshot: input.snapshot.focusProfileSnapshot,
    evaluatorLensId: plan.evaluatorLensRef.lensId,
    slideOrder: new Map(
      input.snapshot.slides.map((slide) => [slide.slideId, slide.order]),
    ),
    repeatedPatternKeys: input.repeatedPatternKeys ?? new Set<string>(),
  });

  const goalSetId = `goalset_${hash([input.sourceFullRunId, input.sourceAnalysisRevision]).slice(0, 32)}`;
  const goals = candidates.slice(0, 3).map((candidate, index): PracticeGoal => {
    const pattern = patternKey(candidate);
    const priority = (index + 1) as 1 | 2 | 3;
    return {
      goalId: `goal_${hash([goalSetId, priority, pattern]).slice(0, 32)}`,
      goalSetId,
      projectId: input.projectId,
      originFullRunId: input.sourceFullRunId,
      priority,
      patternKey: pattern,
      category: candidate.category,
      criterionRef: {
        criterionId: candidate.criterion.criterionId,
        revision: candidate.criterion.revision,
      },
      targetScope: candidate.targetScope,
      recommendedPracticeMode: candidate.targetScope ? "focused" : "full-run-only",
      evidenceRefs: candidate.evidenceRefs,
      problemLabel: candidate.problemLabel.slice(0, 240),
      nextAction: candidate.nextAction.slice(0, 240),
      successCondition: candidate.successCondition.slice(0, 240),
      measurementState: candidate.measurementState,
      createdAt: input.report.generatedAt,
    };
  });
  const analysisState =
    input.report.semanticEvaluation.state === "partial" &&
    input.report.semanticEvaluation.retryable
      ? "partial"
      : "final";

  return practiceGoalSetSchema.parse({
    goalSetId,
    projectId: input.projectId,
    sourceFullRunId: input.sourceFullRunId,
    revision: input.sourceAnalysisRevision,
    sourceAnalysisRevision: input.sourceAnalysisRevision,
    isCurrent: true,
    analysisState,
    dataOrigin: input.dataOrigin ?? "live",
    derivationVersion: 1,
    goals,
    createdAt: input.report.generatedAt,
  });
}

export async function persistPracticeGoalSet(
  dataSource: DataSource,
  set: PracticeGoalSet,
) {
  await dataSource.transaction((manager) => persistPracticeGoalSetWithExecutor(manager, set));
}

export async function publishPracticeGoalSet(
  dataSource: DataSource,
  set: PracticeGoalSet,
  input: {
    evaluatedFullRunId: string;
    snapshot: RehearsalEvaluationSnapshot;
    report: RehearsalReport;
  },
) {
  await dataSource.transaction(async (manager) => {
    await persistPracticeGoalSetWithExecutor(manager, set);
    if (set.analysisState === "final") {
      await persistSourceGoalResolutions(manager, {
        projectId: set.projectId,
        ...input,
      });
    }
  });
}

export async function persistPracticeGoalSetWithExecutor(
  executor: QueryExecutor,
  set: PracticeGoalSet,
) {
    await executor.query(
      `
        INSERT INTO practice_goal_sets (
          goal_set_id, project_id, source_full_run_id, revision,
          source_analysis_revision, derivation_version, analysis_state,
          data_origin, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (source_full_run_id, revision) DO NOTHING
      `,
      [
        set.goalSetId,
        set.projectId,
        set.sourceFullRunId,
        set.revision,
        set.sourceAnalysisRevision,
        set.derivationVersion,
        set.analysisState,
        set.dataOrigin,
        set.createdAt,
      ],
    );
    for (const goal of set.goals) {
      await executor.query(
        `
          INSERT INTO practice_goals (
            goal_id, goal_set_id, project_id, origin_full_run_id, priority,
            pattern_key, category, criterion_ref_json, target_scope_json,
            recommended_practice_mode, evidence_refs_json, problem_label,
            next_action, success_condition, measurement_state, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (goal_id) DO NOTHING
        `,
        [
          goal.goalId,
          goal.goalSetId,
          goal.projectId,
          goal.originFullRunId,
          goal.priority,
          goal.patternKey,
          goal.category,
          goal.criterionRef,
          goal.targetScope,
          goal.recommendedPracticeMode,
          JSON.stringify(goal.evidenceRefs),
          goal.problemLabel,
          goal.nextAction,
          goal.successCondition,
          goal.measurementState,
          goal.createdAt,
        ],
      );
    }
    await executor.query(
      `
        INSERT INTO practice_goal_heads (
          project_id, source_full_run_id, current_goal_set_id,
          current_analysis_revision, updated_at
        ) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (source_full_run_id) DO UPDATE SET
          current_goal_set_id = EXCLUDED.current_goal_set_id,
          current_analysis_revision = EXCLUDED.current_analysis_revision,
          updated_at = EXCLUDED.updated_at
        WHERE practice_goal_heads.current_analysis_revision < EXCLUDED.current_analysis_revision
      `,
      [set.projectId, set.sourceFullRunId, set.goalSetId, set.sourceAnalysisRevision, set.createdAt],
    );
}

export async function persistSourceGoalResolutions(
  executor: QueryExecutor,
  input: {
    projectId: string;
    evaluatedFullRunId: string;
    snapshot: RehearsalEvaluationSnapshot;
    report: RehearsalReport;
  },
) {
  const sourceRef = input.snapshot.evaluationPlan?.practiceGoalSetRef;
  if (!sourceRef || input.report.semanticEvaluation.retryable) return [];
  const rows = await executor.query(
    `
      SELECT goal_id, origin_full_run_id, criterion_ref_json,
             target_scope_json, category
      FROM practice_goals
      WHERE project_id = $1 AND goal_set_id = $2
      ORDER BY priority ASC
    `,
    [input.projectId, sourceRef.goalSetId],
  );
  const goals = Array.isArray(rows) ? rows : [];
  const resolutions = goals.flatMap((raw) => {
    const row = resolutionSourceRow(raw);
    if (!row) return [];
    return [deriveResolution(row, input)];
  });
  for (const resolution of resolutions) {
    await executor.query(
      `
        INSERT INTO practice_goal_resolutions (
          resolution_id, project_id, goal_id, origin_full_run_id,
          evaluated_full_run_id, criterion_ref_json, status,
          measurement_state, observed_value_json, reason_code, evaluated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (goal_id, evaluated_full_run_id) DO NOTHING
      `,
      [
        resolution.resolutionId,
        input.projectId,
        resolution.goalId,
        resolution.originFullRunId,
        resolution.evaluatedFullRunId,
        resolution.criterionRef,
        resolution.status,
        resolution.measurementState,
        resolution.observation,
        resolution.reasonCode,
        resolution.evaluatedAt,
      ],
    );
  }
  return resolutions;
}

export function evaluateFullRunCriteria(input: {
  sourceFullRunId: string;
  snapshot: RehearsalEvaluationSnapshot;
  report: RehearsalReport;
}): FullRunCriterionEvaluation {
  const criteria = input.snapshot.evaluationPlan?.criteria ?? [];
  const observations: ReportObservation[] = [];
  const results = criteria.map((criterion) => {
    const measured = fullRunObservation(input.sourceFullRunId, criterion, input.report);
    if (measured.observation) observations.push(measured.observation);
    return evaluateCriterion({
      criterion,
      observation: measured.observation,
      unavailableReason: measured.unavailableReason,
      evaluatedAt: input.report.generatedAt,
    });
  });
  return { observations, results };
}

export function deriveProblemCandidates(input: {
  criteria: EvaluationCriterion[];
  results: CriterionResult[];
  observations: ReportObservation[];
  focusProfileSnapshot: RehearsalFocusProfileSnapshot | null;
  evaluatorLensId: "general-novice" | "decision-maker" | "strict-reviewer";
  slideOrder: Map<string, number>;
  repeatedPatternKeys: ReadonlySet<string>;
}): Candidate[] {
  const observationsById = new Map(
    input.observations.map((observation) => [observation.observationId, observation]),
  );
  const lensPriority = new Map(
    lensOrder(input.evaluatorLensId).map((category, index) => [category, index]),
  );
  const candidates = input.results.flatMap((result): Candidate[] => {
    if (!isProblemResult(result) || !result.observationId) {
      return [];
    }
    const criterion = input.criteria.find(
      (candidate) =>
        candidate.criterionId === result.criterionRef.criterionId &&
        candidate.revision === result.criterionRef.revision &&
        sameJson(candidate.scope, result.scope),
    );
    const observation = observationsById.get(result.observationId);
    if (!criterion || !observation) return [];

    const focusItem = matchingFocusItem(
      criterion,
      input.focusProfileSnapshot?.items ?? [],
    );
    const candidate = candidateFromEvaluation({
      criterion,
      result,
      observation,
      focusItem,
      lensPriority: lensPriority.get(criterion.category) ?? 99,
      slideOrder: slideOrderForCriterion(criterion, input.slideOrder),
    });
    candidate.repeated = input.repeatedPatternKeys.has(patternKey(candidate));
    return [candidate];
  });

  candidates.sort(compareCandidates);
  const merged = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = criterionScopeKey(candidate.criterion);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, candidate);
      continue;
    }
    current.evidenceRefs = mergeStable(
      current.evidenceRefs,
      candidate.evidenceRefs,
    );
    current.observationIds = Array.from(
      new Set([...current.observationIds, ...candidate.observationIds]),
    ).sort();
    current.hasBoundedEvidence =
      current.hasBoundedEvidence || candidate.hasBoundedEvidence;
    current.repeated = current.repeated || candidate.repeated;
  }

  return [...merged.values()].sort(compareCandidates);
}

function fullRunObservation(
  sourceFullRunId: string,
  criterion: EvaluationCriterion,
  report: RehearsalReport,
): {
  observation: ReportObservation | null;
  unavailableReason?: CriterionUnavailableReason;
} {
  if (criterion.measurement.type === "semantic-coverage") {
    const outcome = report.semanticCueOutcomes.find(
      (candidate) =>
        criterion.source === "deck-cue" &&
        criterion.scope.type === "slide" &&
        criterion.scope.slideId === candidate.slideId &&
        criterion.criterionId ===
          `criterion_cue_${candidate.cueId}_r${candidate.cueRevision}`.slice(0, 128),
    );
    if (!outcome) return { observation: null, unavailableReason: "NO_MEASUREMENT" };

    const evidenceRefs: ReportObservation["evidenceRefs"] = [
      {
        kind: "semantic-cue",
        slideId: outcome.slideId,
        cueId: outcome.cueId,
        cueRevision: outcome.cueRevision,
      },
    ];
    if (outcome.evidence) {
      evidenceRefs.push({
        kind: "time-range",
        slideId: outcome.slideId,
        startMs: Math.round(outcome.evidence.startMs),
        endMs: Math.round(outcome.evidence.endMs),
      });
    }
    if (outcome.status === "unmeasured" || outcome.status === "excluded") {
      return {
        observation: createObservation({
          sourceFullRunId,
          criterion,
          measurementState: "unmeasured",
          value: { kind: "none" },
          evidenceRefs,
          observedAt: report.generatedAt,
        }),
        unavailableReason:
          outcome.status === "excluded" ? "NOT_APPLICABLE" : "NO_MEASUREMENT",
      };
    }
    const contradicted = report.semanticCueDecisions.some(
      (decision) =>
        decision.slideId === outcome.slideId &&
        decision.cueId === outcome.cueId &&
        decision.label === "contradicted",
    );
    return {
      observation: createObservation({
        sourceFullRunId,
        criterion,
        measurementState: "measured",
        value: {
          kind: "semantic",
          value: contradicted ? "contradicted" : outcome.status,
        },
        evidenceRefs,
        observedAt: report.generatedAt,
      }),
    };
  }

  if (criterion.measurement.type === "max-duration-seconds") {
    const slideId = criterion.scope.type === "slide" ? criterion.scope.slideId : null;
    const timing = report.slideTimings.find((candidate) => candidate.slideId === slideId);
    if (!timing) return { observation: null, unavailableReason: "NO_MEASUREMENT" };
    return {
      observation: createObservation({
        sourceFullRunId,
        criterion,
        measurementState: "measured",
        value: { kind: "duration-seconds", value: timing.actualSeconds },
        evidenceRefs: [],
        observedAt: report.generatedAt,
      }),
    };
  }

  if (criterion.measurement.type === "max-count") {
    const value = countObservationValue(
      criterion.scope,
      criterion.measurement.metric,
      report,
    );
    if (value === null) return { observation: null, unavailableReason: "NO_MEASUREMENT" };
    return {
      observation: createObservation({
        sourceFullRunId,
        criterion,
        measurementState: "measured",
        value: { kind: "count", metric: criterion.measurement.metric, value },
        evidenceRefs: [],
        observedAt: report.generatedAt,
      }),
    };
  }

  return { observation: null, unavailableReason: "EVALUATION_UNAVAILABLE" };
}

function createObservation(input: {
  sourceFullRunId: string;
  criterion: EvaluationCriterion;
  measurementState: ReportObservation["measurementState"];
  value: ReportObservation["value"];
  evidenceRefs: ReportObservation["evidenceRefs"];
  observedAt: string;
}) {
  return reportObservationSchema.parse({
    observationId: `observation_${hash([
      input.sourceFullRunId,
      input.criterion.criterionId,
      input.criterion.revision,
      input.criterion.scope,
    ]).slice(0, 32)}`,
    criterionRef: {
      criterionId: input.criterion.criterionId,
      revision: input.criterion.revision,
    },
    scope: input.criterion.scope,
    measurementState: input.measurementState,
    value: input.value,
    evidenceRefs: input.evidenceRefs,
    observedAt: input.observedAt,
  });
}

function countObservationValue(
  scope: EvaluationCriterion["scope"],
  metric: "filler-word-count" | "pause-count",
  report: RehearsalReport,
) {
  if (scope.type === "run") {
    return metric === "filler-word-count"
      ? report.metrics.fillerWordCount
      : report.metrics.pauseCount;
  }
  if (scope.type === "slide") {
    const slideId = scope.slideId;
    const insight = report.slideInsights.find(
      (candidate) => candidate.slideId === slideId,
    );
    if (!insight) return null;
    return metric === "filler-word-count"
      ? insight.fillerWordCount
      : insight.pauseCount;
  }
  return null;
}

function isProblemResult(
  result: CriterionResult,
): result is CriterionResult & {
  measurementState: "measured";
  evaluationStatus: "partial" | "failed";
  observationId: string;
} {
  return (
    result.measurementState === "measured" &&
    (result.evaluationStatus === "partial" || result.evaluationStatus === "failed") &&
    result.observationId !== null
  );
}

function candidateFromEvaluation(input: {
  criterion: EvaluationCriterion;
  result: CriterionResult & { evaluationStatus: "partial" | "failed" };
  observation: ReportObservation;
  focusItem: RehearsalFocusItem | null;
  lensPriority: number;
  slideOrder: number;
}): Candidate {
  const targetScope = input.focusItem?.targetScope ?? targetScopeForCriterion(input.criterion);
  return {
    category: input.criterion.category,
    criterion: input.criterion,
    evaluationStatus: input.result.evaluationStatus,
    severity: normalizedSeverity(input.criterion, input.result, input.observation),
    slideOrder: input.slideOrder,
    targetScope,
    evidenceRefs: practiceEvidence(input.criterion, input.observation),
    observationIds: [input.observation.observationId],
    problemLabel: problemLabel(input.criterion, input.observation),
    nextAction: nextAction(input.criterion),
    successCondition: successCondition(input.criterion),
    measurementState: "measured",
    focusPriority: input.focusItem?.priority ?? null,
    lensPriority: input.lensPriority,
    hasBoundedEvidence: input.observation.evidenceRefs.length > 0,
    repeated: false,
  };
}

function practiceEvidence(
  criterion: EvaluationCriterion,
  observation: ReportObservation,
): PracticeGoal["evidenceRefs"] {
  if (observation.value.kind === "semantic") {
    const cue = observation.evidenceRefs.find((reference) => reference.kind === "semantic-cue");
    if (cue?.kind === "semantic-cue") {
      const outcome = observation.value.value === "partial"
        ? "not_covered"
        : observation.value.value;
      if (outcome !== "covered") {
        return [{
          kind: "semantic-cue",
          slideId: cue.slideId,
          cueId: cue.cueId,
          outcome,
        }];
      }
    }
    if (criterion.category === "structure") {
      return [{
        kind: "structure",
        criterionId: criterion.criterionId,
        outcome: observation.value.value === "partial" ? "partial" : "missed",
      }];
    }
  }
  if (
    observation.value.kind === "duration-seconds" &&
    criterion.measurement.type === "max-duration-seconds" &&
    criterion.scope.type === "slide"
  ) {
    return [{
      kind: "slide-timing",
      slideId: criterion.scope.slideId,
      targetSeconds: criterion.measurement.maximum,
      actualSeconds: observation.value.value,
    }];
  }
  if (observation.value.kind === "count") {
    return [{
      kind: "delivery-count",
      ...(criterion.scope.type === "slide" ? { slideId: criterion.scope.slideId } : {}),
      metric: observation.value.metric,
      count: observation.value.value,
    }];
  }
  return [];
}

function normalizedSeverity(
  criterion: EvaluationCriterion,
  result: CriterionResult,
  observation: ReportObservation,
) {
  if (result.evaluationStatus === "partial") return 1;
  if (observation.value.kind === "semantic") {
    return observation.value.value === "contradicted" ? 3 : 2;
  }
  if (
    observation.value.kind === "duration-seconds" &&
    criterion.measurement.type === "max-duration-seconds"
  ) {
    return observation.value.value / criterion.measurement.maximum;
  }
  if (
    observation.value.kind === "count" &&
    criterion.measurement.type === "max-count"
  ) {
    return 1 +
      (observation.value.value - criterion.measurement.maximum) /
        (criterion.measurement.maximum + 1);
  }
  return 1;
}

function matchingFocusItem(
  criterion: EvaluationCriterion,
  items: RehearsalFocusItem[],
) {
  return items.find((item) => focusItemMatchesCriterion(item, criterion)) ?? null;
}

function focusItemMatchesCriterion(
  item: RehearsalFocusItem,
  criterion: EvaluationCriterion,
) {
  const kindMatches =
    (item.kind === "opening" &&
      criterion.scope.type === "time-window" &&
      criterion.scope.window === "opening") ||
    (item.kind === "closing" &&
      criterion.scope.type === "time-window" &&
      criterion.scope.window === "closing") ||
    (item.kind === "timing" && criterion.category === "timing") ||
    (item.kind === "semantic-coverage" &&
      criterion.measurement.type === "semantic-coverage") ||
    (item.kind === "filler-words" &&
      criterion.measurement.type === "max-count" &&
      criterion.measurement.metric === "filler-word-count") ||
    (item.kind === "pauses" &&
      criterion.measurement.type === "max-count" &&
      criterion.measurement.metric === "pause-count") ||
    item.kind === "custom";
  if (!kindMatches) return false;
  if (!item.targetScope) return item.kind !== "custom";
  return targetMatchesCriterion(item.targetScope, criterion);
}

function targetMatchesCriterion(
  target: NonNullable<RehearsalFocusItem["targetScope"]>,
  criterion: EvaluationCriterion,
) {
  if (target.type === "opening" || target.type === "closing") {
    return criterion.scope.type === "time-window" && criterion.scope.window === target.type;
  }
  if (target.type === "slide" || target.type === "sentence") {
    return criterion.scope.type === "slide" && criterion.scope.slideId === target.slideId;
  }
  return (
    criterion.scope.type === "slide-range" &&
    criterion.scope.startSlideId === target.startSlideId &&
    criterion.scope.endSlideId === target.endSlideId
  );
}

function targetScopeForCriterion(
  criterion: EvaluationCriterion,
): PracticeGoal["targetScope"] {
  const scopeId = `scope_${hash([
    criterion.criterionId,
    criterion.revision,
    criterion.scope,
  ]).slice(0, 24)}`;
  if (criterion.scope.type === "slide") {
    return { type: "slide", scopeId, slideId: criterion.scope.slideId };
  }
  if (criterion.scope.type === "slide-range") {
    return {
      type: "slide-range",
      scopeId,
      startSlideId: criterion.scope.startSlideId,
      endSlideId: criterion.scope.endSlideId,
    };
  }
  if (criterion.scope.type === "time-window") {
    return { type: criterion.scope.window, scopeId };
  }
  return null;
}

function slideOrderForCriterion(
  criterion: EvaluationCriterion,
  slideOrder: Map<string, number>,
) {
  if (criterion.scope.type === "slide") return slideOrder.get(criterion.scope.slideId) ?? 999;
  if (criterion.scope.type === "slide-range") return slideOrder.get(criterion.scope.startSlideId) ?? 999;
  if (criterion.scope.type === "time-window") return criterion.scope.window === "opening" ? 0 : 998;
  return 999;
}

function compareCandidates(left: Candidate, right: Candidate) {
  const leftFocus = left.focusPriority ?? 99;
  const rightFocus = right.focusPriority ?? 99;
  if (leftFocus !== rightFocus) return leftFocus - rightFocus;

  const briefOrder = Number(right.criterion.source === "brief") -
    Number(left.criterion.source === "brief");
  if (briefOrder !== 0) return briefOrder;
  if (left.lensPriority !== right.lensPriority) {
    return left.lensPriority - right.lensPriority;
  }
  if (left.evaluationStatus !== right.evaluationStatus) {
    return left.evaluationStatus === "failed" ? -1 : 1;
  }
  if (left.severity !== right.severity) return right.severity - left.severity;
  if (left.hasBoundedEvidence !== right.hasBoundedEvidence) {
    return left.hasBoundedEvidence ? -1 : 1;
  }
  if (left.repeated !== right.repeated) return left.repeated ? -1 : 1;
  if ((left.targetScope !== null) !== (right.targetScope !== null)) {
    return left.targetScope ? -1 : 1;
  }
  if (left.slideOrder !== right.slideOrder) return left.slideOrder - right.slideOrder;
  return stableCandidateKey(left).localeCompare(stableCandidateKey(right));
}

function problemLabel(
  criterion: EvaluationCriterion,
  observation: ReportObservation,
) {
  if (observation.value.kind === "semantic") {
    const suffix = observation.value.value === "partial"
      ? "이 부분적으로만 전달됐습니다."
      : observation.value.value === "contradicted"
        ? "이 반대 의미로 전달됐습니다."
        : "이 전달되지 않았습니다.";
    return `${criterion.label}${suffix}`;
  }
  if (observation.value.kind === "duration-seconds") {
    return `${criterion.label}을 초과했습니다.`;
  }
  if (observation.value.kind === "count") {
    return `${criterion.label} ${observation.value.value}회가 감지됐습니다.`;
  }
  return `${criterion.label}을 평가하지 못했습니다.`;
}

function nextAction(criterion: EvaluationCriterion) {
  if (criterion.measurement.type === "semantic-coverage") {
    return `${criterion.label}를 먼저 한 문장으로 설명하세요.`;
  }
  if (criterion.measurement.type === "max-duration-seconds") {
    return "핵심 문장만 남기고 전환 문장을 짧게 말하세요.";
  }
  return criterion.measurement.metric === "filler-word-count"
    ? "문장을 시작하기 전에 짧게 호흡하고 불필요한 추임새를 빼세요."
    : "문장 사이 호흡 위치를 정하고 멈춤을 짧게 유지하세요.";
}

function successCondition(criterion: EvaluationCriterion) {
  if (criterion.measurement.type === "semantic-coverage") {
    return "핵심 개념을 빠짐없이 전달합니다.";
  }
  if (criterion.measurement.type === "max-duration-seconds") {
    return `${criterion.measurement.maximum}초 이내로 핵심 내용을 전달합니다.`;
  }
  return `${criterion.measurement.maximum}회 이하로 줄입니다.`;
}

function criterionScopeKey(criterion: EvaluationCriterion) {
  return canonicalJson({
    criterionId: criterion.criterionId,
    revision: criterion.revision,
    scope: criterion.scope,
  });
}

function stableCandidateKey(candidate: Candidate) {
  return canonicalJson({
    criterionId: candidate.criterion.criterionId,
    revision: candidate.criterion.revision,
    scope: candidate.criterion.scope,
    observationIds: candidate.observationIds,
  });
}

function mergeStable<T>(left: T[], right: T[]) {
  const byKey = new Map<string, T>();
  for (const value of [...left, ...right]) {
    byKey.set(canonicalJson(value), value);
  }
  return [...byKey.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, value]) => value);
}

function patternKey(candidate: Candidate) {
  return hash({
    category: candidate.category,
    criterionId: candidate.criterion.criterionId,
    revision: candidate.criterion.revision,
    scope: candidate.criterion.scope,
  });
}

function sameJson(left: unknown, right: unknown) {
  return canonicalJson(left) === canonicalJson(right);
}

type ResolutionSource = {
  goalId: string;
  originFullRunId: string;
  criterionRef: { criterionId: string; revision: number };
  targetScope: PracticeGoal["targetScope"];
  category: PracticeGoal["category"];
};

function resolutionSourceRow(raw: unknown): ResolutionSource | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const ref = row.criterion_ref_json as Record<string, unknown> | undefined;
  if (
    typeof row.goal_id !== "string" ||
    typeof row.origin_full_run_id !== "string" ||
    !ref ||
    typeof ref.criterionId !== "string" ||
    typeof ref.revision !== "number" ||
    !["semantic", "timing", "delivery", "structure"].includes(String(row.category))
  ) return null;
  return {
    goalId: row.goal_id,
    originFullRunId: row.origin_full_run_id,
    criterionRef: { criterionId: ref.criterionId, revision: ref.revision },
    targetScope: (row.target_scope_json ?? null) as PracticeGoal["targetScope"],
    category: row.category as PracticeGoal["category"],
  };
}

function deriveResolution(
  source: ResolutionSource,
  input: {
    evaluatedFullRunId: string;
    snapshot: RehearsalEvaluationSnapshot;
    report: RehearsalReport;
  },
): PracticeGoalResolution {
  const criterion = input.snapshot.evaluationPlan?.criteria.find(
    (item) =>
      item.criterionId === source.criterionRef.criterionId &&
      item.revision === source.criterionRef.revision,
  );
  const base = {
    resolutionId: `resolution_${hash([source.goalId, input.evaluatedFullRunId]).slice(0, 32)}`,
    goalId: source.goalId,
    originFullRunId: source.originFullRunId,
    evaluatedFullRunId: input.evaluatedFullRunId,
    criterionRef: source.criterionRef,
    evaluatedAt: input.report.generatedAt,
  };
  if (!criterion) {
    return {
      ...base,
      status: "incomparable",
      measurementState: "unmeasured",
      observation: { kind: "none" },
      reasonCode: "CRITERION_CHANGED",
    };
  }
  if (criterion.measurement.type === "semantic-coverage") {
    const outcome = input.report.semanticCueOutcomes.find((item) =>
      criterion.criterionId.includes(item.cueId),
    );
    if (!outcome || outcome.status === "unmeasured" || outcome.status === "excluded") {
      return {
        ...base,
        status: "unmeasured",
        measurementState: "unmeasured",
        observation: { kind: "none" },
        reasonCode: "NO_MEASUREMENT",
      };
    }
    return {
      ...base,
      status: outcome.status === "missed" ? "repeated" : "resolved",
      measurementState: "measured",
      observation: { kind: "semantic", value: outcome.status },
      reasonCode: outcome.status === "missed" ? "FAILED" : "PASSED",
    };
  }
  if (criterion.measurement.type === "max-duration-seconds") {
    const slideId = criterion.scope.type === "slide" ? criterion.scope.slideId : null;
    const timing = input.report.slideTimings.find((item) => item.slideId === slideId);
    if (!timing) return unmeasuredResolution(base);
    const passed = timing.actualSeconds <= criterion.measurement.maximum;
    return {
      ...base,
      status: passed ? "resolved" : "repeated",
      measurementState: "measured",
      observation: { kind: "duration-seconds", value: timing.actualSeconds },
      reasonCode: passed ? "PASSED" : "FAILED",
    };
  }
  if (criterion.measurement.type === "max-count") {
    const value = criterion.measurement.metric === "filler-word-count"
      ? input.report.metrics.fillerWordCount
      : input.report.metrics.pauseCount;
    const passed = value <= criterion.measurement.maximum;
    return {
      ...base,
      status: passed ? "resolved" : "repeated",
      measurementState: "measured",
      observation: { kind: "count", metric: criterion.measurement.metric, value },
      reasonCode: passed ? "PASSED" : "FAILED",
    };
  }
  return unmeasuredResolution(base);
}

function unmeasuredResolution(base: {
  resolutionId: string;
  goalId: string;
  originFullRunId: string;
  evaluatedFullRunId: string;
  criterionRef: { criterionId: string; revision: number };
  evaluatedAt: string;
}): PracticeGoalResolution {
  return {
    ...base,
    status: "unmeasured",
    measurementState: "unmeasured",
    observation: { kind: "none" },
    reasonCode: "NO_MEASUREMENT",
  };
}

function lensOrder(lensId: "general-novice" | "decision-maker" | "strict-reviewer") {
  if (lensId === "decision-maker") return ["semantic", "structure", "timing", "delivery"] as const;
  if (lensId === "strict-reviewer") return ["semantic", "delivery", "structure", "timing"] as const;
  return ["structure", "semantic", "timing", "delivery"] as const;
}

function hash(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
