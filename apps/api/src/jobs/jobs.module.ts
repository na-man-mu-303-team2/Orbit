import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { JobsController } from "./jobs.controller";
import {
  JobsService,
  WORKER_HEALTH_CHECK_ENQUEUE_JOB,
  enqueueWorkerHealthCheckJob
} from "./jobs.service";

@Module({
  imports: [AuthModule, ProjectsModule],
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
