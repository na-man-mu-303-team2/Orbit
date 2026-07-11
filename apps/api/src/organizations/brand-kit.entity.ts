import type { BrandKitValues } from "@orbit/shared";
import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity({ name: "brand_kits" })
@Index("idx_brand_kits_organization_updated", ["organizationId", "updatedAt"])
export class BrandKitEntity {
  @PrimaryColumn({ name: "brand_kit_id", type: "text" })
  brandKitId!: string;

  @Column({ name: "organization_id", type: "text" })
  organizationId!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "integer" })
  version!: number;

  @Column({ name: "values_json", type: "jsonb" })
  values!: BrandKitValues;

  @Column({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @Column({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
