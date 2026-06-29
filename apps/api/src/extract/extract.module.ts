import { enqueueReferenceExtractJob } from "@orbit/job-queue";
import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { ExtractController } from "./extract.controller";
import {
  ExtractService,
  REFERENCE_EXTRACT_ENQUEUE_JOB
} from "./extract.service";

@Module({
  imports: [JobsModule],
  controllers: [ExtractController],
  providers: [
    ExtractService,
    {
      provide: REFERENCE_EXTRACT_ENQUEUE_JOB,
      useValue: enqueueReferenceExtractJob
    }
  ]
})
export class ExtractModule {}
