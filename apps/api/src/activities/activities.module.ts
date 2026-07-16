import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { ActivityRunRepository } from "./activity-run.repository";
import { ActivityRunsController } from "./activity-runs.controller";
import { ActivityRunsService } from "./activity-runs.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ActivityRunsController],
  providers: [ActivityRunRepository, ActivityRunsService],
  exports: [ActivityRunsService]
})
export class ActivitiesModule {}
