import { Controller, Get, Param, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { AiDeckPreviewService } from "./ai-deck-preview.service";

@Controller("api/v1/projects/:projectId/jobs/:jobId/deck-preview")
export class AiDeckPreviewController {
  constructor(
    private readonly authService: AuthService,
    private readonly previewService: AiDeckPreviewService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  async get(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.previewService.get(projectId, jobId);
  }
}
