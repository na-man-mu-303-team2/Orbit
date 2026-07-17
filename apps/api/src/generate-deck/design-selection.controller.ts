import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { DesignSelectionService } from "./design-selection.service";

@Controller("api/v1/projects/:projectId/jobs/:jobId/design-selection")
export class DesignSelectionController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly designSelectionService: DesignSelectionService,
  ) {}

  @Get()
  async get(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.designSelectionService.get(projectId, jobId);
  }

  @Put()
  async put(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.designSelectionService.select(projectId, jobId, body);
  }
}
