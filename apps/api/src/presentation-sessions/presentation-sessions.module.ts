import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { ProjectsModule } from "../projects/projects.module";
import { AudienceRealtimeGateway } from "../realtime/audience-realtime.gateway";
import { AudienceSessionsController } from "./audience-sessions.controller";
import { PresentationSessionsController } from "./presentation-sessions.controller";
import { PresentationSessionsService } from "./presentation-sessions.service";

@Module({
  imports: [AuthModule, FilesModule, ProjectsModule],
  controllers: [AudienceSessionsController, PresentationSessionsController],
  providers: [AudienceRealtimeGateway, PresentationSessionsService],
  exports: [PresentationSessionsService]
})
export class PresentationSessionsModule {}
