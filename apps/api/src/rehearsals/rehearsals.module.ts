import {
  enqueueRehearsalSemanticEvaluationJob,
  enqueueRehearsalSttJob
} from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProjectEntity } from "../projects/project.entity";
import { PresentationBriefsModule } from "../presentation-briefs/presentation-briefs.module";
import { RehearsalFocusProfilesModule } from "../rehearsal-focus-profiles/rehearsal-focus-profiles.module";
import { RehearsalRunEntity } from "./rehearsal-run.entity";
import { RedisRehearsalTranscriptCache } from "./rehearsal-transcript-cache";
import { RehearsalsController } from "./rehearsals.controller";
import {
  REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_JOB,
  REHEARSAL_STT_ENQUEUE_JOB,
  RehearsalsService
} from "./rehearsals.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([RehearsalRunEntity, ProjectEntity]),
    AuthModule,
    DecksModule,
    FilesModule,
    JobsModule,
    ProjectsModule,
    PresentationBriefsModule,
    RehearsalFocusProfilesModule
  ],
  controllers: [RehearsalsController],
  providers: [
    RehearsalsService,
    RedisRehearsalTranscriptCache,
    {
      provide: REHEARSAL_STT_ENQUEUE_JOB,
      useValue: enqueueRehearsalSttJob
    },
    {
      provide: REHEARSAL_SEMANTIC_EVALUATION_ENQUEUE_JOB,
      useValue: enqueueRehearsalSemanticEvaluationJob
    }
  ]
})
export class RehearsalsModule {}
