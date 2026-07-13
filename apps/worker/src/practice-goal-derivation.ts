import {
  practiceGoalSetSchema,
  type EvaluationCriterion,
  type PracticeGoal,
  type PracticeGoalResolution,
  type PracticeGoalSet,
  type RehearsalEvaluationSnapshot,
  type RehearsalReport,
} from "@orbit/shared";
import { createHash } from "node:crypto";
import type { DataSource } from "typeorm";

type QueryExecutor = Pick<DataSource, "query">;

type Candidate = {
  category: PracticeGoal["category"];
  criterion: EvaluationCriterion;
  severity: number;
  slideOrder: number;
  targetScope: PracticeGoal["targetScope"];
  evidenceRefs: PracticeGoal["evidenceRefs"];
  problemLabel: string;
  nextAction: string;
  successCondition: string;
  measurementState: PracticeGoal["measurementState"];
};

export function derivePracticeGoalSet(input: {
  projectId: string;
  sourceFullRunId: string;
  sourceAnalysisRevision: number;
  snapshot: RehearsalEvaluationSnapshot;
  report: RehearsalReport;
  dataOrigin?: "live" | "fixture";
}): PracticeGoalSet | null {
  const plan = input.snapshot.evaluationPlan;
  if (!plan || input.sourceAnalysisRevision < 1) return null;

  const slideOrder = new Map(input.snapshot.slides.map((slide) => [slide.slideId, slide.order]));
  const candidates: Candidate[] = [
    ...semanticCandidates(plan.criteria, input.report, slideOrder),
    ...timingCandidates(plan.criteria, input.report, slideOrder),
    ...deliveryCandidates(plan.criteria, input.report),
  ];
  if (candidates.length === 0) {
    candidates.push(...fallbackCandidates(plan.criteria, slideOrder));
  }
  const lensPriority = new Map(
    lensOrder(plan.evaluatorLensRef.lensId).map((category, index) => [category, index]),
  );
  candidates.sort((left, right) => {
    const categoryOrder =
      (lensPriority.get(left.category) ?? 99) -
      (lensPriority.get(right.category) ?? 99);
    if (categoryOrder !== 0) return categoryOrder;
    if (left.severity !== right.severity) return right.severity - left.severity;
    if (left.slideOrder !== right.slideOrder) return left.slideOrder - right.slideOrder;
    return patternKey(left).localeCompare(patternKey(right));
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

function semanticCandidates(
  criteria: EvaluationCriterion[],
  report: RehearsalReport,
  slideOrder: Map<string, number>,
): Candidate[] {
  return report.semanticCueOutcomes.flatMap((outcome) => {
    if (outcome.status !== "missed" && outcome.status !== "partial") return [];
    const criterion = criteria.find(
      (item) =>
        item.source === "deck-cue" &&
        item.criterionId.includes(outcome.cueId) &&
        item.scope.type === "slide" &&
        item.scope.slideId === outcome.slideId,
    );
    if (!criterion) return [];
    return [{
      category: "semantic" as const,
      criterion,
      severity: outcome.status === "missed" ? 3 : 2,
      slideOrder: slideOrder.get(outcome.slideId) ?? 999,
      targetScope: { type: "slide" as const, scopeId: `scope_${outcome.slideId}`, slideId: outcome.slideId },
      evidenceRefs: [{
        kind: "semantic-cue" as const,
        slideId: outcome.slideId,
        cueId: outcome.cueId,
        outcome: outcome.status === "missed" ? "missed" as const : "not_covered" as const,
      }],
      problemLabel: `${outcome.reportLabelSnapshot || outcome.cueMeaningSnapshot} 전달이 부족했습니다.`,
      nextAction: `${outcome.reportLabelSnapshot || outcome.cueMeaningSnapshot}를 먼저 한 문장으로 설명하세요.`,
      successCondition: "핵심 개념을 부분 이상 전달합니다.",
      measurementState: "measured" as const,
    }];
  });
}

function timingCandidates(
  criteria: EvaluationCriterion[],
  report: RehearsalReport,
  slideOrder: Map<string, number>,
): Candidate[] {
  return report.slideTimings.flatMap((timing) => {
    const criterion = criteria.find(
      (item) => item.category === "timing" && item.scope.type === "slide" && item.scope.slideId === timing.slideId,
    );
    if (!criterion || criterion.measurement.type !== "max-duration-seconds") return [];
    if (timing.actualSeconds <= criterion.measurement.maximum) return [];
    return [{
      category: "timing" as const,
      criterion,
      severity: timing.actualSeconds / Math.max(criterion.measurement.maximum, 1),
      slideOrder: slideOrder.get(timing.slideId) ?? 999,
      targetScope: { type: "slide" as const, scopeId: `scope_${timing.slideId}`, slideId: timing.slideId },
      evidenceRefs: [{
        kind: "slide-timing" as const,
        slideId: timing.slideId,
        targetSeconds: timing.targetSeconds,
        actualSeconds: timing.actualSeconds,
      }],
      problemLabel: `${criterion.label}을 초과했습니다.`,
      nextAction: "핵심 문장만 남기고 전환 문장을 짧게 말하세요.",
      successCondition: `${criterion.measurement.maximum}초 이내로 마칩니다.`,
      measurementState: "measured" as const,
    }];
  });
}

function deliveryCandidates(
  criteria: EvaluationCriterion[],
  report: RehearsalReport,
): Candidate[] {
  const observations = [
    { metric: "filler-word-count" as const, value: report.metrics.fillerWordCount },
    { metric: "pause-count" as const, value: report.metrics.pauseCount },
  ];
  return observations.flatMap((observation) => {
    const criterion = criteria.find(
      (item) => item.measurement.type === "max-count" && item.measurement.metric === observation.metric,
    );
    if (!criterion || criterion.measurement.type !== "max-count") return [];
    if (observation.value <= criterion.measurement.maximum) return [];
    return [{
      category: "delivery" as const,
      criterion,
      severity: observation.value / Math.max(criterion.measurement.maximum, 1),
      slideOrder: 999,
      targetScope: null,
      evidenceRefs: [{
        kind: "delivery-count" as const,
        metric: observation.metric,
        count: observation.value,
      }],
      problemLabel: `${criterion.label} ${observation.value}회가 감지됐습니다.`,
      nextAction: "전체 흐름에서 문장 사이 호흡을 일정하게 유지하세요.",
      successCondition: `${criterion.measurement.maximum}회 이하로 줄입니다.`,
      measurementState: "measured" as const,
    }];
  });
}

function fallbackCandidates(
  criteria: EvaluationCriterion[],
  slideOrder: Map<string, number>,
): Candidate[] {
  return criteria
    .map((criterion): Candidate => {
      const targetScope = targetScopeForCriterion(criterion);
      return {
        category: criterion.category,
        criterion,
        severity: 0,
        slideOrder: slideOrderForCriterion(criterion, slideOrder),
        targetScope,
        evidenceRefs: [],
        problemLabel: fallbackProblemLabel(criterion),
        nextAction: fallbackNextAction(criterion),
        successCondition: fallbackSuccessCondition(criterion),
        measurementState: "measured" as const,
      };
    });
}

function targetScopeForCriterion(criterion: EvaluationCriterion): PracticeGoal["targetScope"] {
  if (criterion.scope.type === "slide") {
    return {
      type: "slide" as const,
      scopeId: `scope_${hash(["fallback", criterion.criterionId, criterion.scope]).slice(0, 24)}`,
      slideId: criterion.scope.slideId,
    };
  }
  if (criterion.scope.type === "slide-range") {
    return {
      type: "slide-range" as const,
      scopeId: `scope_${hash(["fallback", criterion.criterionId, criterion.scope]).slice(0, 24)}`,
      startSlideId: criterion.scope.startSlideId,
      endSlideId: criterion.scope.endSlideId,
    };
  }
  if (criterion.scope.type === "time-window") {
    return {
      type: criterion.scope.window,
      scopeId: `scope_${hash(["fallback", criterion.criterionId, criterion.scope]).slice(0, 24)}`,
    };
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

function fallbackProblemLabel(criterion: EvaluationCriterion) {
  if (criterion.category === "semantic") return `다음 리허설 확인 항목: ${criterion.label}`;
  if (criterion.category === "timing") return `${criterion.label.replace(/\s*목표 시간$/, "")} 시간 배분 유지`;
  if (criterion.category === "delivery") return `${criterion.label} 낮은 수준 유지`;
  return `${criterion.label} 흐름 점검`;
}

function fallbackNextAction(criterion: EvaluationCriterion) {
  if (criterion.category === "semantic") return "핵심 메시지를 먼저 한 문장으로 말하고 근거를 이어가세요.";
  if (criterion.category === "timing") return "슬라이드 시작 전에 말할 문장을 두 개로 압축하세요.";
  if (criterion.category === "delivery") return "문장 사이 호흡을 일정하게 두고 불필요한 추임새를 줄이세요.";
  return "도입, 전환, 마무리 문장을 먼저 정리하고 말하세요.";
}

function fallbackSuccessCondition(criterion: EvaluationCriterion) {
  if (criterion.measurement.type === "max-duration-seconds") {
    return `${criterion.measurement.maximum}초 이내로 핵심 내용을 전달합니다.`;
  }
  if (criterion.measurement.type === "max-count") {
    const unit = criterion.measurement.metric === "filler-word-count" ? "반복 말버릇" : "긴 멈춤";
    return `${unit}을 ${criterion.measurement.maximum}회 이하로 유지합니다.`;
  }
  return "핵심 개념을 부분 이상 전달합니다.";
}

function patternKey(candidate: Candidate) {
  return hash({
    category: candidate.category,
    criterionId: candidate.criterion.criterionId,
    scope: candidate.criterion.scope,
  });
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
