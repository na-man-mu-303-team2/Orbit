import { Module } from "@nestjs/common";
import { enqueuePptxOoxmlSyncJob } from "@orbit/job-queue";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { DecksController } from "./decks.controller";
import { DecksService, PPTX_OOXML_SYNC_ENQUEUE_JOB } from "./decks.service";

@Module({
  imports: [AuthModule, JobsModule, ProjectsModule],
  controllers: [DecksController],
  providers: [
    DecksService,
    {
      provide: PPTX_OOXML_SYNC_ENQUEUE_JOB,
      useValue: enqueuePptxOoxmlSyncJob,
    },
  ],
  exports: [DecksService],
})
export class DecksModule {}
