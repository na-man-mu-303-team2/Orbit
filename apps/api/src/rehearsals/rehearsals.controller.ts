import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { RequiresAsyncJobAdmission } from "../common/async-job-admission.guard";
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
  @RequiresAsyncJobAdmission()
  async completeAudioUpload(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.completeAudioUpload(runId, body);
  }

  @Post("api/v1/rehearsals/:runId/cancel")
  async cancelRun(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.cancelRun(runId);
  }

  @Post("api/v1/rehearsals/:runId/semantic-evaluation/retry")
  @RequiresAsyncJobAdmission()
  async retrySemanticEvaluation(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanWriteRun(runId, user.userId);
    return this.rehearsalsService.retrySemanticEvaluation(runId);
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

  @Get("api/v1/projects/:projectId/rehearsals/:runId/comparison")
  async getComparison(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.rehearsalsService.getComparison(projectId, runId);
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

  @Post("api/v1/rehearsals/:runId/audio/clip")
  async getAudioClip(
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanReadRun(runId, user.userId);
    const clip = await this.rehearsalsService.getAudioClip(runId, body);
    return new StreamableFile(clip.body, {
      type: clip.contentType,
      disposition: "inline",
      length: clip.body.byteLength,
    });
  }
  @Get("api/v1/rehearsals/:runId/audio/playback-url")
  async getAudioPlaybackUrl(
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanReadRun(runId, user.userId);
    return this.rehearsalsService.getAudioPlaybackUrl(runId);
  }

  @Get("api/v1/rehearsals/:runId/downloads/:artifact")
  async downloadArtifact(
    @Param("runId") runId: string,
    @Param("artifact") artifact: string,
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.assertCanReadRun(runId, user.userId);
    if (artifact !== "audio" && artifact !== "transcript") {
      throw new NotFoundException("Rehearsal download not found.");
    }
    const download = await this.rehearsalsService.getDownload(runId, artifact);
    response.setHeader("content-type", download.contentType);
    response.setHeader(
      "content-disposition",
      `attachment; filename="${download.fileName}"`,
    );
    response.setHeader("content-length", download.body.byteLength);
    return new StreamableFile(download.body);
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

  private async assertCanReadRun(runId: string, userId: string) {
    const projectId = await this.rehearsalsService.getRunProjectId(runId);
    await this.projectsService.assertCanReadProject(projectId, userId);
  }

  private async assertCanWriteRun(runId: string, userId: string) {
    const projectId = await this.rehearsalsService.getRunProjectId(runId);
    await this.projectsService.assertCanWriteProject(projectId, userId);
  }
}
