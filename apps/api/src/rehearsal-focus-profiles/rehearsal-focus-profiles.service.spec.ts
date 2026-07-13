import type { RehearsalFocusProfile } from "@orbit/shared";
import { ConflictException } from "@nestjs/common";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";

import type { ProjectsService } from "../projects/projects.service";
import type { RehearsalFocusProfilesRepository } from "./rehearsal-focus-profiles.repository";
import { RehearsalFocusProfilesService } from "./rehearsal-focus-profiles.service";

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

describe("RehearsalFocusProfilesService", () => {
  it("checks project read permission before returning the current profile", async () => {
    const fixture = createFixture();

    await expect(fixture.service.get("project_1", "viewer_1")).resolves.toEqual(
      {
        profile,
      },
    );
    expect(fixture.projects.assertCanReadProject).toHaveBeenCalledWith(
      "project_1",
      "viewer_1",
    );
    expect(fixture.repository.getCurrent).toHaveBeenCalledWith("project_1");
  });

  it("checks project write permission and logs only bounded update metadata", async () => {
    const fixture = createFixture({ saveResult: { status: "saved", profile } });

    await expect(
      fixture.service.put("project_1", "editor_1", {
        expectedRevision: 2,
        items: profile.items,
      }),
    ).resolves.toEqual({ profile });
    expect(fixture.projects.assertCanWriteProject).toHaveBeenCalledWith(
      "project_1",
      "editor_1",
    );
    expect(fixture.logger.info).toHaveBeenCalledWith(
      {
        event: "rehearsal_focus_profile.updated",
        projectId: "project_1",
        profileId: "focus_profile_1",
        revision: 3,
        itemCount: 1,
        actorUserId: "editor_1",
      },
      "Rehearsal focus profile updated.",
    );
  });

  it("returns the shared conflict payload with the latest profile", async () => {
    const fixture = createFixture({
      saveResult: { status: "conflict", currentProfile: profile },
    });

    const promise = fixture.service.put("project_1", "editor_1", {
      expectedRevision: 2,
      items: profile.items,
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: {
        code: "REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT",
        expectedRevision: 2,
        actualRevision: 3,
        currentProfile: profile,
      },
    });
  });
});

function createFixture(
  options: {
    saveResult?: Awaited<ReturnType<RehearsalFocusProfilesRepository["save"]>>;
  } = {},
) {
  const repository = {
    getCurrent: vi.fn(async () => profile),
    save: vi.fn(async () => options.saveResult ?? { status: "saved", profile }),
  };
  const projects = {
    assertCanReadProject: vi.fn(async () => ({ projectId: "project_1" })),
    assertCanWriteProject: vi.fn(async () => ({ projectId: "project_1" })),
  };
  const logger = { info: vi.fn() };

  return {
    service: new RehearsalFocusProfilesService(
      repository as unknown as RehearsalFocusProfilesRepository,
      projects as unknown as ProjectsService,
      logger as unknown as PinoLogger,
    ),
    repository,
    projects,
    logger,
  };
}
