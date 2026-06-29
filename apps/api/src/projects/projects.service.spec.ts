import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { demoIds } from "@orbit/shared";
import { DataSource, Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import { ProjectMemberEntity } from "./project-member.entity";
import { ProjectEntity } from "./project.entity";
import { ProjectsService } from "./projects.service";

type ProjectFindOptions = {
  where: Partial<ProjectEntity>;
};

type ProjectMemberFindOptions = {
  where: Partial<ProjectMemberEntity>;
};

function createProjectRepository(initialProjects: ProjectEntity[] = []) {
  const projects = [...initialProjects];

  const repository = {
    create(input: Partial<ProjectEntity>): ProjectEntity {
      return input as ProjectEntity;
    },
    async save(project: ProjectEntity): Promise<ProjectEntity> {
      const index = projects.findIndex(
        (item) => item.projectId === project.projectId,
      );
      if (index >= 0) {
        projects[index] = project;
      } else {
        projects.push(project);
      }

      return project;
    },
    async find(options: ProjectFindOptions): Promise<ProjectEntity[]> {
      return projects.filter((project) => {
        if (
          options.where.workspaceId &&
          project.workspaceId !== options.where.workspaceId
        ) {
          return false;
        }

        return true;
      });
    },
    async findOne(options: ProjectFindOptions): Promise<ProjectEntity | null> {
      return (
        projects.find(
          (project) => project.projectId === options.where.projectId,
        ) ?? null
      );
    },
  };

  return repository as unknown as Repository<ProjectEntity>;
}

function createProjectMemberRepository(
  initialMembers: ProjectMemberEntity[] = [],
) {
  const members = [...initialMembers];

  const repository = {
    create(input: Partial<ProjectMemberEntity>): ProjectMemberEntity {
      return input as ProjectMemberEntity;
    },
    async save(member: ProjectMemberEntity): Promise<ProjectMemberEntity> {
      const index = members.findIndex(
        (item) =>
          item.projectId === member.projectId && item.userId === member.userId,
      );
      if (index >= 0) {
        members[index] = member;
      } else {
        members.push(member);
      }

      return member;
    },
    async find(
      options: ProjectMemberFindOptions,
    ): Promise<ProjectMemberEntity[]> {
      return members.filter((member) => {
        if (
          options.where.userId &&
          member.userId !== options.where.userId
        ) {
          return false;
        }

        if (
          options.where.projectId &&
          member.projectId !== options.where.projectId
        ) {
          return false;
        }

        if (
          options.where.status &&
          member.status !== options.where.status
        ) {
          return false;
        }

        return true;
      });
    },
    async findOne(
      options: ProjectMemberFindOptions,
    ): Promise<ProjectMemberEntity | null> {
      return (
        members.find((member) => {
          if (
            options.where.userId &&
            member.userId !== options.where.userId
          ) {
            return false;
          }

          if (
            options.where.projectId &&
            member.projectId !== options.where.projectId
          ) {
            return false;
          }

          if (
            options.where.status &&
            member.status !== options.where.status
          ) {
            return false;
          }

          return true;
        }) ?? null
      );
    },
  };

  return repository as unknown as Repository<ProjectMemberEntity>;
}

function createProjectsService(
  initialProjects: ProjectEntity[] = [],
  initialMembers: ProjectMemberEntity[] = [],
  userEmails: Record<string, string> = {},
) {
  const dataSource = {
    async query(_sql: string, params: unknown[]): Promise<unknown[]> {
      const [value] = params;
      if (Array.isArray(value)) {
        return value
          .filter((userId): userId is string => typeof userId === "string")
          .filter((userId) => userEmails[userId])
          .map((userId) => ({
            user_id: userId,
            email: userEmails[userId],
          }));
      }

      if (typeof value === "string") {
        const found = Object.entries(userEmails).find(
          ([, email]) => email.toLowerCase() === value.toLowerCase(),
        );

        return found
          ? [
              {
                user_id: found[0],
                email: found[1],
              },
            ]
          : [];
      }

      return [];
    },
  } as unknown as DataSource;

  return new ProjectsService(
    createProjectRepository(initialProjects),
    createProjectMemberRepository(initialMembers),
    dataSource,
  );
}

describe("ProjectsService", () => {
  it("creates and lists projects inside the demo workspace", async () => {
    const service = createProjectsService();

    const project = await service.create(
      demoIds.workspaceId,
      "user_real_creator",
      {
        title: "Quarterly Review",
      },
    );
    const projects = await service.list(
      demoIds.workspaceId,
      "user_real_creator",
    );

    expect(project.projectId).toMatch(/^project_/);
    expect(project.workspaceId).toBe(demoIds.workspaceId);
    expect(project.createdBy).toBe("user_real_creator");
    expect(project.title).toBe("Quarterly Review");
    expect(projects).toEqual([project]);
  });

  it("rejects workspace access outside the demo boundary", async () => {
    const service = createProjectsService();

    await expect(
      service.list("workspace_other", "user_real_creator"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.create("workspace_other", "user_real_creator", { title: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found for an unknown project", async () => {
    const service = createProjectsService();

    await expect(
      service.getAccessibleProject("project_missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("auto-creates the demo project when demo project access is requested", async () => {
    const service = createProjectsService();

    const project = await service.getAccessibleProject(demoIds.projectId);
    const projects = await service.list(demoIds.workspaceId, demoIds.userId);

    expect(project.projectId).toBe(demoIds.projectId);
    expect(project.workspaceId).toBe(demoIds.workspaceId);
    expect(project.createdBy).toBe(demoIds.userId);
    expect(project.title).toBe("ORBIT Demo Project");
    expect(projects).toEqual([project]);
  });

  it("lists only projects where the authenticated user is a member", async () => {
    const mine = {
      projectId: "project_mine",
      workspaceId: demoIds.workspaceId,
      title: "Mine",
      createdBy: "user_other",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const theirs = {
      projectId: "project_theirs",
      workspaceId: demoIds.workspaceId,
      title: "Theirs",
      createdBy: "user_other",
      createdAt: new Date("2026-06-29T00:01:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [mine, theirs],
      [
        {
          projectId: "project_mine",
          userId: "user_me",
          role: "editor",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:02:00.000Z"),
        } as ProjectMemberEntity,
        {
          projectId: "project_theirs",
          userId: "user_other",
          role: "owner",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:03:00.000Z"),
        } as ProjectMemberEntity,
      ],
    );

    const projects = await service.list(demoIds.workspaceId, "user_me");

    expect(projects).toEqual([
      {
        projectId: "project_mine",
        workspaceId: demoIds.workspaceId,
        title: "Mine",
        createdBy: "user_other",
        createdAt: "2026-06-29T00:00:00.000Z",
      },
    ]);
  });

  it("does not list projects with only a pending membership", async () => {
    const project = {
      projectId: "project_pending",
      workspaceId: demoIds.workspaceId,
      title: "Pending",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [project],
      [
        {
          projectId: "project_pending",
          userId: "user_me",
          role: "viewer",
          status: "pending",
          createdAt: new Date("2026-06-29T00:02:00.000Z"),
        } as ProjectMemberEntity,
      ],
    );

    await expect(service.list(demoIds.workspaceId, "user_me")).resolves.toEqual(
      [],
    );
  });

  it("creates a pending access request for a project", async () => {
    const project = {
      projectId: "project_request",
      workspaceId: demoIds.workspaceId,
      title: "Requestable",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService([project]);

    const request = await service.requestAccess(
      "project_request",
      "user_requester",
      { role: "editor" },
    );

    expect(request).toMatchObject({
      projectId: "project_request",
      userId: "user_requester",
      role: "editor",
      status: "pending",
    });
  });

  it("returns the authenticated user's existing access request status", async () => {
    const project = {
      projectId: "project_request",
      workspaceId: demoIds.workspaceId,
      title: "Requestable",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [project],
      [
        {
          projectId: "project_request",
          userId: "user_requester",
          role: "viewer",
          status: "pending",
          createdAt: new Date("2026-06-29T00:02:00.000Z"),
        } as ProjectMemberEntity,
      ],
    );

    await expect(
      service.getAccessRequestStatus("project_request", "user_requester"),
    ).resolves.toEqual({
      projectId: "project_request",
      userId: "user_requester",
      role: "viewer",
      status: "pending",
      createdAt: "2026-06-29T00:02:00.000Z",
    });
  });

  it("returns accepted members and pending requests for sharing", async () => {
    const project = {
      projectId: "project_share",
      workspaceId: demoIds.workspaceId,
      title: "Shareable",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [project],
      [
        {
          projectId: "project_share",
          userId: "user_owner",
          role: "owner",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:01:00.000Z"),
        } as ProjectMemberEntity,
        {
          projectId: "project_share",
          userId: "user_requester",
          role: "editor",
          status: "pending",
          createdAt: new Date("2026-06-29T00:02:00.000Z"),
        } as ProjectMemberEntity,
      ],
      {
        user_owner: "owner@orbit.test",
        user_requester: "requester@orbit.test",
      },
    );

    await expect(
      service.getShareState("project_share", "user_owner"),
    ).resolves.toEqual({
      currentMember: {
        projectId: "project_share",
        userId: "user_owner",
        email: "owner@orbit.test",
        role: "owner",
        status: "accepted",
        createdAt: "2026-06-29T00:01:00.000Z",
      },
      members: [
        {
          projectId: "project_share",
          userId: "user_owner",
          email: "owner@orbit.test",
          role: "owner",
          status: "accepted",
          createdAt: "2026-06-29T00:01:00.000Z",
        },
      ],
      requests: [
        {
          projectId: "project_share",
          userId: "user_requester",
          email: "requester@orbit.test",
          role: "editor",
          status: "pending",
          createdAt: "2026-06-29T00:02:00.000Z",
        },
      ],
    });
  });

  it("does not allow revoking the last accepted owner", async () => {
    const project = {
      projectId: "project_share",
      workspaceId: demoIds.workspaceId,
      title: "Shareable",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [project],
      [
        {
          projectId: "project_share",
          userId: "user_owner",
          role: "owner",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:01:00.000Z"),
        } as ProjectMemberEntity,
      ],
      {
        user_owner: "owner@orbit.test",
      },
    );

    await expect(
      service.updateProjectMember("project_share", "user_owner", "user_owner", {
        status: "rejected",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("demotes the previous accepted owner when another member becomes owner", async () => {
    const project = {
      projectId: "project_share",
      workspaceId: demoIds.workspaceId,
      title: "Shareable",
      createdBy: "user_owner",
      createdAt: new Date("2026-06-29T00:00:00.000Z"),
    } as ProjectEntity;
    const service = createProjectsService(
      [project],
      [
        {
          projectId: "project_share",
          userId: "user_owner",
          role: "owner",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:01:00.000Z"),
        } as ProjectMemberEntity,
        {
          projectId: "project_share",
          userId: "user_editor",
          role: "editor",
          status: "accepted",
          createdAt: new Date("2026-06-29T00:02:00.000Z"),
        } as ProjectMemberEntity,
      ],
      {
        user_owner: "owner@orbit.test",
        user_editor: "editor@orbit.test",
      },
    );

    await service.updateProjectMember("project_share", "user_owner", "user_editor", {
      role: "owner",
    });
    const shareState = await service.getShareState("project_share", "user_editor");

    expect(shareState.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user_owner",
          role: "editor",
        }),
        expect.objectContaining({
          userId: "user_editor",
          role: "owner",
        }),
      ]),
    );
    await expect(
      service.updateProjectMember("project_share", "user_owner", "user_editor", {
        role: "editor",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
