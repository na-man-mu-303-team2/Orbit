import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { ActivityRunRepository } from "./activity-run.repository";
import { ActivityRunsController } from "./activity-runs.controller";
import { ActivityRunsService } from "./activity-runs.service";
import { ActivityResponseRepository } from "./activity-response.repository";
import { ActivityResponsesService } from "./activity-responses.service";
import { AudienceActivityController } from "./audience-activity.controller";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [ActivityRunsController, AudienceActivityController],
  providers: [
    ActivityRunRepository,
    ActivityRunsService,
    ActivityResponseRepository,
    ActivityResponsesService
  ],
  exports: [ActivityRunsService, ActivityResponsesService]
})
export class ActivitiesModule {}
