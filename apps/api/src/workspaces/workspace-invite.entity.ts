import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "workspace_invites" })
export class WorkspaceInviteEntity {
  @PrimaryColumn({ name: "invite_id", type: "text" })
  inviteId!: string;

  @Column({ name: "workspace_id", type: "text" })
  workspaceId!: string;

  @Column({ name: "token_hash", type: "text" })
  tokenHash!: string;

  @Column({ name: "created_by", type: "text" })
  createdBy!: string;

  @Column({ type: "text" })
  role!: "editor";

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
