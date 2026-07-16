import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectsModule } from "../projects/projects.module";
import { AudienceSessionsController } from "./audience-sessions.controller";
import { PresentationSessionsController } from "./presentation-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";
import { PresentationSessionRepository } from "./presentation-session.repository";

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AudienceSessionsController, PresentationSessionsController],
  providers: [PresentationSessionRepository, PresentationSessionsService],
  exports: [PresentationSessionsService]
})
export class PresentationSessionsModule {}
