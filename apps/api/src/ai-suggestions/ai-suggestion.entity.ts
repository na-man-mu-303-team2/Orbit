import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import type { AiSuggestionStatus, DeckPatch } from "@orbit/shared";
import { ProjectEntity } from "../projects/project.entity";

@Entity({ name: "ai_suggestions" })
export class AiSuggestionEntity {
  @PrimaryColumn({ name: "suggestion_id", type: "text" })
  suggestionId!: string;

  @Column({ name: "project_id", type: "text" })
  projectId!: string;

  @Column({ name: "deck_id", type: "text" })
  deckId!: string;

  @Column({ name: "slide_id", type: "text" })
  slideId!: string;

  @Column({ name: "base_version", type: "integer" })
  baseVersion!: number;

  @Column({ type: "text" })
  title!: string;

  @Column({ nullable: true, type: "text" })
  summary!: string | null;

  @Column({ type: "jsonb" })
  patch!: DeckPatch;

  @Column({ type: "text" })
  status!: AiSuggestionStatus;

  @Column({ name: "applied_change_id", nullable: true, type: "text" })
  appliedChangeId!: string | null;

  @Column({ name: "rejected_reason", nullable: true, type: "text" })
  rejectedReason!: string | null;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id", referencedColumnName: "projectId" })
  project!: ProjectEntity;
}
