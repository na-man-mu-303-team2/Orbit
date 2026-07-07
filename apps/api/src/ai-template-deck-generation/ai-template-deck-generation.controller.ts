import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { AiTemplateDeckGenerationService } from "./ai-template-deck-generation.service";

@Controller("api/v1/projects/:projectId/jobs")
export class AiTemplateDeckGenerationController {
  constructor(
    private readonly authService: AuthService,
    private readonly aiTemplateDeckGenerationService: AiTemplateDeckGenerationService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post("ai-template-deck-generation")
  async createJob(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.aiTemplateDeckGenerationService.createJob(projectId, body);
  }
}
