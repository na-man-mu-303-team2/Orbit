import { enqueueReferenceExtractJob } from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { ExtractController } from "./extract.controller";
import {
  ExtractService,
  REFERENCE_EXTRACT_ENQUEUE_JOB
} from "./extract.service";

@Module({
  imports: [AuthModule, JobsModule, ProjectsModule],
  controllers: [ExtractController],
  providers: [
    ExtractService,
    {
      provide: REFERENCE_EXTRACT_ENQUEUE_JOB,
      useValue: enqueueReferenceExtractJob
    }
  ],
  exports: [ExtractService]
})
export class ExtractModule {}
