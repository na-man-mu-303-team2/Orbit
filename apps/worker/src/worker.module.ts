import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { workerDatabaseOptions } from "./database";
import { createWorkerLoggerParams } from "./logging";
import { WorkerService } from "./worker.service";

@Module({
  imports: [
    LoggerModule.forRoot(createWorkerLoggerParams()),
    TypeOrmModule.forRoot(workerDatabaseOptions())
  ],
  providers: [WorkerService]
})
export class WorkerModule {}
