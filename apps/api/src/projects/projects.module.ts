import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ProjectMemberEntity } from "./project-member.entity";
import { ProjectEntity } from "./project.entity";
import {
  ProjectAccessRequestsController,
  ProjectMembersController,
  ProjectsController,
} from "./projects.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([ProjectEntity, ProjectMemberEntity]),
  ],
  controllers: [
    ProjectsController,
    ProjectAccessRequestsController,
    ProjectMembersController,
  ],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
