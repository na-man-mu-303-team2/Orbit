import { BadRequestException } from "@nestjs/common";
import { demoIds } from "@orbit/shared";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import {
  ProjectAccessRequestsController,
  ProjectMembersController,
  ProjectsController,
} from "./projects.controller";
import { ProjectsService } from "./projects.service";

describe("ProjectsController", () => {
  it("turns an invalid create payload into a bad request", async () => {
    const controller = new ProjectsController(
      {
        create: vi.fn(),
        list: vi.fn(),
        requestAccess: vi.fn(),
      } as unknown as ProjectsService,
      {
        me: vi.fn(),
      } as unknown as AuthService,
    );

    await expect(
      controller.createProject(createRequest("session_1"), demoIds.workspaceId, {
        title: "",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses the authenticated user id as the project creator", async () => {
    const create = vi.fn();
    const controller = new ProjectsController(
      {
        create,
        list: vi.fn(),
        requestAccess: vi.fn(),
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_from_session",
            email: "maker@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.createProject(createRequest("session_1"), demoIds.workspaceId, {
      title: "Quarterly Review",
    });

    expect(create).toHaveBeenCalledWith(
      demoIds.workspaceId,
      "user_from_session",
      { title: "Quarterly Review" },
    );
  });

  it("uses the authenticated user id when listing projects", async () => {
    const list = vi.fn();
    const controller = new ProjectsController(
      {
        create: vi.fn(),
        list,
        requestAccess: vi.fn(),
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_from_session",
            email: "maker@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.listProjects(createRequest("session_1"), demoIds.workspaceId);

    expect(list).toHaveBeenCalledWith(demoIds.workspaceId, "user_from_session");
  });
});

describe("ProjectAccessRequestsController", () => {
  it("uses the authenticated user id when requesting project access", async () => {
    const requestAccess = vi.fn();
    const controller = new ProjectAccessRequestsController(
      {
        create: vi.fn(),
        list: vi.fn(),
        requestAccess,
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_from_session",
            email: "maker@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.requestProjectAccess(
      createRequest("session_1"),
      "project_1",
      { role: "editor" },
    );

    expect(requestAccess).toHaveBeenCalledWith(
      "project_1",
      "user_from_session",
      { role: "editor" },
    );
  });

  it("rejects owner role access requests", async () => {
    const controller = new ProjectAccessRequestsController(
      {
        create: vi.fn(),
        list: vi.fn(),
        requestAccess: vi.fn(),
      } as unknown as ProjectsService,
      {
        me: vi.fn(),
      } as unknown as AuthService,
    );

    await expect(
      controller.requestProjectAccess(createRequest("session_1"), "project_1", {
        role: "owner",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses the authenticated user id when reading my access request", async () => {
    const getAccessRequestStatus = vi.fn();
    const controller = new ProjectAccessRequestsController(
      {
        create: vi.fn(),
        list: vi.fn(),
        requestAccess: vi.fn(),
        getAccessRequestStatus,
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_from_session",
            email: "maker@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.getMyProjectAccessRequest(
      createRequest("session_1"),
      "project_1",
    );

    expect(getAccessRequestStatus).toHaveBeenCalledWith(
      "project_1",
      "user_from_session",
    );
  });
});

describe("ProjectMembersController", () => {
  it("uses the authenticated user id when reading share state", async () => {
    const getShareState = vi.fn();
    const controller = new ProjectMembersController(
      {
        getShareState,
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_owner",
            email: "owner@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.getProjectMembers(createRequest("session_1"), "project_1");

    expect(getShareState).toHaveBeenCalledWith("project_1", "user_owner");
  });

  it("validates and passes invite payloads to the service", async () => {
    const inviteProjectMember = vi.fn();
    const controller = new ProjectMembersController(
      {
        inviteProjectMember,
      } as unknown as ProjectsService,
      {
        me: vi.fn(async () => ({
          user: {
            userId: "user_owner",
            email: "owner@orbit.test",
            createdAt: "2026-06-29T00:00:00.000Z",
          },
          authenticatedAt: "2026-06-29T00:00:00.000Z",
          expiresAt: "2026-07-06T00:00:00.000Z",
        })),
      } as unknown as AuthService,
    );

    await controller.inviteProjectMember(createRequest("session_1"), "project_1", {
      email: "viewer@orbit.test",
      role: "viewer",
    });

    expect(inviteProjectMember).toHaveBeenCalledWith(
      "project_1",
      "user_owner",
      {
        email: "viewer@orbit.test",
        role: "viewer",
      },
    );
  });
});

function createRequest(sessionId: string): Request & {
  signedCookies: Record<string, string>;
} {
  return {
    signedCookies: {
      [authSessionCookieName]: sessionId,
    },
  } as unknown as Request & { signedCookies: Record<string, string> };
}
