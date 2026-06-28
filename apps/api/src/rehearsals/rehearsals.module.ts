import { enqueueRehearsalSttJob } from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import { RehearsalsController } from "./rehearsals.controller";
import {
  REHEARSAL_STT_ENQUEUE_JOB,
  RehearsalsService,
} from "./rehearsals.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([RehearsalRunEntity]),
    DecksModule,
    FilesModule,
    JobsModule
  ],
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
