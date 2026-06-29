import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { authSessionCookieName } from "../auth/auth.constants";
import { ProjectsService } from "../projects/projects.service";
import { DecksService } from "./decks.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/projects/:projectId")
export class DecksController {
  constructor(
    private readonly decksService: DecksService,
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService
  ) {}

  @Get("deck")
  async getDeck(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string
  ) {
    const { user } = await this.getSession(request);
    await this.projectsService.assertProjectAccess(projectId, user.userId);

    return this.decksService.getDeck(projectId);
  }

  @Put("deck")
  async putDeck(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ) {
    const { user } = await this.getSession(request);
    await this.projectsService.assertProjectAccess(projectId, user.userId);

    return this.decksService.putDeck(projectId, body);
  }

  @Post("deck/patches")
  async appendPatch(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ) {
    const { user } = await this.getSession(request);
    await this.projectsService.assertProjectAccess(projectId, user.userId);

    return this.decksService.appendPatch(projectId, body);
  }

  @Get("snapshots")
  async listSnapshots(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string
  ) {
    const { user } = await this.getSession(request);
    await this.projectsService.assertProjectAccess(projectId, user.userId);

    return this.decksService.listSnapshots(projectId);
  }

  @Post("snapshots/:snapshotId/restore")
  async restoreSnapshot(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Param("snapshotId") snapshotId: string
  ) {
    const { user } = await this.getSession(request);
    await this.projectsService.assertProjectAccess(projectId, user.userId);

    return this.decksService.restoreSnapshot(projectId, snapshotId);
  }

  private async getSession(request: SignedCookieRequest) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      throw new UnauthorizedException("Authentication required");
    }

    return this.authService.me(sessionId);
  }
}

function getSignedSessionId(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[authSessionCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}
