import type { ProjectsService } from "../projects/projects.service";
import {
  rehearsalEvaluationSnapshotSchema,
  rehearsalReportSchema,
} from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { PracticeGoalsService } from "./practice-goals.service";

describe("PracticeGoalsService", () => {
  it("does not collapse a missing goal head into no history while analysis is running", async () => {
    const service = createService([
      [{ status: "processing", analysis_revision: 0, analysis_finalized_at: null }],
      [],
    ]);

    await expect(service.getPlan("project-a", "run-a", "user-a")).resolves.toEqual({
      status: "processing",
      sourceFullRunId: "run-a",
    });
  });

  it("returns no-goal when a succeeded run has no current goal head", async () => {
    const service = createService([
      [{ status: "succeeded", analysis_revision: 1, analysis_finalized_at: "2026-07-12T00:00:00.000Z" }],
      [],
    ]);

    await expect(service.getPlan("project-a", "run-a", "user-a")).resolves.toEqual({
      status: "no-goal",
      sourceFullRunId: "run-a",
    });
  });

  it("returns a bounded ready plan with history and focused-practice availability", async () => {
    const createdAt = "2026-07-11T00:00:00.000Z";
    const service = createService([
      [{ status: "succeeded", analysis_revision: 1, analysis_finalized_at: createdAt }],
      [{
        goal_set_id: "goalset-a",
        revision: 1,
        source_analysis_revision: 1,
        analysis_state: "final",
        data_origin: "live",
        derivation_version: 1,
        created_at: createdAt,
      }],
      [{
        goal_id: "goal-a",
        goal_set_id: "goalset-a",
        project_id: "project-a",
        origin_full_run_id: "run-a",
        priority: 1,
        pattern_key: "a".repeat(64),
        category: "timing",
        criterion_ref_json: { criterionId: "criterion-timing", revision: 1 },
        target_scope_json: { type: "slide", scopeId: "scope-1", slideId: "slide_1" },
        recommended_practice_mode: "focused",
        evidence_refs_json: [{ kind: "slide-timing", slideId: "slide_1", targetSeconds: 30, actualSeconds: 45 }],
        problem_label: "시간을 초과했습니다.",
        next_action: "핵심 문장만 말합니다.",
        success_condition: "30초 안에 마칩니다.",
        measurement_state: "measured",
        created_at: createdAt,
      }],
      [
        historyRow("run-a", createdAt, "a".repeat(64)),
        historyRow(
          "run-previous",
          "2026-07-10T00:00:00.000Z",
          "a".repeat(64),
        ),
      ],
    ]);

    const result = await service.getPlan("project-a", "run-a", "user-a");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready plan.");
    expect(result.goals[0]).toMatchObject({
      canStartFocusedPractice: true,
      unavailableReason: null,
      history: { label: "recent-twice", occurrenceCount: 2 },
    });
    expect(JSON.stringify(result)).not.toContain("transcript");
  });

  it("does not label problem-normal-problem as recent-twice", async () => {
    const createdAt = "2026-07-11T00:00:00.000Z";
    const service = createService(readyPlanResults(createdAt, [
      historyRow("run-a", createdAt, "a".repeat(64)),
      historyRow("run-normal", "2026-07-10T00:00:00.000Z", null),
      historyRow(
        "run-old-problem",
        "2026-07-09T00:00:00.000Z",
        "a".repeat(64),
      ),
    ]));

    const result = await service.getPlan("project-a", "run-a", "user-a");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready plan.");
    expect(result.goals[0]?.history).toMatchObject({
      label: "persistent",
      occurrenceCount: 2,
      comparableRunCount: 2,
    });
    expect(result.goals[0]?.history.label).not.toBe("recent-twice");
  });

  it("excludes incompatible and unmeasured runs from repetition history", async () => {
    const createdAt = "2026-07-11T00:00:00.000Z";
    const service = createService(readyPlanResults(createdAt, [
      historyRow("run-a", createdAt, "a".repeat(64)),
      historyRow(
        "run-incompatible",
        "2026-07-10T00:00:00.000Z",
        "a".repeat(64),
        { deckContentHash: "b".repeat(64) },
      ),
      historyRow(
        "run-unmeasured",
        "2026-07-09T00:00:00.000Z",
        "a".repeat(64),
        { measured: false },
      ),
      historyRow(
        "run-comparable",
        "2026-07-08T00:00:00.000Z",
        "a".repeat(64),
      ),
    ]));

    const result = await service.getPlan("project-a", "run-a", "user-a");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready plan.");
    expect(result.goals[0]?.history).toMatchObject({
      label: "recent-twice",
      occurrenceCount: 2,
      comparableRunCount: 1,
    });
  });
});

