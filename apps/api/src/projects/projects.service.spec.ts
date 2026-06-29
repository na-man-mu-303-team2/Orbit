import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { demoIds } from "@orbit/shared";
import { Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import { ProjectEntity } from "./project.entity";
import { ProjectsService } from "./projects.service";

type ProjectFindOptions = {
  where: Partial<ProjectEntity>;
  order?: Partial<Record<keyof ProjectEntity, "ASC" | "DESC">>;
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
      const filtered = projects.filter(
        (project) => project.workspaceId === options.where.workspaceId,
      );
      if (options.order?.createdAt === "DESC") {
        return filtered.sort(
          (left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime(),
        );
      }
      return filtered;
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

describe("ProjectsService", () => {
  it("creates and lists projects inside the demo workspace", async () => {
    const service = new ProjectsService(createProjectRepository());

    const project = await service.create(demoIds.workspaceId, {
      title: "Quarterly Review",
    });
    const projects = await service.list(demoIds.workspaceId);

    expect(project.projectId).toMatch(/^project_/);
    expect(project.workspaceId).toBe(demoIds.workspaceId);
    expect(project.createdBy).toBe(demoIds.userId);
    expect(project.title).toBe("Quarterly Review");
    expect(projects).toEqual([project]);
  });

  it("rejects workspace access outside the demo boundary", async () => {
    const service = new ProjectsService(createProjectRepository());

    await expect(service.list("workspace_other")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create("workspace_other", { title: "Nope" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists newest projects first", async () => {
    const older = new ProjectEntity();
    older.projectId = "project_old";
    older.workspaceId = demoIds.workspaceId;
    older.title = "Old";
    older.createdBy = demoIds.userId;
    older.createdAt = new Date("2026-06-28T00:00:00.000Z");
    const newer = new ProjectEntity();
    newer.projectId = "project_new";
    newer.workspaceId = demoIds.workspaceId;
    newer.title = "New";
    newer.createdBy = demoIds.userId;
    newer.createdAt = new Date("2026-06-29T00:00:00.000Z");
    const service = new ProjectsService(createProjectRepository([older, newer]));

    await expect(service.list(demoIds.workspaceId)).resolves.toMatchObject([
      { projectId: "project_new" },
      { projectId: "project_old" },
    ]);
  });

  it("returns not found for an unknown project", async () => {
    const service = new ProjectsService(createProjectRepository());

    await expect(
      service.getAccessibleProject("project_missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("auto-creates the demo project when demo project access is requested", async () => {
    const service = new ProjectsService(createProjectRepository());

    const project = await service.getAccessibleProject(demoIds.projectId);
    const projects = await service.list(demoIds.workspaceId);

    expect(project.projectId).toBe(demoIds.projectId);
    expect(project.workspaceId).toBe(demoIds.workspaceId);
    expect(project.createdBy).toBe(demoIds.userId);
    expect(project.title).toBe("ORBIT Demo Project");
    expect(projects).toEqual([project]);
  });
});
