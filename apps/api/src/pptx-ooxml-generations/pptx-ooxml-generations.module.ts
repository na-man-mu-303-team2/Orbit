import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { PptxOoxmlGenerationsController } from "./pptx-ooxml-generations.controller";
import { PptxOoxmlGenerationsService } from "./pptx-ooxml-generations.service";

@Module({
  imports: [FilesModule, JobsModule, ProjectsModule],
  controllers: [PptxOoxmlGenerationsController],
  providers: [PptxOoxmlGenerationsService]
})
export class PptxOoxmlGenerationsModule {}
