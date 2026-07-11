import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { BrandKitEntity } from "./brand-kit.entity";
import { OrganizationMemberEntity } from "./organization-member.entity";
import { OrganizationEntity } from "./organization.entity";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationMemberEntity,
      BrandKitEntity
    ])
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService]
})
export class OrganizationsModule {}
