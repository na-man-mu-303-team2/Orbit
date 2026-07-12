import type { ProjectsService } from "../projects/projects.service";
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
        target_scope_json: { type: "slide", scopeId: "scope-1", slideId: "slide-1" },
        recommended_practice_mode: "focused",
        evidence_refs_json: [{ kind: "slide-timing", slideId: "slide-1", targetSeconds: 30, actualSeconds: 45 }],
        problem_label: "시간을 초과했습니다.",
        next_action: "핵심 문장만 말합니다.",
        success_condition: "30초 안에 마칩니다.",
        measurement_state: "measured",
        created_at: createdAt,
      }],
      [
        { pattern_key: "a".repeat(64), created_at: createdAt },
        { pattern_key: "a".repeat(64), created_at: "2026-07-10T00:00:00.000Z" },
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
});

function createService(results: unknown[][]) {
  let index = 0;
  const dataSource = { query: vi.fn(async () => results[index++] ?? []) } as unknown as DataSource;
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project-a" })),
  } as unknown as ProjectsService;
  return new PracticeGoalsService(dataSource, projects);
}
