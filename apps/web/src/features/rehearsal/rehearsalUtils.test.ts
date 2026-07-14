import { describe, expect, it } from "vitest";
import type { RehearsalRun } from "@orbit/shared";
import {
  getRehearsalRunNumber,
  sortRehearsalRunsByCreatedAt,
} from "./rehearsalUtils";

function runFixture(
  runId: string,
  createdAt: string,
  status: RehearsalRun["status"] = "succeeded",
): RehearsalRun {
  return {
    runId,
    projectId: "project-a",
    deckId: "deck-a",
    audioFileId: null,
    jobId: null,
    deckVersion: null,
    evaluationSnapshot: null,
    semanticEvaluationMode: "full",
    status,
    error: null,
    createdAt,
    updatedAt: createdAt,
    rawAudioDeletedAt: null,
  };
}

describe("rehearsalUtils", () => {
  it("sorts rehearsal runs chronologically", () => {
    const runs = [
      runFixture("run-3", "2026-07-03T00:00:00.000Z"),
      runFixture("run-1", "2026-07-01T00:00:00.000Z"),
      runFixture("run-2", "2026-07-02T00:00:00.000Z"),
    ];

    expect(sortRehearsalRunsByCreatedAt(runs).map((run) => run.runId)).toEqual([
      "run-1",
      "run-2",
      "run-3",
    ]);
  });

  it("calculates run number from chronological order", () => {
    const runs = [
      runFixture("run-3", "2026-07-03T00:00:00.000Z"),
      runFixture("run-1", "2026-07-01T00:00:00.000Z"),
      runFixture("run-2", "2026-07-02T00:00:00.000Z"),
    ];

    expect(getRehearsalRunNumber(runs, "run-1")).toBe(1);
    expect(getRehearsalRunNumber(runs, "run-2")).toBe(2);
    expect(getRehearsalRunNumber(runs, "run-3")).toBe(3);
    expect(getRehearsalRunNumber(runs, "run-unknown")).toBeNull();
  });
});
