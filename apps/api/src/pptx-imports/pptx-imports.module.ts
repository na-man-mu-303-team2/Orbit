import { Module } from "@nestjs/common";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { PptxImportsController } from "./pptx-imports.controller";
import { PptxImportsService } from "./pptx-imports.service";

@Module({
  imports: [FilesModule, JobsModule, ProjectsModule],
  controllers: [PptxImportsController],
  providers: [PptxImportsService]
})
export class PptxImportsModule {}
