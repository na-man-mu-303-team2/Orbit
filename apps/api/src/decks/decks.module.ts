import { Module } from "@nestjs/common";
import { enqueueDeckExportJob, enqueuePptxOoxmlSyncJob } from "@orbit/job-queue";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { DecksController } from "./decks.controller";
import {
  DECK_EXPORT_ENQUEUE_JOB,
  DecksService,
  PPTX_OOXML_SYNC_ENQUEUE_JOB,
} from "./decks.service";

@Module({
  imports: [AuthModule, JobsModule, ProjectsModule],
  controllers: [DecksController],
  providers: [
    DecksService,
    {
      provide: PPTX_OOXML_SYNC_ENQUEUE_JOB,
      useValue: enqueuePptxOoxmlSyncJob,
    },
    {
      provide: DECK_EXPORT_ENQUEUE_JOB,
      useValue: enqueueDeckExportJob,
    },
  ],
  exports: [DecksService],
})
export class DecksModule {}
