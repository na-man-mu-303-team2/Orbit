import { Module } from "@nestjs/common";
import { JobsController } from "./jobs.controller";
import {
  JobsService,
  WORKER_HEALTH_CHECK_ENQUEUE_JOB,
  enqueueWorkerHealthCheckJob
} from "./jobs.service";

@Module({
  controllers: [JobsController],
  providers: [
    JobsService,
    {
      provide: WORKER_HEALTH_CHECK_ENQUEUE_JOB,
      useValue: enqueueWorkerHealthCheckJob
    }
  ],
  exports: [JobsService]
})
export class JobsModule {}
