import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { processActivityResponseRetentionJob } from "./activity-retention.processor";

const payload = {
  jobId: "job_activity_retention_session_1",
  projectId: "project_1",
  presentationSessionId: "session_1",
};

describe("processActivityResponseRetentionJob", () => {
  it("persists anonymous aggregates before deleting raw responses", async () => {
    const fixture = retentionDataSource();

    const job = await processActivityResponseRetentionJob(
      fixture.dataSource,
      payload,
      new Date("2026-10-15T00:00:00.000Z"),
    );

    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({
      outcome: "retained-aggregate",
      snapshotCount: 1,
      deletedResponseCount: 1,
    });
    const statements = fixture.managerQuery.mock.calls.map(([sql]) => String(sql));
    expect(statements.findIndex((sql) => sql.includes("INSERT INTO activity_result_snapshots")))
      .toBeLessThan(statements.findIndex((sql) => sql.includes("DELETE FROM activity_responses")));
    expect(
      statements.findIndex((sql) => sql.includes("INSERT INTO activity_result_snapshots")),
    ).toBeLessThan(
      statements.findIndex((sql) => sql.includes("DELETE FROM presentation_session_audiences")),
    );
    const snapshotCall = fixture.managerQuery.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO activity_result_snapshots"),
    );
    const serialized = JSON.stringify(snapshotCall?.[1]?.[4]);
    expect(serialized).not.toContain("APPROVED_TEXT");
    expect(serialized).not.toContain("RAW_RESPONSE_SENTINEL");
    expect(serialized).not.toContain("PRIVATE_NAME_SENTINEL");
    expect(snapshotCall?.[1]?.[4]).toMatchObject({
      participantCount: 2,
      responseRate: 50,
      textEntries: [],
    });
    expect(statements.some((sql) => sql.includes("FROM activity_text_entries"))).toBe(false);
  });

  it("rolls back before raw deletion and succeeds on retry", async () => {
    const fixture = retentionDataSource({ failSnapshotOnce: true });

    await expect(
      processActivityResponseRetentionJob(fixture.dataSource, payload),
    ).rejects.toThrow("snapshot unavailable");
    expect(
      fixture.managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes("DELETE FROM activity_responses"),
      ),
    ).toBe(false);

    const retried = await processActivityResponseRetentionJob(
      fixture.dataSource,
      payload,
    );
    expect(retried).toMatchObject({
      status: "succeeded",
      result: { outcome: "retained-aggregate" },
    });
  });

  it.each([
    ["owner-deleted", { resultsDeleted: true }],
    ["already-retained", { rawDeleted: true }],
  ] as const)("is idempotent for %s sessions", async (outcome, options) => {
    const fixture = retentionDataSource(options);
    const job = await processActivityResponseRetentionJob(
      fixture.dataSource,
      payload,
    );

    expect(job.result).toMatchObject({ outcome, snapshotCount: 0 });
    expect(
      fixture.managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes("DELETE FROM activity_responses"),
      ),
    ).toBe(false);
  });
});

function retentionDataSource(
  options: {
    failSnapshotOnce?: boolean;
    rawDeleted?: boolean;
    resultsDeleted?: boolean;
  } = {},
) {
  let failSnapshot = options.failSnapshotOnce ?? false;
  const managerQuery = vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes("FROM presentation_sessions")) {
      return [{
        raw_responses_deleted_at: options.rawDeleted
          ? "2026-10-15T00:00:00.000Z"
          : null,
        results_deleted_at: options.resultsDeleted
          ? "2026-09-01T00:00:00.000Z"
          : null,
        participant_count: 2,
      }];
    }
    if (sql.includes("FROM activity_runs")) return [runRow()];
    if (sql.includes("SELECT answers_json")) {
      return [{
        answers_json: [
          { questionId: "question_rating", type: "rating", value: 5 },
          {
            questionId: "question_text",
            type: "free-text",
            text: "RAW_RESPONSE_SENTINEL",
          },
        ],
      }];
    }
    if (sql.includes("FROM activity_text_entries")) {
      return [{
        entry_id: "activity_text_approved",
        question_id: "question_text",
        text_value: "APPROVED_TEXT",
        answered_at: null,
        updated_at: "2026-07-17T00:05:00.000Z",
      }];
    }
    if (sql.includes("INSERT INTO activity_result_snapshots") && failSnapshot) {
      failSnapshot = false;
      throw new Error("snapshot unavailable");
    }
    if (sql.includes("DELETE FROM activity_responses")) {
      return [{ response_id: "activity_response_1" }];
    }
    return [];
  });
  const query = vi.fn(async (_sql: string, params: unknown[]) => [
    jobRow(params[1] as "running" | "succeeded" | "failed", params[4], params[5]),
  ]);
  const dataSource = {
    query,
    transaction: vi.fn(async (work) => work({ query: managerQuery })),
  } as unknown as DataSource;
  return { dataSource, managerQuery, query };
}

function runRow() {
  return {
    activity_run_id: "activity_run_1",
    activity_id: "activity_1",
    definition_snapshot: {
      activityId: "activity_1",
      template: "satisfaction",
      title: "만족도",
      description: "",
      questions: [
        {
          questionId: "question_rating",
          type: "rating",
          prompt: "평점",
          required: true,
          leftLabel: "낮음",
          rightLabel: "높음",
        },
        {
          questionId: "question_text",
          type: "free-text",
          prompt: "의견",
          required: false,
        },
      ],
      allowDisplayName: true,
      hideResultsUntilReveal: true,
    },
    status: "closed",
    revision: 4,
    response_count: 1,
  };
}

function jobRow(status: string, result: unknown, error: unknown) {
  return {
    job_id: payload.jobId,
    project_id: payload.projectId,
    type: "activity-response-retention",
    status,
    progress: status === "succeeded" ? 100 : 10,
    message: status,
    result,
    error,
    created_at: "2026-07-17T00:00:00.000Z",
    updated_at: "2026-10-15T00:00:00.000Z",
  };
}
