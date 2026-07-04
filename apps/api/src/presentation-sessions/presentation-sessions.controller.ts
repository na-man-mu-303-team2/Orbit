import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createPresentationSessionRequestSchema,
  updateAudienceFeatureSettingsRequestSchema,
  updatePresentationSessionEntryRequestSchema,
} from "@orbit/shared";
import type { Request } from "express";
import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "../projects/projects.service";
import { PresentationSessionsService } from "./presentation-sessions.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/projects/:projectId/presentation-sessions")
export class PresentationSessionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly presentationSessionsService: PresentationSessionsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get("current")
  async getCurrent(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.getCurrent(projectId);
  }

  @Post()
  async create(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(
      createPresentationSessionRequestSchema,
      body ?? {},
    );
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.create(
      projectId,
      user.userId,
      input,
    );
  }

  @Patch(":sessionId/entry")
  async updateEntryStatus(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(
      updatePresentationSessionEntryRequestSchema,
      body ?? {},
    );
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.updateEntryStatus(
      projectId,
      sessionId,
      input.entryStatus,
    );
  }

  @Get(":sessionId/features")
  async getFeatureSettings(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.getAudienceFeatureSettings(
      projectId,
      sessionId,
    );
  }

  @Patch(":sessionId/features")
  async updateFeatureSettings(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(
      updateAudienceFeatureSettingsRequestSchema,
      body ?? {},
    );
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.updateAudienceFeatureSettings({
      projectId,
      sessionId,
      actorId: user.userId,
      settings: input,
    });
  }

  private async getCurrentUser(request: SignedCookieRequest) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      throw new UnauthorizedException("Authentication required");
    }

    return (await this.authService.me(sessionId)).user;
  }
}

function getSignedSessionId(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[authSessionCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}
