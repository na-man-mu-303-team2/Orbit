import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { PresentationSessionsController } from "./presentation-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [PresentationSessionsController],
  providers: [PresentationSessionsService],
  exports: [PresentationSessionsService]
})
export class PresentationSessionsModule {}
