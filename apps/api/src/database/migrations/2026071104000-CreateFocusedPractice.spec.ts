import { describe, expect, it, vi } from "vitest";
import { CreateFocusedPractice2026071104000 } from "./2026071104000-CreateFocusedPractice";

describe("CreateFocusedPractice migration", () => {
  it("creates tenant-safe lifecycle and one-active-attempt constraints", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateFocusedPractice2026071104000().up({ query } as never);
    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("uq_focused_attempt_non_terminal");
    expect(sql).toContain("FOREIGN KEY (project_id, source_goal_set_id)");
    expect(sql).not.toContain("transcript");
  });

  it("drops attempts before sessions", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateFocusedPractice2026071104000().down({ query } as never);
    expect(query.mock.calls.map(([value]) => value)).toEqual([
      expect.stringContaining("uq_focused_attempt_non_terminal"),
      expect.stringContaining("focused_practice_attempts"),
      expect.stringContaining("focused_practice_sessions"),
    ]);
  });
});
