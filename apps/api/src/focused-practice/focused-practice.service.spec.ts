import type { FocusedPracticeAttempt } from "@orbit/shared";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { FilesService } from "../files/files.service";
import type { JobsService } from "../jobs/jobs.service";
import type { ProjectsService } from "../projects/projects.service";
import { deriveStabilization, FocusedPracticeService } from "./focused-practice.service";
import { focusedPracticeSentenceSnapshotHash } from "./focused-practice-target";

vi.mock("@orbit/config", () => ({
  loadOrbitConfig: () => ({ JOB_QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://localhost:6379", ADAPTIVE_REHEARSAL_COACH_ENABLED: true, FOCUSED_PRACTICE_ENABLED: true, ADAPTIVE_COACHING_PROJECT_ALLOWLIST: ["*"] }),
  isAdaptiveCoachingProjectAllowed: () => true,
}));

describe("FocusedPracticeService", () => {
  it("creates an idempotent session only from final goals sharing one target scope", async () => {
    let queryIndex = 0;
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
      queryIndex += 1;
      if (queryIndex === 1) return [];
      if (queryIndex === 2) return [{
        deck_id: "deck_a",
        analysis_state: "final",
        goal_set_id: "goalset-a",
        evaluation_snapshot_json: evaluationSnapshot(),
        goals: [{
          goal_id: "goal-a",
          target_scope_json: { type: "slide", scopeId: "scope-a", slideId: "slide_a" },
          measurement_state: "measured",
          criterion_ref_json: { criterionId: "criterion-a", revision: 1 },
        }],
      }];
      if (queryIndex === 3) return [{ deck_json: currentDeck() }];
      if (queryIndex === 4) return [{ practice_session_id: "practice-created" }];
      return [];
    });
    const dataSource = {
      transaction: vi.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })),
    } as unknown as DataSource;
    const service = createService(dataSource);

    const result = await service.createSession("project-a", "user-a", {
      clientRequestId: "request-123",
      sourceFullRunId: "run-a",
      sourceGoalSetId: "goalset-a",
      goalIds: ["goal-a"],
      targetScope: { type: "slide", scopeId: "scope-a", slideId: "slide_a" },
    });

    expect(result.session.status).toBe("active");
    expect(query.mock.calls[3]?.[0]).toContain("INSERT INTO focused_practice_sessions");
  });

  it("returns the existing session when concurrent idempotent creation collides", async () => {
    let queryIndex = 0;
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
      queryIndex += 1;
      if (queryIndex === 1) return [];
      if (queryIndex === 2) return [{
        deck_id: "deck_a",
        analysis_state: "final",
        goal_set_id: "goalset-a",
        evaluation_snapshot_json: evaluationSnapshot(),
        goals: [{
          goal_id: "goal-a",
          target_scope_json: { type: "slide", scopeId: "scope-a", slideId: "slide_a" },
          measurement_state: "measured",
          criterion_ref_json: { criterionId: "criterion-a", revision: 1 },
        }],
      }];
      if (queryIndex === 3) return [{ deck_json: currentDeck() }];
      if (queryIndex === 4) return [];
      return [focusedSessionRow()];
    });
    const dataSource = {
      transaction: vi.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })),
    } as unknown as DataSource;
    const service = createService(dataSource);

    await expect(service.createSession("project-a", "user-a", {
      clientRequestId: "request-concurrent-a",
      sourceFullRunId: "run-a",
      sourceGoalSetId: "goalset-a",
      goalIds: ["goal-a"],
      targetScope: { type: "slide", scopeId: "scope-a", slideId: "slide_a" },
    })).resolves.toMatchObject({ session: { practiceSessionId: "practice-existing" } });
  });

  it("marks an existing sentence session stale when the current sentence changes", async () => {
    const row = focusedSessionRow() as Record<string, any>;
    row.target_scope_json = {
      type: "sentence",
      scopeId: "scope-sentence",
      slideId: "slide_a",
      sentenceIndex: 0,
      textSnapshotHash: focusedPracticeSentenceSnapshotHash("연습 문장"),
    };
    let queryIndex = 0;
    const query = vi.fn(async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> => {
      queryIndex += 1;
      if (queryIndex === 1) return [row];
      if (queryIndex === 2) return [{
        evaluation_snapshot_json: evaluationSnapshot(),
        deck_json: currentDeck("수정된 문장"),
      }];
      return [];
    });
    const dataSource = { query } as unknown as DataSource;

    await expect(createService(dataSource).getSession("practice-existing", "user-a"))
      .resolves.toMatchObject({ session: { compatibilityState: "stale" } });
    expect(query.mock.calls[2]?.[0]).toContain("compatibility_state = 'stale'");
  });

  it("requires adjacent measured passes for stabilization and does not complete the session", () => {
    const attempts = [attempt(1, "passed"), attempt(2, "unmeasured"), attempt(3, "passed")];
    expect(deriveStabilization(attempts)).toEqual([{ goalId: "goal-a", stabilized: false }]);
    expect(deriveStabilization([attempt(1, "passed"), attempt(2, "passed")])).toEqual([
      { goalId: "goal-a", stabilized: true },
    ]);
    const failed = attempt(2, "unmeasured");
    failed.status = "failed";
    failed.goalOutcomes = [];
    expect(deriveStabilization([attempt(1, "passed"), failed, attempt(3, "passed")])).toEqual([
      { goalId: "goal-a", stabilized: false },
    ]);
  });
});

