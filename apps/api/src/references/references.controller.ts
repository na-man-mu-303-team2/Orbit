import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { referenceSearchRequestSchema } from "./references.schema";
import { ReferencesService } from "./references.service";

@Controller("projects/:projectId/references")
export class ReferencesController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly referencesService: ReferencesService,
  ) {}

  @Post("search")
  async searchReferences(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.referencesService.search(
      projectId,
      referenceSearchRequestSchema.parse(body)
    );
  }
}
