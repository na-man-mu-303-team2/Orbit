import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "projects" })
export class ProjectEntity {
  @PrimaryColumn({ name: "project_id", type: "text" })
  projectId!: string;

  @Column({ name: "workspace_id", type: "text" })
  workspaceId!: string;

  @Column({ type: "text" })
  title!: string;

  @Column({ name: "created_by", type: "text" })
  createdBy!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