function createService(dataSource: DataSource) {
  return new FocusedPracticeService(
    dataSource,
    { assertCanReadProject: vi.fn(async () => ({})), assertCanWriteProject: vi.fn(async () => ({})) } as unknown as ProjectsService,
    {} as FilesService,
    {} as JobsService,
  );
}

function attempt(number: number, outcome: "passed" | "unmeasured"): FocusedPracticeAttempt {
  return {
    attemptId: `attempt-${number}`, projectId: "project-a", practiceSessionId: "practice-a",
    attemptNumber: number, status: "succeeded", result: outcome === "passed" ? "passed" : "unmeasured",
    audioFileId: null, analysisJobId: null, cleanupState: "deleted", cleanupGeneration: 1,
    rawAudioDeletedAt: null, rawAudioDeleteDeadlineAt: "2026-07-11T00:30:00.000Z",
    durationMs: 1000, slideTimeline: [], goalOutcomes: [{
      goalId: "goal-a", criterionRef: { criterionId: "criterion-a", revision: 1 },
      measurementState: outcome === "passed" ? "measured" : "unmeasured",
      outcome, observation: outcome === "passed" ? { kind: "duration-seconds", value: 1 } : { kind: "none" },
      threshold: outcome === "passed" ? { kind: "max-duration-seconds", value: 2 } : { kind: "none" },
      reasonCode: outcome === "passed" ? "PASSED" : "EVALUATION_UNAVAILABLE",
    }], errorCode: null, createdAt: "2026-07-11T00:00:00.000Z", completedAt: "2026-07-11T00:01:00.000Z",
  };
}
function focusedSessionRow() {
  return {
    practice_session_id: "practice-existing", project_id: "project-a", deck_id: "deck_a",
    source_full_run_id: "run-a", source_goal_set_id: "goalset-a", goal_ids_json: ["goal-a"],
    target_scope_json: { type: "slide", scopeId: "scope-a", slideId: "slide_a" },
    snapshot_json: {
      deckVersion: 2, briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "general-novice", revision: 1 },
      criterionRefs: [{ criterionId: "criterion-a", revision: 1 }],
    },
    compatibility_state: "current", status: "active", data_origin: "live", created_by: "user-a",
    created_at: "2026-07-12T00:00:00.000Z", completed_at: null,
  };
}

function evaluationSnapshot() {
  return {
    deckId: "deck_a",
    deckVersion: 2,
    deckContentHash: null,
    evaluationPlan: {
      planVersion: 1,
      briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "general-novice", revision: 1 },
      targetDurationSeconds: 60,
      criteria: [],
      metricDefinitionVersions: { timing: 1, filler: 1, pause: 1, semantic: 1 },
      approvedReferences: [],
      practiceGoalSetRef: null,
    },
    focusProfileSnapshot: null,
    capturedAt: "2026-07-12T00:00:00.000Z",
    slides: [{
      slideId: "slide_a",
      order: 1,
      title: "Slide A",
      estimatedSeconds: 30,
      keywords: [],
      semanticCues: [],
    }],
  };
}

function currentDeck(speakerNotes = "연습 문장") {
  return {
    deckId: "deck_a",
    projectId: "project-a",
    title: "Deck A",
    version: 2,
    canvas: { preset: "wide-16-9", width: 1920, height: 1080, aspectRatio: "16:9" },
    slides: [{ slideId: "slide_a", order: 1, title: "Slide A", style: {}, speakerNotes }],
  };
}
