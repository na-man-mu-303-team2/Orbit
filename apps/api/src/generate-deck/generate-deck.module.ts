import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { GenerateDeckController } from "./generate-deck.controller";
import { GenerateDeckService } from "./generate-deck.service";

@Module({
  imports: [FilesModule, JobsModule, ProjectsModule],
  controllers: [GenerateDeckController],
  providers: [GenerateDeckService]
})
export class GenerateDeckModule {}
