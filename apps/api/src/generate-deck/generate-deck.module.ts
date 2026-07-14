import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { DeckColorOptionsController } from "./deck-color-options.controller";
import { GenerateDeckController } from "./generate-deck.controller";
import { GenerateDeckService } from "./generate-deck.service";

@Module({
  imports: [AuthModule, FilesModule, JobsModule, ProjectsModule],
  controllers: [DeckColorOptionsController, GenerateDeckController],
  providers: [GenerateDeckService]
})
export class GenerateDeckModule {}
