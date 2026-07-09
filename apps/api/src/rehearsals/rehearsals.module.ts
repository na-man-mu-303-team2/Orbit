import { enqueueRehearsalSttJob } from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProjectEntity } from "../projects/project.entity";
import { DeckSlideContextsEntity } from "./deck-slide-contexts.entity";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";
import { RehearsalsController } from "./rehearsals.controller";
import { REHEARSAL_STT_ENQUEUE_JOB, RehearsalsService } from "./rehearsals.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([DeckSlideContextsEntity, RehearsalRunEntity, ProjectEntity]),
    AuthModule,
    DecksModule,
    FilesModule,
    JobsModule,
    ProjectsModule
  ],
  controllers: [RehearsalsController],
  providers: [
    RehearsalsService,
    RedisRehearsalTranscriptCache,
    {
      provide: REHEARSAL_STT_ENQUEUE_JOB,
      useValue: enqueueRehearsalSttJob
    }
  ]
})
export class RehearsalsModule {}
