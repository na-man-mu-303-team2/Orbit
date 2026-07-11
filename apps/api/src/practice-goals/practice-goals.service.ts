import {
  practiceGoalSchema,
  practiceGoalSetSchema,
  practicePlanResponseSchema,
  type PracticeGoal,
} from "@orbit/shared";
import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class PracticeGoalsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly projects: ProjectsService,
  ) {}

  async getPlan(projectId: string, sourceFullRunId: string, actorUserId: string) {
    await this.projects.assertCanReadProject(projectId, actorUserId);
    const run = firstRow(await this.dataSource.query(
      `SELECT status, analysis_revision, analysis_finalized_at
       FROM rehearsal_runs WHERE project_id = $1 AND run_id = $2`,
      [projectId, sourceFullRunId],
    ));
    if (!run) {
      return practicePlanResponseSchema.parse({ status: "error", sourceFullRunId, code: "SOURCE_NOT_FOUND" });
    }
    if (run.status === "failed" || run.status === "cancelled") {
      return practicePlanResponseSchema.parse({ status: "error", sourceFullRunId, code: "SOURCE_FAILED" });
    }

    const setRow = firstRow(await this.dataSource.query(
      `SELECT sets.* FROM practice_goal_heads heads
       JOIN practice_goal_sets sets ON sets.project_id = heads.project_id
        AND sets.goal_set_id = heads.current_goal_set_id
       WHERE heads.project_id = $1 AND heads.source_full_run_id = $2`,
      [projectId, sourceFullRunId],
    ));
    if (!setRow || setRow.analysis_state === "partial") {
      return practicePlanResponseSchema.parse({ status: "processing", sourceFullRunId });
    }

    const goalRows = await this.dataSource.query(
      `SELECT * FROM practice_goals WHERE project_id = $1 AND goal_set_id = $2 ORDER BY priority ASC`,
      [projectId, setRow.goal_set_id],
    );
    const goals = (Array.isArray(goalRows) ? goalRows : []).map(toGoal);
    const goalSet = practiceGoalSetSchema.parse({
      goalSetId: setRow.goal_set_id,
      projectId,
      sourceFullRunId,
      revision: setRow.revision,
      sourceAnalysisRevision: setRow.source_analysis_revision,
      isCurrent: true,
      analysisState: setRow.analysis_state,
      dataOrigin: setRow.data_origin,
      derivationVersion: setRow.derivation_version,
      goals,
      createdAt: toIso(setRow.created_at),
    });
    if (goals.length === 0) {
      return practicePlanResponseSchema.parse({ status: "no-goal", sourceFullRunId });
    }

    const historyRows = await this.dataSource.query(
      `SELECT pattern_key, created_at FROM practice_goals
       WHERE project_id = $1 AND pattern_key = ANY($2::text[])
       ORDER BY created_at DESC`,
      [projectId, goals.map((goal) => goal.patternKey)],
    );
    const history = historyByPattern(Array.isArray(historyRows) ? historyRows : []);
    return practicePlanResponseSchema.parse({
      status: "ready",
      sourceFullRunId,
      goalSet,
      goals: goals.map((goal) => ({
        ...goal,
        history: history.get(goal.patternKey) ?? {
          label: "current",
          occurrenceCount: 1,
          comparableRunCount: 0,
          lastSeenAt: goal.createdAt,
        },
        canStartFocusedPractice:
          goal.recommendedPracticeMode === "focused" && goal.measurementState === "measured",
        unavailableReason:
          goal.recommendedPracticeMode === "full-run-only"
            ? "FULL_RUN_ONLY"
            : goal.measurementState === "unmeasured"
              ? "UNMEASURED"
              : null,
      })),
      fullRehearsalCta: { projectId, sourceGoalSetId: goalSet.goalSetId },
    });
  }
}

function toGoal(row: Record<string, unknown>): PracticeGoal {
  return practiceGoalSchema.parse({
    goalId: row.goal_id,
    goalSetId: row.goal_set_id,
    projectId: row.project_id,
    originFullRunId: row.origin_full_run_id,
    priority: row.priority,
    patternKey: row.pattern_key,
    category: row.category,
    criterionRef: row.criterion_ref_json,
    targetScope: row.target_scope_json,
    recommendedPracticeMode: row.recommended_practice_mode,
    evidenceRefs: row.evidence_refs_json,
    problemLabel: row.problem_label,
    nextAction: row.next_action,
    successCondition: row.success_condition,
    measurementState: row.measurement_state,
    createdAt: toIso(row.created_at),
  });
}

function historyByPattern(rows: unknown[]) {
  const values = new Map<string, string[]>();
  for (const item of rows) {
    const row = item as Record<string, unknown>;
    if (typeof row.pattern_key !== "string") continue;
    const dates = values.get(row.pattern_key) ?? [];
    dates.push(toIso(row.created_at));
    values.set(row.pattern_key, dates.slice(0, 5));
  }
  return new Map([...values].map(([key, dates]) => [key, {
    label: dates.length >= 3 ? "persistent" as const : dates.length === 2 ? "recent-twice" as const : "current" as const,
    occurrenceCount: dates.length,
    comparableRunCount: Math.max(0, dates.length - 1),
    lastSeenAt: dates[0],
  }]));
}

function firstRow(rows: unknown): Record<string, unknown> | undefined {
  return Array.isArray(rows) && rows[0] && typeof rows[0] === "object"
    ? rows[0] as Record<string, unknown>
    : undefined;
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}
