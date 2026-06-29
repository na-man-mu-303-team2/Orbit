import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module";
import { GenerateDeckController } from "./generate-deck.controller";
import { GenerateDeckService } from "./generate-deck.service";

@Module({
  imports: [JobsModule],
  controllers: [GenerateDeckController],
  providers: [GenerateDeckService]
})
export class GenerateDeckModule {}
