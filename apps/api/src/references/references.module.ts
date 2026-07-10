import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExtractModule } from "../extract/extract.module";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { ReferencesController } from "./references.controller";
import { ReferencesService } from "./references.service";

@Module({
  imports: [AuthModule, ExtractModule, FilesModule, ProjectsModule],
  controllers: [ReferencesController],
  providers: [ReferencesService],
  exports: [ReferencesService]
})
export class ReferencesModule {}
