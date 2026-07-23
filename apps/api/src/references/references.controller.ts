import {
  referenceExtractionRequestSchema,
  type ReferenceExtractionRequest
} from "@orbit/shared";
import { Body, Controller, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { RequiresAsyncJobAdmission } from "../common/async-job-admission.guard";
import { referenceSearchRequestSchema } from "./references.schema";
import { ReferencesService } from "./references.service";

@Controller("api/v1/projects/:projectId/references")
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

  @Post("extractions")
  @RequiresAsyncJobAdmission()
  async extractReferences(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.referencesService.extract(
      projectId,
      referenceExtractionRequestSchema.parse(body) as ReferenceExtractionRequest
    );
  }
}
