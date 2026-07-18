import { describe, expect, it, vi } from "vitest";

import { AddProjectMemberPins2026071801000 } from "./2026071801000-AddProjectMemberPins";

describe("AddProjectMemberPins migration", () => {
  it("adds a non-null project member pin flag with a safe default", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new AddProjectMemberPins2026071801000().up({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain(
      "is_pinned boolean NOT NULL DEFAULT false",
    );
  });

  it("removes the project member pin flag", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new AddProjectMemberPins2026071801000().down({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain("DROP COLUMN is_pinned");
  });
});
