import {
  demoIds,
  projectMemberSchema,
  projectShareMemberSchema,
  projectShareStateSchema,
  projectListResponseSchema,
  projectSchema,
} from "@orbit/shared";
import type {
  CreateProjectRequest,
  Project,
  ProjectAccessRequest,
  ProjectMemberInvite,
  ProjectMemberUpdate,
  ProjectMember,
  ProjectShareMember,
  ProjectShareState,
} from "@orbit/shared";
import { randomUUID } from "crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { ProjectMemberEntity } from "./project-member.entity";
import { ProjectEntity } from "./project.entity";

const defaultProjectTitle = "ORBIT Demo Project";

type UserSummaryRow = {
  user_id: string;
  email: string;
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: Repository<ProjectEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly projectMembersRepository: Repository<ProjectMemberEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    input: CreateProjectRequest,
  ): Promise<Project> {
    this.assertWorkspaceAccess(workspaceId);

    const project = this.projectsRepository.create({
      projectId: `project_${randomUUID()}`,
      workspaceId,
      title: input.title ?? defaultProjectTitle,
      createdBy: userId,
      createdAt: new Date(),
    });

    const savedProject = await this.projectsRepository.save(project);
    await this.projectMembersRepository.save(
      this.projectMembersRepository.create({
        projectId: savedProject.projectId,
        userId,
        role: "owner",
        status: "accepted",
        createdAt: savedProject.createdAt,
      }),
    );

    return this.toProjectDto(savedProject);
  }

  async list(workspaceId: string, userId: string): Promise<Project[]> {
    this.assertWorkspaceAccess(workspaceId);

    const memberships = await this.projectMembersRepository.find({
      where: { userId, status: "accepted" },
    });
    const accessibleProjectIds = new Set(
      memberships.map((membership) => membership.projectId),
    );

    if (accessibleProjectIds.size === 0) {
      return [];
    }

    const projects = await this.projectsRepository.find({
      where: { workspaceId },
      order: { createdAt: "ASC" },
    });

    return projectListResponseSchema.parse(
      projects
        .filter((project) => accessibleProjectIds.has(project.projectId))
        .map((project) => this.toProjectDto(project)),
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
      await this.projectMembersRepository.save(
        this.projectMembersRepository.create({
          projectId: project.projectId,
          userId: demoIds.userId,
          role: "owner",
          status: "accepted",
          createdAt: project.createdAt,
        }),
      );
    }

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);
    return this.toProjectDto(project);
  }

  async assertProjectAccess(projectId: string, userId: string): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);

    const membership = await this.projectMembersRepository.findOne({
      where: { projectId, userId, status: "accepted" },
    });
    if (!membership) {
      throw new ForbiddenException("Project access denied");
    }

    return this.toProjectDto(project);
  }

  async requestAccess(
    projectId: string,
    userId: string,
    input: ProjectAccessRequest,
  ): Promise<ProjectMember> {
    const project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);

    const existingMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId },
    });
    const membership = this.projectMembersRepository.create({
      projectId,
      userId,
      role: input.role,
      status:
        existingMembership?.status === "accepted" ? "accepted" : "pending",
      createdAt: existingMembership?.createdAt ?? new Date(),
    });

    return this.toProjectMemberDto(
      await this.projectMembersRepository.save(membership),
    );
  }

  async getAccessRequestStatus(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    const project = await this.projectsRepository.findOne({
      where: { projectId },
    });

    if (!project) {
      throw new NotFoundException(`Project not found: ${projectId}`);
    }

    this.assertWorkspaceAccess(project.workspaceId);

    const membership = await this.projectMembersRepository.findOne({
      where: { projectId, userId },
    });

    return membership ? this.toProjectMemberDto(membership) : null;
  }

  async getShareState(
    projectId: string,
    userId: string,
  ): Promise<ProjectShareState> {
    await this.assertProjectAccess(projectId, userId);

    const memberships = await this.projectMembersRepository.find({
      where: { projectId },
    });
    const membersWithUsers = await this.toProjectShareMemberDtos(memberships);
    const currentMember =
      membersWithUsers.find((member) => member.userId === userId) ?? null;

    return projectShareStateSchema.parse({
      currentMember,
      members: membersWithUsers.filter((member) => member.status === "accepted"),
      requests: membersWithUsers.filter((member) => member.status === "pending"),
    });
  }

  async inviteProjectMember(
    projectId: string,
    userId: string,
    input: ProjectMemberInvite,
  ): Promise<ProjectShareMember> {
    await this.assertProjectOwner(projectId, userId);

    const invitee = await this.findUserByEmail(input.email);
    if (!invitee) {
      throw new NotFoundException(`User not found: ${input.email}`);
    }

    const existingMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: invitee.user_id },
    });
    const membership = this.projectMembersRepository.create({
      projectId,
      userId: invitee.user_id,
      role: input.role,
      status: "accepted",
      createdAt: existingMembership?.createdAt ?? new Date(),
    });

    if (membership.role === "owner") {
      await this.demoteOtherAcceptedOwners(projectId, membership.userId);
    }

    return this.toProjectShareMemberDto(
      await this.projectMembersRepository.save(membership),
      new Map([[invitee.user_id, invitee.email]]),
    );
  }

  async updateProjectMember(
    projectId: string,
    requesterUserId: string,
    memberUserId: string,
    input: ProjectMemberUpdate,
  ): Promise<ProjectShareMember> {
    await this.assertProjectOwner(projectId, requesterUserId);

    const existingMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: memberUserId },
    });
    if (!existingMembership) {
      throw new NotFoundException(`Project member not found: ${memberUserId}`);
    }

    const nextRole = input.role ?? existingMembership.role;
    const nextStatus = input.status ?? existingMembership.status;

    if (
      existingMembership.role === "owner" &&
      existingMembership.status === "accepted" &&
      (nextRole !== "owner" || nextStatus !== "accepted")
    ) {
      const acceptedMembers = await this.projectMembersRepository.find({
        where: { projectId, status: "accepted" },
      });
      const acceptedOwners = acceptedMembers.filter(
        (member) => member.role === "owner",
      );

      if (acceptedOwners.length <= 1) {
        throw new BadRequestException("Project must have at least one owner");
      }
    }

    if (nextRole === "owner" && nextStatus === "accepted") {
      await this.demoteOtherAcceptedOwners(projectId, memberUserId);
    }

    const membership = this.projectMembersRepository.create({
      ...existingMembership,
      role: nextRole,
      status: nextStatus,
    });

    const saved = await this.projectMembersRepository.save(membership);
    const users = await this.getUserEmailMap([saved.userId]);
    return this.toProjectShareMemberDto(saved, users);
  }

  private async assertProjectOwner(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.assertProjectAccess(projectId, userId);
    const membership = await this.projectMembersRepository.findOne({
      where: { projectId, userId, status: "accepted" },
    });

    if (membership?.role !== "owner") {
      throw new ForbiddenException("Project owner permission required");
    }

    return project;
  }

  private async demoteOtherAcceptedOwners(
    projectId: string,
    ownerUserId: string,
  ): Promise<void> {
    const acceptedMembers = await this.projectMembersRepository.find({
      where: { projectId, status: "accepted" },
    });
    const otherOwners = acceptedMembers.filter(
      (member) => member.role === "owner" && member.userId !== ownerUserId,
    );

    for (const owner of otherOwners) {
      await this.projectMembersRepository.save(
        this.projectMembersRepository.create({
          ...owner,
          role: "editor",
        }),
      );
    }
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

  private toProjectMemberDto(member: ProjectMemberEntity): ProjectMember {
    return projectMemberSchema.parse({
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      createdAt: member.createdAt.toISOString(),
    });
  }

  private async toProjectShareMemberDtos(
    members: ProjectMemberEntity[],
  ): Promise<ProjectShareMember[]> {
    const users = await this.getUserEmailMap(
      members.map((member) => member.userId),
    );

    return members.map((member) => this.toProjectShareMemberDto(member, users));
  }

  private toProjectShareMemberDto(
    member: ProjectMemberEntity,
    users: Map<string, string>,
  ): ProjectShareMember {
    return projectShareMemberSchema.parse({
      ...this.toProjectMemberDto(member),
      email: users.get(member.userId) ?? null,
    });
  }

  private async getUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const rows = await this.dataSource.query<UserSummaryRow[]>(
      `
        SELECT user_id, email
        FROM users
        WHERE user_id = ANY($1)
      `,
      [uniqueUserIds],
    );

    return new Map(rows.map((row) => [row.user_id, row.email]));
  }

  private async findUserByEmail(
    email: string,
  ): Promise<UserSummaryRow | undefined> {
    const rows = await this.dataSource.query<UserSummaryRow[]>(
      `
        SELECT user_id, email
        FROM users
        WHERE lower(email) = lower($1)
      `,
      [email],
    );

    return rows[0];
  }
}
