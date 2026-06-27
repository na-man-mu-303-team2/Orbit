import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { ExtractController } from "./extract.controller";
import { ExtractService } from "./extract.service";

@Module({
  imports: [JobsModule],
  controllers: [ExtractController],
  providers: [ExtractService]
})
export class ExtractModule {}
