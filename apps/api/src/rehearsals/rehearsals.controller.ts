import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Response } from "express";
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
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.createRun(projectId, user.userId, body);
  }

  @Post("api/v1/rehearsals/:runId/audio/upload-url")
  async createAudioUploadUrl(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.createAudioUploadUrl(runId, user.userId, body);
  }

  @Get(
    "api/v1/projects/:projectId/rehearsal-slide-snapshots/:fileId/content",
  )
  async readSlideSnapshotContent(
    @Param("projectId") projectId: string,
    @Param("fileId") fileId: string,
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    const asset = await this.rehearsalsService.readSlideSnapshotContent(
      projectId,
      fileId,
      user.userId,
    );
    response.setHeader("content-type", asset.contentType);
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("x-content-type-options", "nosniff");
    return new StreamableFile(asset.body);
  }

  @Post("api/v1/rehearsals/:runId/audio/complete")
  async completeAudioUpload(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.completeAudioUpload(runId, user.userId, body);
  }

  @Post("api/v1/rehearsals/:runId/cancel")
  async cancelRun(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.cancelRun(runId, user.userId);
  }

  @Post("api/v1/rehearsals/:runId/semantic-evaluation/retry")
  async retrySemanticEvaluation(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.retrySemanticEvaluation(runId, user.userId);
  }

  @Patch("api/v1/rehearsals/:runId/meta")
  async updateRunMeta(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.updateRunMeta(runId, user.userId, body);
  }

  @Get("api/v1/projects/:projectId/rehearsals")
  async listRuns(
    @Param("projectId") projectId: string,
    @Query() query: Record<string, string>,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.listRuns(projectId, user.userId, query);
  }

  @Get("api/v1/projects/:projectId/rehearsals/:runId/comparison")
  async getComparison(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.getComparison(projectId, runId, user.userId);
  }

  @Get("api/v1/rehearsals/:runId")
  async getRun(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.getRun(runId, user.userId);
  }

  @Get("api/v1/rehearsals/:runId/report")
  async getReport(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.getReport(runId, user.userId);
  }

  @Get("api/v1/rehearsals/:runId/audio/playback-url")
  async getAudioPlaybackUrl(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.rehearsalsService.getAudioPlaybackUrl(runId, user.userId);
  }

  @Get("api/v1/projects/:projectId/rehearsal-summary")
  async getSummary(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.getSummary(projectId, user.userId);
  }
}
