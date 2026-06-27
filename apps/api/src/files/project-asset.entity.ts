import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { ProjectEntity } from "../projects/project.entity";

export type ProjectAssetStatus = "pending" | "uploaded";

@Entity({ name: "project_assets" })
export class ProjectAssetEntity {
  @PrimaryColumn({ name: "file_id", type: "text" })
  fileId!: string;

  @Column({ name: "project_id", type: "text" })
  projectId!: string;

  @Column({ name: "storage_key", type: "text" })
  storageKey!: string;

  @Column({ name: "original_name", type: "text" })
  originalName!: string;

  @Column({ name: "mime_type", type: "text" })
  mimeType!: string;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "text" })
  url!: string;

  @Column({ type: "text" })
  purpose!: string;

  @Column({ type: "text" })
  status!: ProjectAssetStatus;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "uploaded_at", nullable: true, type: "timestamptz" })
  uploadedAt!: Date | null;

  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id", referencedColumnName: "projectId" })
  project!: ProjectEntity;
}
