import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { demoIds } from "@orbit/shared";
import { Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import { ProjectEntity } from "./project.entity";
import { ProjectsService } from "./projects.service";

type ProjectFindOptions = {
  where: Partial<ProjectEntity>;
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
      return projects.filter(
        (project) => project.workspaceId === options.where.workspaceId,
      );
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

  it("returns not found for an unknown project", async () => {
    const service = new ProjectsService(createProjectRepository());

    await expect(
      service.getAccessibleProject("project_missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
