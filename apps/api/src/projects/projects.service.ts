import {
  demoIds,
  projectMembersResponseSchema,
  projectListResponseSchema,
  projectSchema,
} from "@orbit/shared";
import type {
  CreateProjectRequest,
  Project,
  ProjectMemberRole,
  ProjectMemberStatus,
  ProjectMembersResponse,
} from "@orbit/shared";
import { randomUUID } from "crypto";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, In, Repository } from "typeorm";
import { ProjectEntity } from "./project.entity";
import { ProjectMemberEntity } from "./project-member.entity";

const defaultProjectTitle = "ORBIT Demo Project";

type MemberRow = {
  user_id: string;
  email: string;
  role: ProjectMemberRole;
  status: "pending" | "accepted" | "rejected";
  created_at: Date | string;
};

type UserLookupRow = {
  user_id: string;
  email: string;
};

export type ProjectAccessResponse = {
  project: Project;
  membership: {
    role: ProjectMemberRole;
    status: ProjectMemberStatus;
  } | null;
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMembersRepository: Repository<ProjectMemberEntity>,
  ) {}

  async create(
    workspaceId: string,
    input: CreateProjectRequest,
    userId: string,
  ): Promise<Project> {
    this.assertWorkspaceAccess(workspaceId);
    const now = new Date();

    const project = this.projectsRepository.create({
      projectId: `project_${randomUUID()}`,
      workspaceId,
      title: input.title ?? defaultProjectTitle,
      createdBy: userId,
      createdAt: now,
    });

    const savedProject = await this.projectsRepository.save(project);
    await this.projectMembersRepository.save(
      this.projectMembersRepository.create({
        projectId: savedProject.projectId,
        userId,
        role: "owner",
        status: "accepted",
        createdAt: now,
      }),
    );

    return this.toProjectDto(savedProject);
  }

  async list(workspaceId: string, userId: string): Promise<Project[]> {
    this.assertWorkspaceAccess(workspaceId);

    const acceptedMemberships = await this.projectMembersRepository.find({
      where: {
        userId,
        status: "accepted",
        role: In(["owner", "editor", "viewer"]),
      },
    });
    const projectIds = acceptedMemberships.map((membership) => membership.projectId);

    if (projectIds.length === 0) {
      return projectListResponseSchema.parse([]);
    }

    const projects = await this.projectsRepository.find({
      where: { workspaceId, projectId: In(projectIds) },
      order: { createdAt: "DESC" },
    });

    return projectListResponseSchema.parse(
      projects.map((project) => this.toProjectDto(project)),
    );
  }

  async getAccessibleProject(projectId: string): Promise<Project> {
    let project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project && projectId === demoIds.projectId) {
      project = await this.projectsRepository.save(
        this.projectsRepository.create({
          projectId: demoIds.projectId,
          workspaceId: demoIds.workspaceId,
          title: defaultProjectTitle,
          createdBy: demoIds.userId,
          createdAt: new Date(),
        }),
      );
    }

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);
    return this.toProjectDto(project);
  }

  async getProjectAccess(
    projectId: string,
    userId: string,
  ): Promise<ProjectAccessResponse> {
    const project = await this.findProjectOrDemo(projectId);
    const member = await this.findProjectMember(project.projectId, userId);

    return {
      project: this.toProjectDto(project),
      membership: member
        ? {
            role: member.role,
            status: member.status,
          }
        : null,
    };
  }

  async requestAccess(
    projectId: string,
    userId: string,
    role: Exclude<ProjectMemberRole, "owner">,
  ): Promise<ProjectAccessResponse> {
    const project = await this.findProjectOrDemo(projectId);
    const existing = await this.findProjectMember(project.projectId, userId);

    if (existing?.status === "accepted") {
      return {
        project: this.toProjectDto(project),
        membership: {
          role: existing.role,
          status: existing.status,
        },
      };
    }

    const member = await this.projectMembersRepository.save(
      this.projectMembersRepository.create({
        projectId: project.projectId,
        userId,
        role: existing?.role === "owner" ? "owner" : role,
        status: "pending",
        createdAt: existing?.createdAt ?? new Date(),
      }),
    );

    return {
      project: this.toProjectDto(project),
      membership: {
        role: member.role,
        status: member.status,
      },
    };
  }

  async assertCanReadProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.findProjectOrDemo(projectId);
    await this.assertAcceptedMember(project.workspaceId, project.projectId, userId);
    return this.toProjectDto(project);
  }

  async assertCanWriteProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.findProjectOrDemo(projectId);
    const member = await this.assertAcceptedMember(project.workspaceId, project.projectId, userId);
    if (member.role === "viewer") {
      throw new ForbiddenException("Project editor permission required");
    }
    return this.toProjectDto(project);
  }

  async listMembers(
    workspaceId: string,
    projectId: string,
    requesterUserId: string,
  ): Promise<ProjectMembersResponse> {
    await this.assertProjectOwner(workspaceId, projectId, requesterUserId);
    return this.getProjectMembers(projectId);
  }

  async inviteMember(
    workspaceId: string,
    projectId: string,
    requesterUserId: string,
    email: string,
    role: Exclude<ProjectMemberRole, "owner">,
  ): Promise<ProjectMembersResponse> {
    await this.assertProjectOwner(workspaceId, projectId, requesterUserId);
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new NotFoundException(`User not found: ${email}`);
    }

    const existing = await this.projectMembersRepository.findOne({
      where: { projectId, userId: user.user_id },
    });
    const now = new Date();
    await this.projectMembersRepository.save(
      this.projectMembersRepository.create({
        projectId,
        userId: user.user_id,
        role: existing?.role === "owner" ? "owner" : role,
        status: "accepted",
        createdAt: existing?.createdAt ?? now,
      }),
    );

    return this.getProjectMembers(projectId);
  }

  async updateMemberRole(
    workspaceId: string,
    projectId: string,
    requesterUserId: string,
    targetUserId: string,
    role: ProjectMemberRole,
  ): Promise<ProjectMembersResponse> {
    await this.assertProjectOwner(workspaceId, projectId, requesterUserId);
    const target = await this.findProjectMember(projectId, targetUserId);
    if (!target || target.status !== "accepted") {
      throw new NotFoundException("Project member not found");
    }

    if (role === "owner") {
      await this.transferOwnership(projectId, requesterUserId, targetUserId);
      return this.getProjectMembers(projectId);
    }

    if (target.role === "owner") {
      throw new ForbiddenException("Owner transfer is required before changing owner role");
    }

    target.role = role;
    await this.projectMembersRepository.save(target);
    return this.getProjectMembers(projectId);
  }

  async removeMember(
    workspaceId: string,
    projectId: string,
    requesterUserId: string,
    targetUserId: string,
  ): Promise<ProjectMembersResponse> {
    await this.assertProjectOwner(workspaceId, projectId, requesterUserId);
    const target = await this.findProjectMember(projectId, targetUserId);
    if (!target) {
      throw new NotFoundException("Project member not found");
    }
    if (target.role === "owner") {
      throw new ForbiddenException("Project owner cannot be removed");
    }

    await this.projectMembersRepository.delete({ projectId, userId: targetUserId });
    return this.getProjectMembers(projectId);
  }

  async updateMemberStatus(
    workspaceId: string,
    projectId: string,
    requesterUserId: string,
    targetUserId: string,
    status: "accepted" | "rejected",
  ): Promise<ProjectMembersResponse> {
    await this.assertProjectOwner(workspaceId, projectId, requesterUserId);
    const target = await this.findProjectMember(projectId, targetUserId);
    if (!target || target.status !== "pending") {
      throw new NotFoundException("Project request not found");
    }

    target.status = status;
    await this.projectMembersRepository.save(target);
    return this.getProjectMembers(projectId);
  }

  assertWorkspaceAccess(workspaceId: string): void {
    if (workspaceId !== demoIds.workspaceId) {
      throw new ForbiddenException("Workspace access denied");
    }
  }

  private async assertAcceptedMember(
    workspaceId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberEntity> {
    await this.assertProjectInWorkspace(workspaceId, projectId);
    const member = await this.projectMembersRepository.findOne({
      where: { projectId, userId, status: "accepted" },
    });
    if (!member) {
      throw new ForbiddenException("Project member permission required");
    }
    return member;
  }

  private async assertProjectOwner(
    workspaceId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMemberEntity> {
    const member = await this.assertAcceptedMember(workspaceId, projectId, userId);
    if (member.role !== "owner") {
      throw new ForbiddenException("Project owner permission required");
    }
    return member;
  }

  private async assertProjectInWorkspace(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectEntity> {
    this.assertWorkspaceAccess(workspaceId);
    const project = await this.projectsRepository.findOne({
      where: { projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }
    return project;
  }

  private async findProjectOrDemo(projectId: string): Promise<ProjectEntity> {
    let project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project && projectId === demoIds.projectId) {
      project = await this.projectsRepository.save(
        this.projectsRepository.create({
          projectId: demoIds.projectId,
          workspaceId: demoIds.workspaceId,
          title: defaultProjectTitle,
          createdBy: demoIds.userId,
          createdAt: new Date(),
        }),
      );
    }

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);
    return project;
  }

  private async findProjectMember(projectId: string, userId: string) {
    return this.projectMembersRepository.findOne({ where: { projectId, userId } });
  }

  private async findUserByEmail(email: string): Promise<UserLookupRow | undefined> {
    const rows = await this.dataSource.query<UserLookupRow[]>(
      `
        SELECT user_id, email
        FROM users
        WHERE lower(email) = lower($1)
      `,
      [email],
    );

    return rows[0];
  }

  private async transferOwnership(
    projectId: string,
    ownerUserId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        ProjectMemberEntity,
        { projectId, userId: ownerUserId, status: "accepted" },
        { role: "editor" },
      );
      await manager.update(
        ProjectMemberEntity,
        { projectId, userId: targetUserId, status: "accepted" },
        { role: "owner" },
      );
    });
  }

  private async getProjectMembers(projectId: string): Promise<ProjectMembersResponse> {
    const rows = await this.dataSource.query<MemberRow[]>(
      `
        SELECT users.user_id, users.email, project_members.role, project_members.status,
          project_members.created_at
        FROM project_members
        INNER JOIN users ON users.user_id = project_members.user_id
        WHERE project_members.project_id = $1
          AND project_members.status IN ('accepted', 'pending')
        ORDER BY
          CASE project_members.role
            WHEN 'owner' THEN 0
            WHEN 'editor' THEN 1
            ELSE 2
          END,
          lower(users.email)
      `,
      [projectId],
    );
    const normalized = rows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    }));

    return projectMembersResponseSchema.parse({
      members: normalized.filter((member) => member.status === "accepted"),
      requests: normalized.filter((member) => member.status === "pending"),
    });
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
