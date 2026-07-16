import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { PresentationSessionRepository } from "./presentation-session.repository";

describe("PresentationSessionRepository", () => {
  it("qualifies session columns in the audience project join", async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new PresentationSessionRepository({ query } as unknown as DataSource);

    await repository.findAudienceInfo("session_1");

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("sessions.project_id");
    expect(sql).toContain("projects.title AS project_title");
    expect(sql).toContain("WHERE sessions.session_id = $1");
  });
});
