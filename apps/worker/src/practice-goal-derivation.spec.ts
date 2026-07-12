import {
  rehearsalEvaluationSnapshotSchema,
  rehearsalReportSchema
} from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";

import {
  derivePracticeGoalSet,
  persistPracticeGoalSet,
  persistSourceGoalResolutions
} from "./practice-goal-derivation";

describe("practice goal derivation", () => {
  it("selects a deterministic lens-ordered Top 3 and creates a new immutable revision", () => {
    const first = derivePracticeGoalSet({
      projectId: "project-a",
      sourceFullRunId: "run-a",
      sourceAnalysisRevision: 1,
      snapshot: snapshot(),
      report: report(true)
    });
    const repeated = derivePracticeGoalSet({
      projectId: "project-a",
      sourceFullRunId: "run-a",
      sourceAnalysisRevision: 1,
      snapshot: snapshot(),
      report: report(true)
    });
    const recovered = derivePracticeGoalSet({
      projectId: "project-a",
      sourceFullRunId: "run-a",
      sourceAnalysisRevision: 2,
      snapshot: snapshot(),
      report: report(false)
    });

    expect(first).toEqual(repeated);
    expect(first?.analysisState).toBe("partial");
    expect(first?.goals).toHaveLength(3);
    expect(first?.goals.map((goal) => goal.category)).toEqual([
      "semantic",
      "timing",
      "delivery"
    ]);
    expect(first?.goals.map((goal) => goal.priority)).toEqual([1, 2, 3]);
    expect(recovered?.analysisState).toBe("final");
    expect(recovered?.revision).toBe(2);
    expect(recovered?.goalSetId).not.toBe(first?.goalSetId);
  });

  it("creates fallback practice goals when the report has no failing candidates", () => {
    const set = derivePracticeGoalSet({
      projectId: "project-a",
      sourceFullRunId: "run-a",
      sourceAnalysisRevision: 1,
      snapshot: snapshot(),
      report: passingReport()
    });

    expect(set?.analysisState).toBe("final");
    expect(set?.goals).toHaveLength(3);
    expect(set?.goals[0]).toMatchObject({
      category: "semantic",
      recommendedPracticeMode: "focused",
      targetScope: { type: "slide", slideId: "slide_1" },
      measurementState: "measured"
    });
    expect(set?.goals[0]?.problemLabel).toContain("다음 리허설");
  });

  it("persists the immutable set before advancing the current head with revision CAS", async () => {
    const set = derivePracticeGoalSet({
      projectId: "project-a",
      sourceFullRunId: "run-a",
      sourceAnalysisRevision: 1,
      snapshot: snapshot(),
      report: report(true)
    });
    if (!set) throw new Error("Expected a goal set.");
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => []);
    const dataSource = {
      transaction: vi.fn(async (callback: (manager: { query: typeof query }) => unknown) =>
        callback({ query }))
    };

    await persistPracticeGoalSet(dataSource as never, set);

    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[0]?.[0]).toContain("INSERT INTO practice_goal_sets");
    expect(query.mock.calls.at(-1)?.[0]).toContain(
      "practice_goal_heads.current_analysis_revision < EXCLUDED.current_analysis_revision"
    );
  });

  it("creates idempotent bounded resolutions only for terminal full-run facts", async () => {
    const sourceSnapshot = snapshot("goalset_source");
    let queryCount = 0;
    const query = vi.fn(
      async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> =>
        queryCount++ === 0 ? [
        {
          goal_id: "goal_source",
          origin_full_run_id: "run-source",
          criterion_ref_json: {
            criterionId: "criterion_system_filler_v1",
            revision: 1
          },
          target_scope_json: null,
          category: "delivery"
        }
      ] : []
    );

    const resolutions = await persistSourceGoalResolutions(
      { query } as never,
      {
        projectId: "project-a",
        evaluatedFullRunId: "run-a",
        snapshot: sourceSnapshot,
        report: report(false)
      }
    );

    expect(resolutions).toMatchObject([
      {
        goalId: "goal_source",
        status: "repeated",
        measurementState: "measured",
        observation: { kind: "count", metric: "filler-word-count", value: 4 },
        reasonCode: "FAILED"
      }
    ]);
    expect(query.mock.calls[1]?.[0]).toContain(
      "ON CONFLICT (goal_id, evaluated_full_run_id) DO NOTHING"
    );
  });
});

