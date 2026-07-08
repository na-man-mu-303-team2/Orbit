import { Module } from "@nestjs/common";
import { enqueueAudienceSlideRenderJob } from "@orbit/job-queue";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { AudienceRealtimeGateway } from "../realtime/audience-realtime.gateway";
import { AudienceSessionsController } from "./audience-sessions.controller";
import { PresentationSessionsController } from "./presentation-sessions.controller";
import {
  AUDIENCE_SLIDE_RENDER_ENQUEUE_JOB,
  PresentationSessionsService
} from "./presentation-sessions.service";

@Module({
  imports: [AuthModule, FilesModule, JobsModule, ProjectsModule],
  controllers: [AudienceSessionsController, PresentationSessionsController],
  providers: [
    AudienceRealtimeGateway,
    PresentationSessionsService,
    {
      provide: AUDIENCE_SLIDE_RENDER_ENQUEUE_JOB,
      useValue: enqueueAudienceSlideRenderJob
    }
  ],
  exports: [PresentationSessionsService]
})
export class PresentationSessionsModule {}
