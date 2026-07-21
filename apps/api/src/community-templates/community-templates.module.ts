import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DecksModule } from "../decks/decks.module";
import { ProjectsModule } from "../projects/projects.module";
import {
  CommunityTemplatesController,
  WorkspaceCommunityTemplatesController,
} from "./community-templates.controller";
import { CommunityTemplatesService } from "./community-templates.service";
import { CommunityTemplateRateLimitService } from "./community-template-rate-limit.service";

@Module({
  imports: [AuthModule, ProjectsModule, DecksModule],
  controllers: [
    CommunityTemplatesController,
    WorkspaceCommunityTemplatesController,
  ],
  providers: [CommunityTemplatesService, CommunityTemplateRateLimitService],
})
export class CommunityTemplatesModule {}