function snapshot(sourceGoalSetId: string | null = null) {
  return rehearsalEvaluationSnapshotSchema.parse({
    deckId: "deck-a",
    deckVersion: 3,
    deckContentHash: "a".repeat(64),
    capturedAt: "2026-07-11T00:00:00.000Z",
    evaluationPlan: {
      planVersion: 1,
      briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "decision-maker", revision: 1 },
      targetDurationSeconds: 60,
      criteria: [
        {
          criterionId: "criterion_cue_scue_1_r1",
          revision: 1,
          category: "semantic",
          source: "deck-cue",
          scope: { type: "slide", slideId: "slide_1" },
          label: "핵심 가치",
          measurement: {
            type: "semantic-coverage",
            expectedConceptIds: ["concept_value"]
          }
        },
        {
          criterionId: "criterion_timing_slide_1",
          revision: 1,
          category: "timing",
          source: "system",
          scope: { type: "slide", slideId: "slide_1" },
          label: "첫 장 목표 시간",
          measurement: { type: "max-duration-seconds", maximum: 30 }
        },
        {
          criterionId: "criterion_system_filler_v1",
          revision: 1,
          category: "delivery",
          source: "system",
          scope: { type: "run" },
          label: "반복 말버릇",
          measurement: {
            type: "max-count",
            metric: "filler-word-count",
            maximum: 1
          }
        }
      ],
      metricDefinitionVersions: { timing: 1, filler: 1, pause: 1, semantic: 1 },
      approvedReferences: [],
      practiceGoalSetRef: sourceGoalSetId
        ? { goalSetId: sourceGoalSetId, revision: 1 }
        : null
    },
    slides: [
      {
        slideId: "slide_1",
        order: 1,
        title: "첫 장",
        estimatedSeconds: 30,
        keywords: [],
        semanticCues: [
          {
            cueId: "scue_1",
            slideId: "slide_1",
            meaning: "핵심 가치",
            importance: "core",
            reviewStatus: "approved",
            freshness: "current",
            origin: "manual",
            revision: 1,
            required: true,
            priority: 1,
            candidateKeywords: ["가치"],
            aliases: {},
            requiredConcepts: ["가치"],
            nliHypotheses: ["발표자는 가치를 설명했다"],
            negativeHints: [],
            targetElementIds: [],
            triggerActionIds: []
          }
        ]
      }
    ]
  });
}

function report(retryable: boolean) {
  return rehearsalReportSchema.parse({
    reportId: "report_run-a",
    runId: "run-a",
    projectId: "project-a",
    deckId: "deck-a",
    transcriptRetained: false,
    transcript: null,
    metrics: {
      durationSeconds: 45,
      wordsPerMinute: 120,
      fillerWordCount: 4,
      pauseCount: 0,
      keywordCoverage: 0.5
    },
    semanticEvaluation: {
      state: retryable ? "partial" : "succeeded",
      measurementMode: "full",
      reasons: retryable ? ["timeout"] : [],
      retryable
    },
    semanticCueOutcomes: [
      {
        slideId: "slide_1",
        cueId: "scue_1",
        cueRevision: 1,
        cueMeaningSnapshot: "핵심 가치",
        reportLabelSnapshot: "핵심 가치",
        importance: "core",
        status: "missed",
        measurementMode: "full",
        fallbackUsed: false,
        coveredConcepts: [],
        missingConcepts: ["가치"]
      }
    ],
    slideTimings: [{ slideId: "slide_1", targetSeconds: 30, actualSeconds: 45 }],
    coaching: null,
    generatedAt: "2026-07-11T00:01:00.000Z"
  });
}

function passingReport() {
  return rehearsalReportSchema.parse({
    ...report(false),
    metrics: {
      durationSeconds: 28,
      wordsPerMinute: 120,
      fillerWordCount: 0,
      pauseCount: 0,
      keywordCoverage: 1
    },
    semanticCueOutcomes: [
      {
        slideId: "slide_1",
        cueId: "scue_1",
        cueRevision: 1,
        cueMeaningSnapshot: "핵심 가치",
        reportLabelSnapshot: "핵심 가치",
        importance: "core",
        status: "covered",
        measurementMode: "full",
        fallbackUsed: false,
        coveredConcepts: ["가치"],
        missingConcepts: []
      }
    ],
    slideTimings: [{ slideId: "slide_1", targetSeconds: 30, actualSeconds: 20 }]
  });
}
