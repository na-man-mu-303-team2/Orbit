import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { GenerateDeckService } from "./generate-deck.service";

@Controller("api/v1/projects/:projectId/jobs")
export class GenerateDeckController {
  constructor(
    private readonly authService: AuthService,
    private readonly generateDeckService: GenerateDeckService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post("generate-deck")
  async createJob(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.generateDeckService.createJob(projectId, body);
  }
}
