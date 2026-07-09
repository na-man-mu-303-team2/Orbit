import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { RehearsalsService } from "./rehearsals.service";

@Controller()
export class RehearsalsController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly rehearsalsService: RehearsalsService,
  ) {}

  @Post("api/v1/projects/:projectId/rehearsals")
  async createRun(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.rehearsalsService.createRun(projectId, body);
  }

  @Post("api/v1/rehearsals/:runId/audio/upload-url")
  async createAudioUploadUrl(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.createAudioUploadUrl(runId, body);
  }

  @Post("api/v1/rehearsals/:runId/audio/complete")
  async completeAudioUpload(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.completeAudioUpload(runId, body);
  }

  @Patch("api/v1/rehearsals/:runId/meta")
  async updateRunMeta(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.updateRunMeta(runId, body);
  }

  @Get("api/v1/projects/:projectId/rehearsals")
  async listRuns(
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string>,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.listRuns(projectId, query);
  }

  @Get("api/v1/rehearsals/:runId")
  async getRun(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanReadRun(runId, user.userId);
    return this.rehearsalsService.getRun(runId);
  }

  @Get("api/v1/rehearsals/:runId/report")
  async getReport(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanReadRun(runId, user.userId);
    return this.rehearsalsService.getReport(runId);
  }

  @Get("api/v1/projects/:projectId/rehearsal-summary")
  async getSummary(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.getSummary(projectId);
  }

  @Get("api/v1/projects/:projectId/rehearsal-contexts")
  async getSlideContexts(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.getSlideContexts(projectId);
  }

  @Put("api/v1/projects/:projectId/rehearsal-contexts")
  async updateSlideContexts(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.rehearsalsService.updateSlideContexts(projectId, body);
  }

  private async assertCanReadRun(runId: string, userId: string) {
    const projectId = await this.rehearsalsService.getRunProjectId(runId);
    await this.projectsService.assertCanReadProject(projectId, userId);
  }

  private async assertCanWriteRun(runId: string, userId: string) {
    const projectId = await this.rehearsalsService.getRunProjectId(runId);
    await this.projectsService.assertCanWriteProject(projectId, userId);
  }
}
