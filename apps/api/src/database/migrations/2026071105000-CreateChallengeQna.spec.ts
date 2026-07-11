import { describe, expect, it, vi } from "vitest";
import { CreateChallengeQna2026071105000 } from "./2026071105000-CreateChallengeQna";

describe("CreateChallengeQna migration", () => {
  it("creates frozen sessions, immutable questions, monotonic assistance, and private attempts", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateChallengeQna2026071105000().up({ query } as never);
    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("CREATE TABLE challenge_qna_sessions");
    expect(sql).toContain("CREATE TABLE challenge_qna_questions");
    expect(sql).toContain("CREATE TABLE challenge_qna_assistance");
    expect(sql).toContain("CREATE TABLE challenge_qna_answer_attempts");
    expect(sql).toContain("uq_qna_answer_non_terminal");
  });

  it("drops Q&A tables in dependency order", async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new CreateChallengeQna2026071105000().down({ query } as never);
    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql.indexOf("challenge_qna_answer_attempts")).toBeLessThan(sql.indexOf("challenge_qna_sessions"));
  });
});
