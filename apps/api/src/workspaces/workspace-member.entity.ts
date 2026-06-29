import { Column, Entity, PrimaryColumn } from "typeorm";
import type { WorkspaceRole } from "@orbit/shared";

@Entity({ name: "workspace_members" })
export class WorkspaceMemberEntity {
  @PrimaryColumn({ name: "workspace_id", type: "text" })
  workspaceId!: string;

  @PrimaryColumn({ name: "user_id", type: "text" })
  userId!: string;

  @Column({ type: "text" })
  role!: WorkspaceRole;

  @Column({ name: "joined_at", type: "timestamptz" })
  joinedAt!: Date;
}
