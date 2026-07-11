import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { PresentationBriefsController } from "./presentation-briefs.controller";
import { PresentationBriefsService } from "./presentation-briefs.service";

@Module({
  imports: [AuthModule, FilesModule, ProjectsModule],
  controllers: [PresentationBriefsController],
  providers: [PresentationBriefsService],
  exports: [PresentationBriefsService],
})
export class PresentationBriefsModule {}

