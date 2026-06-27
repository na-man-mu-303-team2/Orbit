import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { workerDatabaseOptions } from "./database";
import { WorkerService } from "./worker.service";

@Module({
  imports: [TypeOrmModule.forRoot(workerDatabaseOptions())],
  providers: [WorkerService]
})
export class WorkerModule {}
