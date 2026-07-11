import type { OrganizationRole } from "@orbit/shared";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "organization_members" })
@Index("idx_organization_members_user", ["userId"])
export class OrganizationMemberEntity {
  @PrimaryColumn({ name: "organization_id", type: "text" })
  organizationId!: string;

  @PrimaryColumn({ name: "user_id", type: "text" })
  userId!: string;

  @Column({ type: "text" })
  role!: OrganizationRole;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
