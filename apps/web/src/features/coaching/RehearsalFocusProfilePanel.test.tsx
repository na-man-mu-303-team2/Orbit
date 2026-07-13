import type { RehearsalFocusItem, RehearsalFocusProfile } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  getFocusProfileHydrationAction,
  moveFocusItem,
  RehearsalFocusProfileEditor,
  shouldAutoRefetchFocusProfile,
} from "./RehearsalFocusProfilePanel";

const draftItems: RehearsalFocusItem[] = [
  {
    focusItemId: "focus_item_draft",
    priority: 1,
    kind: "custom",
    label: "내가 입력 중인 목표",
    targetScope: null,
  },
];

const latestProfile: RehearsalFocusProfile = {
  profileId: "focus_profile_1",
  projectId: "project_1",
  revision: 3,
  items: [
    {
      focusItemId: "focus_item_latest",
      priority: 1,
      kind: "opening",
      label: "서버에 먼저 저장된 최신 목표",
      targetScope: null,
    },
  ],
  createdBy: "owner_1",
  updatedBy: "editor_2",
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T01:00:00.000Z",
};

describe("RehearsalFocusProfileEditor", () => {
  it("keeps the draft visible while showing the latest conflict profile separately", () => {
    const html = renderToStaticMarkup(
      <RehearsalFocusProfileEditor
        conflictProfile={latestProfile}
        currentRevision={2}
        dirty
        draftItems={draftItems}
        error="다른 변경이 먼저 저장됐습니다."
        message=""
        onAdd={vi.fn()}
        onDiscard={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onSave={vi.fn()}
        onUpdate={vi.fn()}
        saving={false}
      />,
    );

    expect(html).toContain("내가 입력 중인 목표");
    expect(html).toContain("서버에 먼저 저장된 최신 목표");
    expect(html).toContain("서버의 최신 Revision 3");
    expect(html).toContain("서버 최신 목표로 바꾸기");
  });

  it("renumbers priorities after moving an item", () => {
    const moved = moveFocusItem(
      [draftItems[0]!, { ...latestProfile.items[0]!, priority: 2 }],
      1,
      -1,
    );

    expect(moved.map((item) => [item.focusItemId, item.priority])).toEqual([
      ["focus_item_latest", 1],
      ["focus_item_draft", 2],
    ]);
  });
});

describe("rehearsal focus profile synchronization", () => {
  it("allows automatic refresh only while the local draft is clean", () => {
    expect(shouldAutoRefetchFocusProfile(false)).toBe(true);
    expect(shouldAutoRefetchFocusProfile(true)).toBe(false);
  });

  it("keeps a dirty draft when a newer profile arrives for the same project", () => {
    expect(
      getFocusProfileHydrationAction({
        dirty: true,
        hydratedProfileKey: "project_1:2",
        hydratedProjectId: "project_1",
        incomingProfile: latestProfile,
        projectId: "project_1",
      }),
    ).toEqual({ action: "conflict", profileKey: "project_1:3" });
  });

  it("hydrates a newer profile automatically while the local draft is clean", () => {
    expect(
      getFocusProfileHydrationAction({
        dirty: false,
        hydratedProfileKey: "project_1:2",
        hydratedProjectId: "project_1",
        incomingProfile: latestProfile,
        projectId: "project_1",
      }),
    ).toEqual({ action: "hydrate", profileKey: "project_1:3" });
  });

  it("hydrates normally when the project changes even if the previous draft was dirty", () => {
    expect(
      getFocusProfileHydrationAction({
        dirty: true,
        hydratedProfileKey: "project_1:2",
        hydratedProjectId: "project_1",
        incomingProfile: { ...latestProfile, projectId: "project_2" },
        projectId: "project_2",
      }),
    ).toEqual({ action: "hydrate", profileKey: "project_2:3" });
  });
});
