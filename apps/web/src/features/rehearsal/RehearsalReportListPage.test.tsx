import type { PresentationRun, Project, RehearsalRun } from "@orbit/shared";
import { describe, expect, it } from "vitest";
import {
  buildProjectReportItems,
  getProjectReportHref,
} from "./RehearsalReportListPage";

const project = (projectId: string): Project => ({ createdAt: "2026-07-01T00:00:00.000Z", createdBy: "user_1", projectId, title: projectId, workspaceId: "workspace_1" });
const run = (runId: string, createdAt: string): RehearsalRun => ({
  analysisFinalizedAt: createdAt,
  analysisRevision: 1,
  audioFileId: null,
  createdAt,
  deckId: "deck_1",
  deckVersion: null,
  error: null,
  evaluationSnapshot: null,
  jobId: null,
  projectId: "project_1",
  rawAudioDeletedAt: null,
  runId,
  semanticEvaluationMode: "full",
  status: "succeeded",
  updatedAt: createdAt
});

const presentationRun = (
  runId: string,
  sessionId: string,
): PresentationRun => ({
  audioFileId: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  deckId: "deck_1",
  deckVersion: 1,
  detailedReport: null,
  endedAt: "2026-07-03T00:05:00.000Z",
  error: null,
  jobId: null,
  projectId: "project_1",
  recordingMode: "none",
  runId,
  sessionId,
  startedAt: "2026-07-03T00:00:00.000Z",
  status: "succeeded",
  updatedAt: "2026-07-03T00:05:00.000Z",
  voiceReport: null,
});

describe("buildProjectReportItems", () => {
  it("keeps only projects with reports and orders by the latest run", () => {
    const items = buildProjectReportItems([project("old"), project("empty"), project("new")], [
      { runs: [run("old-1", "2026-07-01T00:00:00.000Z")], total: 1 },
      { runs: [], total: 0 },
      { runs: [run("new-1", "2026-07-03T00:00:00.000Z"), run("new-0", "2026-07-02T00:00:00.000Z")], total: 2 }
    ]);
    expect(items.map((item) => item.project.projectId)).toEqual(["new", "old"]);
    expect(items[0].latestRun.runId).toBe("new-1");
    expect(items[0].totalCount).toBe(2);
  });

  it("routes a live presentation row to its integrated report", () => {
    expect(
      getProjectReportHref(
        "presentation",
        "project 1",
        presentationRun("run 1", "session 1"),
      ),
    ).toBe(
      "/presentation/project%201/report/session%201?runId=run%201",
    );
  });
});
