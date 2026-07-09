import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { ProjectEntity } from "../projects/project.entity";

@Entity({ name: "deck_slide_contexts" })
export class DeckSlideContextsEntity {
  @PrimaryColumn({ name: "project_id", type: "text" })
  projectId!: string;

  @Column({ name: "deck_id", type: "text" })
  deckId!: string;

  @Column({ name: "contexts_json", type: "jsonb", default: [] })
  contextsJson!: unknown[];

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne(() => ProjectEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id", referencedColumnName: "projectId" })
  project!: ProjectEntity;
}
