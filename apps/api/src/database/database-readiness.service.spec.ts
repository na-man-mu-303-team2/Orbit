import { ServiceUnavailableException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { DatabaseReadinessService } from "./database-readiness.service";

describe("DatabaseReadinessService", () => {
  it("rejects readiness when migrations are pending or required columns are missing", async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([]),
      showMigrations: vi.fn().mockResolvedValue(true)
    } as unknown as DataSource;
    const service = new DatabaseReadinessService(dataSource);

    await expect(service.assertReady()).rejects.toMatchObject({
      response: {
        code: "PROJECT_SCHEMA_NOT_READY",
        details: [
          "pending migrations",
          "missing column: project_members.is_pinned",
          "missing column: project_members.pinned_at",
          "missing column: projects.tags",
          "missing column: users.project_tags",
          "missing column: users.display_name"
        ]
      },
      status: 503
    });
  });

  it("reports ready only after migrations and every required column are present", async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([
        { table_name: "project_members", column_name: "is_pinned" },
        { table_name: "project_members", column_name: "pinned_at" },
        { table_name: "projects", column_name: "tags" },
        { table_name: "users", column_name: "project_tags" },
        { table_name: "users", column_name: "display_name" }
      ]),
      showMigrations: vi.fn().mockResolvedValue(false)
    } as unknown as DataSource;
    const service = new DatabaseReadinessService(dataSource);

    await expect(service.check()).resolves.toEqual({
      ready: true,
      pendingMigrations: false,
      missingColumns: []
    });
    await expect(service.assertReady()).resolves.toBeUndefined();
  });

  it("uses a service unavailable exception for schema drift", async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([]),
      showMigrations: vi.fn().mockResolvedValue(false)
    } as unknown as DataSource;
    const service = new DatabaseReadinessService(dataSource);

    await expect(service.assertReady()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
