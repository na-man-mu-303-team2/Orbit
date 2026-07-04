import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { AiTemplateDeckGenerationController } from "./ai-template-deck-generation.controller";
import { AiTemplateDeckGenerationService } from "./ai-template-deck-generation.service";

@Module({
  imports: [FilesModule, JobsModule, ProjectsModule],
  controllers: [AiTemplateDeckGenerationController],
  providers: [AiTemplateDeckGenerationService],
})
export class AiTemplateDeckGenerationModule {}
