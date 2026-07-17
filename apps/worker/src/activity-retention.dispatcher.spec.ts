import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchDueActivityRetentionJobs,
  retentionJobId,
} from "./activity-retention.dispatcher";

describe("activity retention dispatcher", () => {
  it("creates deterministic common Jobs and dispatches due sessions", async () => {
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.includes("FROM presentation_sessions")) {
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

    expect(result).toEqual({ scanned: 1, dispatched: 1, failed: 0 });
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
    const managerQuery = vi.fn(async (sql: string) =>
      sql.includes("FROM presentation_sessions")
        ? [{ project_id: "project_1", session_id: "session_1" }]
        : [],
    );
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

    expect(result).toEqual({ scanned: 1, dispatched: 0, failed: 1 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE jobs"),
      expect.arrayContaining([
        retentionJobId("session_1"),
        expect.objectContaining({ retryable: true }),
      ]),
    );
  });
});
