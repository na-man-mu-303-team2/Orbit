import { describe, expect, it, vi } from "vitest";

import { AddCommunityTemplateEngagement2026072105000 } from "./2026072105000-AddCommunityTemplateEngagement";

describe("AddCommunityTemplateEngagement migration", () => {
  it("creates constrained engagement tables and indexes", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    await new AddCommunityTemplateEngagement2026072105000().up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("community_template_likes");
    expect(sql).toContain("community_template_views");
    expect(sql).toContain("community_template_shares");
    expect(sql).toContain("community_template_comments");
    expect(sql).toContain("PRIMARY KEY (template_id, user_id, viewed_on)");
    expect(sql).toContain("body !~ '[[:cntrl:]]'");
    expect(sql).not.toContain("\\x00");
  });
});
