import { describe, expect, it, vi } from "vitest";

import { CreateActivityRuntime2026071702000 } from "./2026071702000-CreateActivityRuntime";

describe("CreateActivityRuntime migration", () => {
  it("creates tenant-safe runtime tables and partial uniqueness constraints", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new CreateActivityRuntime2026071702000().up({ query } as never);

    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("CREATE TABLE activity_runs");
    expect(sql).toContain("FOREIGN KEY (project_id, session_id)");
    expect(sql).toContain("uq_activity_runs_current");
    expect(sql).toContain("uq_activity_runs_one_open_per_session");
    expect(sql).toContain("uq_activity_responses_run_audience");
    expect(sql).toContain("uq_activity_text_entries_response_question");
    expect(sql).toContain("fk_presentation_sessions_active_activity_run");
  });

  it("drops the circular session foreign key before child tables", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new CreateActivityRuntime2026071702000().down({ query } as never);

    const statements = query.mock.calls.map(([value]) => value);
    expect(statements[0]).toContain("fk_presentation_sessions_active_activity_run");
    expect(statements.at(-1)).toContain("DROP TABLE IF EXISTS activity_runs");
  });
});
