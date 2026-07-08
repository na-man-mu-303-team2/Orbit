import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import type { SlideBaseline } from "@orbit/shared";
import { ProjectEntity } from "../projects/project.entity";

export type RehearsalRunStatus = "created" | "uploading" | "processing" | "succeeded" | "failed";

@Entity({ name: "rehearsal_runs" })
export class RehearsalRunEntity {
  @PrimaryColumn({ name: "run_id", type: "text" })
  runId!: string;

  @Column({ name: "project_id", type: "text" })
  projectId!: string;

  @Column({ name: "deck_id", type: "text" })
  deckId!: string;

  @Column({ name: "audio_file_id", nullable: true, type: "text" })
  audioFileId!: string | null;

  @Column({ name: "job_id", nullable: true, type: "text" })
  jobId!: string | null;

  @Column({ type: "text" })
  status!: RehearsalRunStatus;

  @Column({ nullable: true, type: "jsonb" })
  error!: { code: string; message: string } | null;

  @Column({ name: "report_json", nullable: true, type: "jsonb" })
  rehearsalReport!: Record<string, unknown> | null;

  @Column({ default: {}, name: "meta_json", type: "jsonb" })
  metaJson!: Record<string, unknown>;

  @Column({ default: false, name: "transcript_retained", type: "boolean" })
  transcriptRetained!: boolean;

  @Column({ name: "raw_audio_deleted_at", nullable: true, type: "timestamptz" })
  rawAudioDeletedAt!: Date | null;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @Column({ name: "slide_baselines", nullable: true, type: "jsonb" })
  slideBaselines!: SlideBaseline[] | null;

  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id", referencedColumnName: "projectId" })
  project!: ProjectEntity;
}
