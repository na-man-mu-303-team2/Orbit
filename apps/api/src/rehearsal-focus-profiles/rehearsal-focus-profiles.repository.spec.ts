import type { RehearsalFocusItem } from "@orbit/shared";
import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { RehearsalFocusProfilesRepository } from "./rehearsal-focus-profiles.repository";

const currentItems: RehearsalFocusItem[] = [
  {
    focusItemId: "focus_item_1",
    priority: 1,
    kind: "opening",
    label: "도입부에서 발표 목적 먼저 말하기",
    targetScope: null,
  },
];

const currentRow = {
  profile_id: "focus_profile_1",
  project_id: "project_1",
  revision: 2,
  items_json: currentItems,
  created_by: "owner_1",
  updated_by: "owner_1",
  created_at: new Date("2026-07-13T00:00:00.000Z"),
  updated_at: new Date("2026-07-13T00:30:00.000Z"),
};

describe("RehearsalFocusProfilesRepository", () => {
  it("locks the project row before updating the expected revision", async () => {
    const queries: string[] = [];
    const manager = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes("SELECT project_id FROM projects"))
          return [{ project_id: "project_1" }];
        if (sql.includes("SELECT * FROM rehearsal_focus_profiles"))
          return [currentRow];
        return [];
      }),
    } as unknown as EntityManager;
    const repository = new RehearsalFocusProfilesRepository(
      dataSource(manager),
    );

    const result = await repository.save("project_1", "editor_1", {
      expectedRevision: 2,
      items: currentRow.items_json,
    });

    expect(result).toMatchObject({
      status: "saved",
      profile: {
        profileId: "focus_profile_1",
        revision: 3,
        updatedBy: "editor_1",
      },
    });
    expect(queries[0]).toContain("SELECT project_id FROM projects");
    expect(queries[1]).toContain("FOR UPDATE");
    expect(queries[2]).toContain("INSERT INTO rehearsal_focus_profiles");
    expect(queries[2]).toContain("$4::jsonb");
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO rehearsal_focus_profiles"),
      expect.arrayContaining([JSON.stringify(currentItems)]),
    );
  });

  it("returns the current profile without writing when the revision is stale", async () => {
    const manager = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT project_id FROM projects"))
          return [{ project_id: "project_1" }];
        if (sql.includes("SELECT * FROM rehearsal_focus_profiles"))
          return [currentRow];
        return [];
      }),
    } as unknown as EntityManager;
    const repository = new RehearsalFocusProfilesRepository(
      dataSource(manager),
    );

    await expect(
      repository.save("project_1", "editor_1", {
        expectedRevision: 1,
        items: currentRow.items_json,
      }),
    ).resolves.toEqual({
      status: "conflict",
      currentProfile: expect.objectContaining({ revision: 2 }),
    });
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
});

function dataSource(manager: EntityManager) {
  return {
    transaction: vi.fn(async (work: (value: EntityManager) => unknown) =>
      work(manager),
    ),
  } as unknown as DataSource;
}
