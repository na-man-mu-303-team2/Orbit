import { demoIds, nowIso } from "@orbit/shared";
import { Injectable } from "@nestjs/common";

export interface ProjectDto {
  projectId: string;
  workspaceId: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

@Injectable()
export class ProjectsService {
  private readonly projects = new Map<string, ProjectDto>();

  constructor() {
    this.create({ title: "ORBIT Demo Project" });
  }

  create(input: { title?: string }): ProjectDto {
    const project: ProjectDto = {
      projectId: demoIds.projectId,
      workspaceId: demoIds.workspaceId,
      title: input.title ?? "ORBIT Demo Project",
      createdBy: demoIds.userId,
      createdAt: nowIso()
    };
    this.projects.set(project.projectId, project);
    return project;
  }

  list(): ProjectDto[] {
    return [...this.projects.values()];
  }
}

