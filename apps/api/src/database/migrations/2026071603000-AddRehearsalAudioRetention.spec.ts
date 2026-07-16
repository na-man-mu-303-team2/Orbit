import { describe, expect, it, vi } from "vitest";
import { AddRehearsalAudioRetention2026071603000 } from "./2026071603000-AddRehearsalAudioRetention";

describe("AddRehearsalAudioRetention migration", () => {
  it("adds and backfills the rehearsal audio retention deadline", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new AddRehearsalAudioRetention2026071603000().up({ query } as never);

    const sql = query.mock.calls.map(([value]) => value).join("\n");
    expect(sql).toContain("raw_audio_delete_deadline_at timestamptz");
    expect(sql).toContain("assets.uploaded_at + interval '14 days'");
    expect(sql).toContain("idx_rehearsal_runs_audio_delete_deadline");
  });

  it("removes the deadline column after its index", async () => {
    const query = vi.fn(async (_sql: string) => undefined);

    await new AddRehearsalAudioRetention2026071603000().down({ query } as never);

    expect(query.mock.calls[0]?.[0]).toContain("DROP INDEX");
    expect(query.mock.calls[1]?.[0]).toContain(
      "DROP COLUMN raw_audio_delete_deadline_at",
    );
  });
});
