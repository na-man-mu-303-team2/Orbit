import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { RehearsalFocusProfilesController } from "./rehearsal-focus-profiles.controller";
import { RehearsalFocusProfilesRepository } from "./rehearsal-focus-profiles.repository";
import { RehearsalFocusProfilesService } from "./rehearsal-focus-profiles.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [RehearsalFocusProfilesController],
  providers: [RehearsalFocusProfilesRepository, RehearsalFocusProfilesService],
  exports: [RehearsalFocusProfilesService],
})
export class RehearsalFocusProfilesModule {}
