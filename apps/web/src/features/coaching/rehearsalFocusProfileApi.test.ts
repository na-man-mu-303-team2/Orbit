import type { RehearsalFocusProfile } from "@orbit/shared";
import { describe, expect, it, vi } from "vitest";

import {
  fetchRehearsalFocusProfile,
  putRehearsalFocusProfile,
  RehearsalFocusProfileConflictError,
} from "./rehearsalFocusProfileApi";

const profile: RehearsalFocusProfile = {
  profileId: "focus_profile_1",
  projectId: "project_1",
  revision: 3,
  items: [
    {
      focusItemId: "focus_item_1",
      priority: 1,
      kind: "opening",
      label: "도입부에서 발표 목적 먼저 말하기",
      targetScope: null,
    },
  ],
  createdBy: "owner_1",
  updatedBy: "editor_1",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T01:00:00.000Z",
};

describe("rehearsal focus profile API", () => {
  it("loads the current project profile through the shared schema", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ profile }), { status: 200 }),
    );

    await expect(
      fetchRehearsalFocusProfile("project_1", fetcher),
    ).resolves.toEqual(profile);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/rehearsal-focus-profile",
      { credentials: "include" },
    );
  });

  it("sends the expected revision and normalized items when saving", async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ profile }), { status: 200 }),
    );

    await expect(
      putRehearsalFocusProfile(
        "project_1",
        { expectedRevision: 2, items: profile.items },
        fetcher,
      ),
    ).resolves.toEqual(profile);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project_1/rehearsal-focus-profile",
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({ expectedRevision: 2, items: profile.items }),
      }),
    );
  });

  it("keeps the latest server profile in a dedicated conflict error", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT",
            expectedRevision: 2,
            actualRevision: 3,
            currentProfile: profile,
          }),
          { status: 409 },
        ),
    );

    const promise = putRehearsalFocusProfile(
      "project_1",
      { expectedRevision: 2, items: profile.items },
      fetcher,
    );

    await expect(promise).rejects.toBeInstanceOf(
      RehearsalFocusProfileConflictError,
    );
    await expect(promise).rejects.toMatchObject({
      actualRevision: 3,
      currentProfile: profile,
    });
  });
});
