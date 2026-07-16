import { Body, Controller, Param, Patch, Post, Put, Req, UnauthorizedException } from "@nestjs/common";
import {
  ensureActivityRunRequestSchema,
  supersedeActivityRunRequestSchema,
  updateActivityRunStatusRequestSchema
} from "@orbit/shared";
import type { Request } from "express";

import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "../projects/projects.service";
import { ActivityRunsService } from "./activity-runs.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/projects/:projectId/presentation-sessions/:sessionId")
export class ActivityRunsController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly activityRunsService: ActivityRunsService
  ) {}

  @Put("activities/:activityId/current-run")
  async ensureCurrentRun(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("activityId") activityId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    parseRequest(ensureActivityRunRequestSchema, body ?? {});
    await this.assertCanOperate(projectId, request);
    return this.activityRunsService.ensureCurrentRun(projectId, sessionId, activityId);
  }

  @Post("activity-runs/:runId/supersede")
  async supersede(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const input = parseRequest(supersedeActivityRunRequestSchema, body ?? {});
    await this.assertCanOperate(projectId, request);
    return this.activityRunsService.supersede(projectId, sessionId, runId, input);
  }

  @Patch("activity-runs/:runId/status")
  async updateStatus(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("runId") runId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const input = parseRequest(updateActivityRunStatusRequestSchema, body ?? {});
    await this.assertCanOperate(projectId, request);
    return this.activityRunsService.updateStatus(projectId, sessionId, runId, input);
  }

  private async assertCanOperate(projectId: string, request: SignedCookieRequest) {
    const value = request.signedCookies?.[authSessionCookieName];
    if (typeof value !== "string" || value.length === 0) {
      throw new UnauthorizedException("Authentication required");
    }
    const user = (await this.authService.me(value)).user;
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
  }
}
