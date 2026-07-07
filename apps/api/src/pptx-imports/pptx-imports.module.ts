import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { JobsModule } from "../jobs/jobs.module";
import { ProjectsModule } from "../projects/projects.module";
import { PptxImportsController } from "./pptx-imports.controller";
import { PptxImportsService } from "./pptx-imports.service";

@Module({
  imports: [AuthModule, FilesModule, JobsModule, ProjectsModule],
  controllers: [PptxImportsController],
  providers: [PptxImportsService]
})
export class PptxImportsModule {}
