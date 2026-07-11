import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { ProjectEntity } from "../projects/project.entity";

export type ProjectAssetStatus = "pending" | "uploaded" | "deleted";

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

  @Column({ name: "deleted_at", nullable: true, type: "timestamptz" })
  deletedAt!: Date | null;

  @Column({ name: "source_url", nullable: true, type: "text" })
  sourceUrl!: string | null;

  @Column({ nullable: true, type: "text" })
  author!: string | null;

  @Column({ nullable: true, type: "text" })
  license!: string | null;

  @Column({ name: "license_checked_at", nullable: true, type: "timestamptz" })
  licenseCheckedAt!: Date | null;

  @Column({ name: "asset_provider", nullable: true, type: "text" })
  assetProvider!: string | null;

  @Column({ name: "generation_prompt", nullable: true, type: "text" })
  generationPrompt!: string | null;

  @Column({ name: "generated_for_user_id", nullable: true, type: "text" })
  generatedForUserId!: string | null;

  @Column({ name: "generated_for_organization_id", nullable: true, type: "text" })
  generatedForOrganizationId!: string | null;

  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id", referencedColumnName: "projectId" })
  project!: ProjectEntity;
}
