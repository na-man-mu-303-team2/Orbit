import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { deleteExpiredSlidePracticeData } from "./slide-practice-retention";

describe("deleteExpiredSlidePracticeData", () => {
  it("deletes expired analysis metadata only after raw audio cleanup", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("slide_practice_audio_analyses")) return [{ analysis_id: "analysis-a" }];
      if (sql.includes("slide_practice_reports")) return [{ report_id: "report-a" }];
      return [];
    });
    const dataSource = {
      transaction: vi.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query })),
    } as unknown as DataSource;

    const deleted = await deleteExpiredSlidePracticeData(dataSource);

    expect(query.mock.calls[0]?.[0]).toContain("raw_audio_deleted_at IS NOT NULL");
    expect(deleted).toEqual({ analysisCount: 1, reportCount: 1, baselineCount: 0 });
  });
});
