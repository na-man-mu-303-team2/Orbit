import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  acceptWorkspaceInviteResponseSchema,
  workspaceInviteResponseSchema,
  workspaceListResponseSchema,
  workspaceSchema,
  workspaceWithMembershipSchema,
  type AcceptWorkspaceInviteResponse,
  type CreateWorkspaceInviteRequest,
  type CreateWorkspaceRequest,
  type Workspace,
  type WorkspaceInviteResponse,
  type WorkspaceWithMembership,
} from "@orbit/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, LessThanOrEqual, Repository } from "typeorm";
import { WorkspaceEntity } from "./workspace.entity";
import { WorkspaceInviteEntity } from "./workspace-invite.entity";
import { WorkspaceMemberEntity } from "./workspace-member.entity";

const defaultInviteTtlHours = 24 * 7;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkspaceEntity)
    private readonly workspacesRepository: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly membersRepository: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceInviteEntity)
    private readonly invitesRepository: Repository<WorkspaceInviteEntity>,
  ) {}

  async createWorkspace(
    userId: string,
    input: CreateWorkspaceRequest,
  ): Promise<Workspace> {
    const now = new Date();
    const workspace = await this.dataSource.transaction(async (manager) => {
      const created = manager.create(WorkspaceEntity, {
        workspaceId: `workspace_${randomUUID()}`,
        name: input.name,
        createdBy: userId,
        createdAt: now,
      });
      await manager.save(created);
      await manager.save(
        manager.create(WorkspaceMemberEntity, {
          workspaceId: created.workspaceId,
          userId,
          role: "owner",
          joinedAt: now,
        }),
      );

      return created;
    });

    return this.toWorkspaceDto(workspace);
  }

  async listWorkspaces(userId: string): Promise<WorkspaceWithMembership[]> {
    const rows = await this.workspacesRepository
      .createQueryBuilder("workspace")
      .innerJoin(
        WorkspaceMemberEntity,
        "member",
        "member.workspace_id = workspace.workspace_id",
      )
      .where("member.user_id = :userId", { userId })
      .orderBy("workspace.created_at", "ASC")
      .select([
        "workspace.workspace_id AS workspace_id",
        "workspace.name AS name",
        "workspace.created_by AS created_by",
        "workspace.created_at AS created_at",
        "member.role AS role",
        "member.joined_at AS joined_at",
      ])
      .getRawMany<WorkspaceMembershipRow>();

    return workspaceListResponseSchema.parse(
      rows.map((row) =>
        workspaceWithMembershipSchema.parse({
          workspaceId: row.workspace_id,
          name: row.name,
          createdBy: row.created_by,
          createdAt: toIso(row.created_at),
          role: row.role,
          joinedAt: toIso(row.joined_at),
        }),
      ),
    );
  }

  async createInvite(args: {
    baseUrl: string;
    input: CreateWorkspaceInviteRequest;
    userId: string;
    workspaceId: string;
  }): Promise<WorkspaceInviteResponse> {
    await this.assertWorkspaceOwner(args.workspaceId, args.userId);

    const token = createInviteToken();
    const now = new Date();
    const ttlHours = args.input.expiresInHours ?? defaultInviteTtlHours;
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const invite = await this.invitesRepository.save(
      this.invitesRepository.create({
        inviteId: `invite_${randomUUID()}`,
        workspaceId: args.workspaceId,
        tokenHash: hashInviteToken(token),
        createdBy: args.userId,
        role: "editor",
        expiresAt,
        createdAt: now,
      }),
    );

    return workspaceInviteResponseSchema.parse({
      inviteId: invite.inviteId,
      workspaceId: invite.workspaceId,
      createdBy: invite.createdBy,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      token,
      inviteLink: `${args.baseUrl}/workspace/invites/${encodeURIComponent(token)}`,
    });
  }

  async acceptInvite(
    userId: string,
    token: string,
  ): Promise<AcceptWorkspaceInviteResponse> {
    const tokenHash = hashInviteToken(token);
    const invite = await this.invitesRepository.findOne({ where: { tokenHash } });
    if (!invite) {
      throw new NotFoundException("Workspace invite not found");
    }

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Workspace invite expired");
    }

    const workspace = await this.workspacesRepository.findOne({
      where: { workspaceId: invite.workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const existingMember = await this.membersRepository.findOne({
      where: { workspaceId: invite.workspaceId, userId },
    });
    if (existingMember) {
      throw new ConflictException("User is already a workspace member");
    }

    const membership = await this.membersRepository.save(
      this.membersRepository.create({
        workspaceId: invite.workspaceId,
        userId,
        role: "editor",
        joinedAt: new Date(),
      }),
    );

    return acceptWorkspaceInviteResponseSchema.parse({
      workspace: this.toWorkspaceDto(workspace),
      membership: {
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
        joinedAt: membership.joinedAt.toISOString(),
      },
    });
  }

  async pruneExpiredInvites(): Promise<void> {
    await this.invitesRepository.delete({
      expiresAt: LessThanOrEqual(new Date()),
    });
  }

  private async assertWorkspaceOwner(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const workspace = await this.workspacesRepository.findOne({
      where: { workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const member = await this.membersRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member || member.role !== "owner") {
      throw new ForbiddenException("Only workspace owners can create invites");
    }
  }

  private toWorkspaceDto(workspace: WorkspaceEntity): Workspace {
    return workspaceSchema.parse({
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt.toISOString(),
    });
  }
}

type WorkspaceMembershipRow = {
  workspace_id: string;
  name: string;
  created_by: string;
  created_at: Date | string;
  role: "owner" | "editor";
  joined_at: Date | string;
};

function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
