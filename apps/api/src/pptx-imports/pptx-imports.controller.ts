import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { PptxImportsService } from "./pptx-imports.service";

@Controller("api/v1/projects/:projectId/pptx-imports")
export class PptxImportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly pptxImportsService: PptxImportsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  async createImport(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.pptxImportsService.createImport(projectId, body);
  }
}
