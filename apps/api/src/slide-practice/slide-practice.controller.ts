import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { normalizeHttpOrigin } from "../common/web-origin";
import { ProjectsService } from "../projects/projects.service";
import { SlidePracticeService } from "./slide-practice.service";

@Controller()
export class SlidePracticeController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly slidePracticeService: SlidePracticeService,
  ) {}

  @Post("api/v1/projects/:projectId/slide-practice-reports")
  async createReport(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.slidePracticeService.createReport(projectId, user.userId, body);
  }

  @Get("api/v1/projects/:projectId/slide-practice-reports")
  async listReports(
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.slidePracticeService.listReports(projectId, user.userId, query);
  }

  @Post("api/v1/projects/:projectId/slide-practice-analyses")
  async createAnalysis(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.slidePracticeService.createAnalysis(
      projectId,
      user.userId,
      body,
      normalizeHttpOrigin(request.get("origin")),
    );
  }

  @Post("api/v1/slide-practice-analyses/:analysisId/audio/complete")
  async completeAnalysis(
    @Param("analysisId") analysisId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.slidePracticeService.completeAnalysis(analysisId, user.userId, body);
  }

  @Get("api/v1/slide-practice-analyses/:analysisId")
  async getAnalysis(
    @Param("analysisId") analysisId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.slidePracticeService.getAnalysis(analysisId, user.userId);
  }

  @Put("api/v1/users/me/voice-baselines/:deviceIdHash")
  async upsertVoiceBaseline(
    @Param("deviceIdHash") deviceIdHash: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.slidePracticeService.upsertVoiceBaseline(user.userId, deviceIdHash, body);
  }

  @Get("api/v1/users/me/voice-baselines/:deviceIdHash")
  async getVoiceBaseline(
    @Param("deviceIdHash") deviceIdHash: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.slidePracticeService.getVoiceBaseline(user.userId, deviceIdHash);
  }
}
