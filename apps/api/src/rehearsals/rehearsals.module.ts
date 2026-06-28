import { enqueueRehearsalSttJob } from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { RehearsalsController } from "./rehearsals.controller";
import {
  REHEARSAL_STT_ENQUEUE_JOB,
  RehearsalsService,
} from "./rehearsals.service";

@Module({
  imports: [DecksModule, FilesModule, JobsModule],
  controllers: [RehearsalsController],
  providers: [
    RehearsalsService,
    {
      provide: REHEARSAL_STT_ENQUEUE_JOB,
      useValue: enqueueRehearsalSttJob,
    },
  ],
})
export class RehearsalsModule {}
