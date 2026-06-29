import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "workspaces" })
export class WorkspaceEntity {
  @PrimaryColumn({ name: "workspace_id", type: "text" })
  workspaceId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "created_by", type: "text" })
  createdBy!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
