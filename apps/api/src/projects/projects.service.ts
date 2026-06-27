import {
  demoIds,
  projectListResponseSchema,
  projectSchema,
} from "@orbit/shared";
import type { CreateProjectRequest, Project } from "@orbit/shared";
import { randomUUID } from "crypto";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProjectEntity } from "./project.entity";

const defaultProjectTitle = "ORBIT Demo Project";

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
  ) {}

  async create(
    workspaceId: string,
    input: CreateProjectRequest,
  ): Promise<Project> {
    this.assertWorkspaceAccess(workspaceId);

    const project = this.projectsRepository.create({
      projectId: `project_${randomUUID()}`,
      workspaceId,
      title: input.title ?? defaultProjectTitle,
      createdBy: demoIds.userId,
      createdAt: new Date(),
    });

    return this.toProjectDto(await this.projectsRepository.save(project));
  }

  async list(workspaceId: string): Promise<Project[]> {
    this.assertWorkspaceAccess(workspaceId);

    const projects = await this.projectsRepository.find({
      where: { workspaceId },
      order: { createdAt: "ASC" },
    });

    return projectListResponseSchema.parse(
      projects.map((project) => this.toProjectDto(project)),
    );
  }

  async getAccessibleProject(projectId: string): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);
    return this.toProjectDto(project);
  }

  assertWorkspaceAccess(workspaceId: string): void {
    if (workspaceId !== demoIds.workspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }
  }

  private toProjectDto(project: ProjectEntity): Project {
    return projectSchema.parse({
      projectId: project.projectId,
      workspaceId: project.workspaceId,
      title: project.title,
      createdBy: project.createdBy,
      createdAt: project.createdAt.toISOString(),
    });
  }
}