function readyPlanResults(createdAt: string, historyRows: unknown[]) {
  return [
    [
      {
        status: "succeeded",
        analysis_revision: 1,
        analysis_finalized_at: createdAt,
      },
    ],
    [
      {
        goal_set_id: "goalset-a",
        revision: 1,
        source_analysis_revision: 1,
        analysis_state: "final",
        data_origin: "live",
        derivation_version: 1,
        created_at: createdAt,
      },
    ],
    [goalRow(createdAt)],
    historyRows,
  ];
}

function goalRow(createdAt: string) {
  return {
    goal_id: "goal-a",
    goal_set_id: "goalset-a",
    project_id: "project-a",
    origin_full_run_id: "run-a",
    priority: 1,
    pattern_key: "a".repeat(64),
    category: "timing",
    criterion_ref_json: { criterionId: "criterion-timing", revision: 1 },
    target_scope_json: {
      type: "slide",
      scopeId: "scope-1",
      slideId: "slide_1",
    },
    recommended_practice_mode: "focused",
    evidence_refs_json: [
      {
        kind: "slide-timing",
        slideId: "slide_1",
        targetSeconds: 30,
        actualSeconds: 45,
      },
    ],
    problem_label: "시간을 초과했습니다.",
    next_action: "핵심 문장만 말합니다.",
    success_condition: "30초 안에 마칩니다.",
    measurement_state: "measured",
    created_at: createdAt,
  };
}

function historyRow(
  runId: string,
  createdAt: string,
  patternKey: string | null,
  options: { deckContentHash?: string; measured?: boolean } = {},
) {
  const evaluationSnapshot = rehearsalEvaluationSnapshotSchema.parse({
    deckId: "deck-a",
    deckVersion: 1,
    deckContentHash: options.deckContentHash ?? "a".repeat(64),
    evaluationPlan: {
      planVersion: 1,
      briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "general-novice", revision: 1 },
      targetDurationSeconds: 60,
      criteria: [
        {
          criterionId: "criterion-timing",
          revision: 1,
          category: "timing",
          source: "system",
          scope: { type: "slide", slideId: "slide_1" },
          label: "첫 슬라이드 목표 시간",
          measurement: { type: "max-duration-seconds", maximum: 30 },
        },
      ],
      metricDefinitionVersions: {
        timing: 1,
        filler: 1,
        pause: 1,
        semantic: 1,
      },
      approvedReferences: [],
      practiceGoalSetRef: null,
    },
    focusProfileSnapshot: null,
    capturedAt: createdAt,
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "첫 슬라이드",
        estimatedSeconds: 30,
        keywords: [],
        semanticCues: [],
      },
    ],
  });
  const rehearsalReport = rehearsalReportSchema.parse({
    reportId: `report-${runId}`,
    runId,
    projectId: "project-a",
    deckId: "deck-a",
    transcriptRetained: false,
    transcript: null,
    metrics: {
      durationSeconds: 45,
      wordsPerMinute: 100,
      fillerWordCount: 0,
      pauseCount: 0,
      keywordCoverage: 1,
    },
    semanticEvaluation: {
      state: "succeeded",
      measurementMode: "full",
      reasons: [],
      retryable: false,
    },
    semanticCueOutcomes: [],
    slideTimings: options.measured === false
      ? []
      : [{ slideId: "slide_1", targetSeconds: 30, actualSeconds: 45 }],
    coaching: null,
    generatedAt: createdAt,
  });
  return {
    run_id: runId,
    run_created_at: createdAt,
    evaluation_snapshot_json: evaluationSnapshot,
    rehearsal_report_json: rehearsalReport,
    pattern_key: patternKey,
  };
}

function createService(results: unknown[][]) {
  let index = 0;
  const dataSource = { query: vi.fn(async () => results[index++] ?? []) } as unknown as DataSource;
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project-a" })),
  } as unknown as ProjectsService;
  return new PracticeGoalsService(dataSource, projects);
}
