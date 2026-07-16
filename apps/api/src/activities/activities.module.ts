import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { PresentationSessionsModule } from "../presentation-sessions/presentation-sessions.module";
import { ActivityRunRepository } from "./activity-run.repository";
import { ActivityRunsController } from "./activity-runs.controller";
import { ActivityRunsService } from "./activity-runs.service";
import { ActivityResponseRepository } from "./activity-response.repository";
import { ActivityResponsesService } from "./activity-responses.service";
import { AudienceActivityController } from "./audience-activity.controller";
import { ActivityResultsRepository } from "./activity-results.repository";
import { ActivityResultsService } from "./activity-results.service";
import { ActivityRealtimeGateway } from "./activity-realtime.gateway";
import { ActivityRealtimePublisher } from "./activity-realtime.publisher";

@Module({
  imports: [AuthModule, ProjectsModule, PresentationSessionsModule],
  controllers: [ActivityRunsController, AudienceActivityController],
  providers: [
    ActivityRunRepository,
    ActivityRunsService,
    ActivityResponseRepository,
    ActivityResponsesService,
    ActivityResultsRepository,
    ActivityResultsService,
    ActivityRealtimePublisher,
    ActivityRealtimeGateway
  ],
  exports: [ActivityRunsService, ActivityResponsesService, ActivityResultsService]
})
export class ActivitiesModule {}
