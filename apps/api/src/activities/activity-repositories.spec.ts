import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { ActivityResponseRepository } from "./activity-response.repository";
import { ActivityRunRepository } from "./activity-run.repository";

describe("Activity SQL returning projections", () => {
  it("wraps run status UPDATE RETURNING in a SELECT-shaped CTE", async () => {
    const query = vi.fn().mockResolvedValue([{ activity_run_id: "activity_run_1" }]);
    const repository = new ActivityRunRepository({} as DataSource);

    await repository.updateStatus(
      { query } as unknown as EntityManager,
      "activity_run_1",
      "open",
      new Date("2026-07-17T00:00:00.000Z")
    );

    expect(query.mock.calls[0]?.[0]).toContain("WITH updated AS");
    expect(query.mock.calls[0]?.[0]).toContain("SELECT * FROM updated");
  });

  it("reads a scalar run revision from a SELECT-shaped CTE", async () => {
    const query = vi.fn().mockResolvedValue([{ revision: 3 }]);
    const repository = new ActivityResponseRepository({} as DataSource);

    await expect(
      repository.bumpRunRevision(
        { query } as unknown as EntityManager,
        "activity_run_1",
        true,
        new Date("2026-07-17T00:00:00.000Z")
      )
    ).resolves.toBe(3);
    expect(query.mock.calls[0]?.[0]).toContain("SELECT revision FROM updated");
  });
});
