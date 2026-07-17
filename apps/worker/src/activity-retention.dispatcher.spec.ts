import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchDueActivityRetentionJobs,
  retentionJobId,
} from "./activity-retention.dispatcher";

describe("activity retention dispatcher", () => {
  it("creates deterministic common Jobs and dispatches due sessions", async () => {
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes("WITH expired_sessions")) return [];
      if (sql.includes("WHERE raw_responses_delete_after")) {
        return [{ project_id: "project_1", session_id: "session_1" }];
      }
      return [];
    });
    const query = vi.fn(async () => []);
    const dataSource = {
      query,
      transaction: vi.fn(async (work) => work({ query: managerQuery })),
    } as unknown as DataSource;
    const enqueue = vi.fn(async () => undefined);

    const result = await dispatchDueActivityRetentionJobs(
      dataSource,
      enqueue,
      new Date("2026-10-15T00:00:00.000Z"),
    );

    expect(result).toEqual({
      scanned: 1,
      dispatched: 1,
      failed: 0,
      normalizedExpired: 0,
    });
    expect(enqueue).toHaveBeenCalledWith({
      jobId: retentionJobId("session_1"),
      projectId: "project_1",
      presentationSessionId: "session_1",
    });
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes("FOR UPDATE SKIP LOCKED"),
      ),
    ).toBe(true);
    expect(
      managerQuery.mock.calls.some(([sql]) =>
        String(sql).includes("activity-response-retention"),
      ),
    ).toBe(true);
  });

  it("marks enqueue failures retryable without logging payload content", async () => {
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes("WITH expired_sessions")) return [];
      return sql.includes("WHERE raw_responses_delete_after")
        ? [{ project_id: "project_1", session_id: "session_1" }]
        : [];
    });
    const query = vi.fn(async () => []);
    const dataSource = {
      query,
      transaction: vi.fn(async (work) => work({ query: managerQuery })),
    } as unknown as DataSource;

    const result = await dispatchDueActivityRetentionJobs(
      dataSource,
      vi.fn(async () => {
        throw new Error("queue unavailable");
      }),
    );

    expect(result).toEqual({
      scanned: 1,
      dispatched: 0,
      failed: 1,
      normalizedExpired: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE jobs"),
      expect.arrayContaining([
        retentionJobId("session_1"),
        expect.objectContaining({ retryable: true }),
      ]),
    );
  });

  it("normalizes naturally expired sessions before scanning retention deadlines", async () => {
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes("WITH expired_sessions")) {
        return [{
          project_id: "project_1",
          session_id: "session_expired",
          expires_at: "2026-07-17T00:00:00.000Z",
        }];
      }
      return [];
    });
    const dataSource = {
      query: vi.fn(),
      transaction: vi.fn(async (work) => work({ query: managerQuery })),
    } as unknown as DataSource;

    await expect(
      dispatchDueActivityRetentionJobs(dataSource, vi.fn(), new Date("2026-07-18T00:00:00.000Z")),
    ).resolves.toEqual({
      scanned: 0,
      dispatched: 0,
      failed: 0,
      normalizedExpired: 1,
    });

    const sql = managerQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("status = 'ended'");
    expect(sql).toContain("sessions.expires_at + interval '90 days'");
    expect(sql).toContain("UPDATE activity_runs AS runs");
    expect(sql).toContain("runs.status = 'open'");
  });
});
