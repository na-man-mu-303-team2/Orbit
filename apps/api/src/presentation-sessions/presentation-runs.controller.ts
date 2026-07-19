import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { ProjectsService } from "../projects/projects.service";
import { PresentationRunsService } from "./presentation-runs.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller(
  "api/v1/projects/:projectId/presentation-sessions/:sessionId/runs",
)
export class PresentationRunsController {
  constructor(
    private readonly authService: AuthService,
    private readonly projects: ProjectsService,
    private readonly runs: PresentationRunsService,
  ) {}

  @Post()
  async create(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.runs.createRun(projectId, sessionId, body ?? {});
  }

  @Post(":runId/audio-upload")
  async createAudioUpload(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.runs.createAudioUpload(
      projectId,
      sessionId,
      runId,
      body ?? {},
    );
  }

  @Post(":runId/audio-complete")
  async completeAudio(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.runs.completeAudio(projectId, sessionId, runId, body ?? {});
  }

  @Post(":runId/retry-analysis")
  async retryAnalysis(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.runs.retryAnalysis(projectId, sessionId, runId);
  }

  @Get()
  async getSessionRun(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanRead(projectId, request);
    return this.runs.getSessionRun(projectId, sessionId);
  }

  @Get(":runId")
  async getRun(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanRead(projectId, request);
    return this.runs.getRun(projectId, sessionId, runId);
  }

  @Get(":runId/report")
  async getReport(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanRead(projectId, request);
    return this.runs.getReport(projectId, sessionId, runId);
  }

  private async assertCanRead(
    projectId: string,
    request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projects.assertCanReadProject(projectId, user.userId);
  }

  private async assertCanWrite(
    projectId: string,
    request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projects.assertCanWriteProject(projectId, user.userId);
  }

  private async getCurrentUser(request: SignedCookieRequest) {
    const value = request.signedCookies?.[authSessionCookieName];
    if (typeof value !== "string" || value.length === 0) {
      throw new UnauthorizedException("Authentication required");
    }
    return (await this.authService.me(value)).user;
  }
}
