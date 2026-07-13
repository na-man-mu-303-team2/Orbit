import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity({ name: "organizations" })
export class OrganizationEntity {
  @PrimaryColumn({ name: "organization_id", type: "text" })
  organizationId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ name: "created_by", type: "text" })
  createdBy!: string;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
