import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { describe, expect, it } from "vitest";
import { WorkspaceEntity } from "./workspace.entity";
import { WorkspaceInviteEntity } from "./workspace-invite.entity";
import { WorkspaceMemberEntity } from "./workspace-member.entity";
import { WorkspacesService } from "./workspaces.service";

type Store = {
  workspaces: WorkspaceEntity[];
  members: WorkspaceMemberEntity[];
  invites: WorkspaceInviteEntity[];
};

function createWorkspaceService(initial?: Partial<Store>) {
  const store: Store = {
    workspaces: initial?.workspaces ?? [],
    members: initial?.members ?? [],
    invites: initial?.invites ?? [],
  };

  const dataSource = {
    async transaction<T>(callback: (manager: MockManager) => Promise<T>) {
      return callback(createManager(store));
    },
  } as unknown as DataSource;

  return {
    service: new WorkspacesService(
      dataSource,
      createWorkspaceRepository(store),
      createMemberRepository(store),
      createInviteRepository(store),
    ),
    store,
  };
}

describe("WorkspacesService", () => {
  it("creates a workspace and owner membership", async () => {
    const { service, store } = createWorkspaceService();

    const workspace = await service.createWorkspace("user_owner", {
      name: "Orbit Team",
    });

    expect(workspace.workspaceId).toMatch(/^workspace_/);
    expect(workspace.name).toBe("Orbit Team");
    expect(store.members).toMatchObject([
      {
        workspaceId: workspace.workspaceId,
        userId: "user_owner",
        role: "owner",
      },
    ]);
  });

  it("lets only owners create hashed editor invites", async () => {
    const workspace = createWorkspace({ workspaceId: "workspace_1" });
    const { service, store } = createWorkspaceService({
      workspaces: [workspace],
      members: [
        createMember({
          workspaceId: workspace.workspaceId,
          userId: "user_owner",
          role: "owner",
        }),
      ],
    });

    const invite = await service.createInvite({
      baseUrl: "http://localhost:5173",
      input: {},
      userId: "user_owner",
      workspaceId: workspace.workspaceId,
    });

    expect(invite.role).toBe("editor");
    expect(invite.token).not.toHaveLength(0);
    expect(invite.inviteLink).toContain(encodeURIComponent(invite.token));
    expect(store.invites[0].tokenHash).not.toBe(invite.token);
  });

  it("rejects editor invite creation", async () => {
    const workspace = createWorkspace({ workspaceId: "workspace_1" });
    const { service } = createWorkspaceService({
      workspaces: [workspace],
      members: [
        createMember({
          workspaceId: workspace.workspaceId,
          userId: "user_editor",
          role: "editor",
        }),
      ],
    });

    await expect(
      service.createInvite({
        baseUrl: "http://localhost:5173",
        input: {},
        userId: "user_editor",
        workspaceId: workspace.workspaceId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accepts an invite and grants editor membership", async () => {
    const workspace = createWorkspace({ workspaceId: "workspace_1" });
    const { service } = createWorkspaceService({
      workspaces: [workspace],
      members: [
        createMember({
          workspaceId: workspace.workspaceId,
          userId: "user_owner",
          role: "owner",
        }),
      ],
    });
    const invite = await service.createInvite({
      baseUrl: "http://localhost:5173",
      input: {},
      userId: "user_owner",
      workspaceId: workspace.workspaceId,
    });

    const result = await service.acceptInvite("user_new", invite.token);

    expect(result.workspace.workspaceId).toBe(workspace.workspaceId);
    expect(result.membership).toMatchObject({
      workspaceId: workspace.workspaceId,
      userId: "user_new",
      role: "editor",
    });
  });

  it("rejects expired and duplicate invite acceptance", async () => {
    const workspace = createWorkspace({ workspaceId: "workspace_1" });
    const { service, store } = createWorkspaceService({
      workspaces: [workspace],
      members: [
        createMember({
          workspaceId: workspace.workspaceId,
          userId: "user_owner",
          role: "owner",
        }),
      ],
    });
    const invite = await service.createInvite({
      baseUrl: "http://localhost:5173",
      input: {},
      userId: "user_owner",
      workspaceId: workspace.workspaceId,
    });

    await service.acceptInvite("user_new", invite.token);
    await expect(service.acceptInvite("user_new", invite.token)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const expired = await service.createInvite({
      baseUrl: "http://localhost:5173",
      input: { expiresInHours: 1 },
      userId: "user_owner",
      workspaceId: workspace.workspaceId,
    });
    const expiredInvite = store.invites.at(-1);
    if (!expiredInvite) {
      throw new Error("Expected expired invite fixture");
    }
    expiredInvite.expiresAt = new Date(Date.now() - 1000);

    await expect(service.acceptInvite("user_other", expired.token)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

type MockManager = {
  create<T>(entity: new () => T, input: Partial<T>): T;
  save<T>(value: T): Promise<T>;
};

function createManager(store: Store): MockManager {
  return {
    create<T>(_entity: new () => T, input: Partial<T>): T {
      return input as T;
    },
    async save<T>(value: T): Promise<T> {
      saveEntity(store, value);
      return value;
    },
  };
}

function createWorkspaceRepository(store: Store) {
  return {
    create(input: Partial<WorkspaceEntity>) {
      return input as WorkspaceEntity;
    },
    async save(workspace: WorkspaceEntity) {
      saveEntity(store, workspace);
      return workspace;
    },
    async findOne(options: { where: Partial<WorkspaceEntity> }) {
      return (
        store.workspaces.find(
          (workspace) => workspace.workspaceId === options.where.workspaceId,
        ) ?? null
      );
    },
    createQueryBuilder() {
      const builder = {
        innerJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        select: () => ({
          async getRawMany() {
            return store.members.flatMap((member) => {
              const workspace = store.workspaces.find(
                (item) => item.workspaceId === member.workspaceId,
              );
              if (!workspace) return [];

              return [
                {
                  workspace_id: workspace.workspaceId,
                  name: workspace.name,
                  created_by: workspace.createdBy,
                  created_at: workspace.createdAt,
                  role: member.role,
                  joined_at: member.joinedAt,
                },
              ];
            });
          },
        }),
      };
      return builder;
    },
  } as unknown as Repository<WorkspaceEntity>;
}

function createMemberRepository(store: Store) {
  return {
    create(input: Partial<WorkspaceMemberEntity>) {
      return input as WorkspaceMemberEntity;
    },
    async save(member: WorkspaceMemberEntity) {
      saveEntity(store, member);
      return member;
    },
    async findOne(options: { where: Partial<WorkspaceMemberEntity> }) {
      return (
        store.members.find(
          (member) =>
            member.workspaceId === options.where.workspaceId &&
            member.userId === options.where.userId,
        ) ?? null
      );
    },
  } as unknown as Repository<WorkspaceMemberEntity>;
}

function createInviteRepository(store: Store) {
  return {
    create(input: Partial<WorkspaceInviteEntity>) {
      return input as WorkspaceInviteEntity;
    },
    async save(invite: WorkspaceInviteEntity) {
      saveEntity(store, invite);
      return invite;
    },
    async findOne(options: { where: Partial<WorkspaceInviteEntity> }) {
      return (
        store.invites.find((invite) => invite.tokenHash === options.where.tokenHash) ??
        null
      );
    },
    async delete() {
      return { affected: 0 };
    },
  } as unknown as Repository<WorkspaceInviteEntity>;
}

function saveEntity(store: Store, value: unknown) {
  if (isWorkspace(value)) store.workspaces.push(value);
  if (isMember(value)) store.members.push(value);
  if (isInvite(value)) store.invites.push(value);
}

function isWorkspace(value: unknown): value is WorkspaceEntity {
  return (
    typeof value === "object" &&
    value !== null &&
    "workspaceId" in value &&
    "name" in value
  );
}

function isMember(value: unknown): value is WorkspaceMemberEntity {
  return (
    typeof value === "object" &&
    value !== null &&
    "workspaceId" in value &&
    "userId" in value &&
    "role" in value &&
    !("tokenHash" in value)
  );
}

function isInvite(value: unknown): value is WorkspaceInviteEntity {
  return typeof value === "object" && value !== null && "tokenHash" in value;
}

function createWorkspace(input: Partial<WorkspaceEntity>): WorkspaceEntity {
  return {
    workspaceId: input.workspaceId ?? "workspace_1",
    name: input.name ?? "Orbit Team",
    createdBy: input.createdBy ?? "user_owner",
    createdAt: input.createdAt ?? new Date("2026-06-29T00:00:00.000Z"),
  };
}

function createMember(input: Partial<WorkspaceMemberEntity>): WorkspaceMemberEntity {
  return {
    workspaceId: input.workspaceId ?? "workspace_1",
    userId: input.userId ?? "user_owner",
    role: input.role ?? "owner",
    joinedAt: input.joinedAt ?? new Date("2026-06-29T00:00:00.000Z"),
  };
}
