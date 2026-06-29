import { Column, Entity, Index, PrimaryColumn } from "typeorm";

export type ProjectMemberRole = "owner" | "editor" | "viewer";
export type ProjectMemberStatus = "pending" | "accepted" | "rejected";

@Index("idx_project_members_unique_accepted_owner", ["projectId"], {
  unique: true,
  where: "role = 'owner' AND status = 'accepted'",
})
@Entity({ name: "project_members" })
export class ProjectMemberEntity {
  @PrimaryColumn({ name: "project_id", type: "text" })
  projectId!: string;

  @PrimaryColumn({ name: "user_id", type: "text" })
  userId!: string;

  @Column({ type: "text" })
  role!: ProjectMemberRole;

  @Column({ type: "text" })
  status!: ProjectMemberStatus;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
