import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createWorkspaceInviteRequestSchema,
  createWorkspaceRequestSchema,
} from "@orbit/shared";
import type { Request } from "express";
import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { parseRequest } from "../common/zod-request";
import { WorkspacesService } from "./workspaces.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/workspaces")
export class WorkspacesController {
  constructor(
    private readonly authService: AuthService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Get()
  async listWorkspaces(@Req() request: SignedCookieRequest) {
    const { user } = await this.getSession(request);
    return this.workspacesService.listWorkspaces(user.userId);
  }

  @Post()
  async createWorkspace(
    @Req() request: SignedCookieRequest,
    @Body() body: unknown,
  ) {
    const { user } = await this.getSession(request);
    return this.workspacesService.createWorkspace(
      user.userId,
      parseRequest(createWorkspaceRequestSchema, body),
    );
  }

  @Post(":workspaceId/invites")
  async createInvite(
    @Req() request: SignedCookieRequest,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    const { user } = await this.getSession(request);
    return this.workspacesService.createInvite({
      baseUrl: getBaseUrl(request),
      input: parseRequest(createWorkspaceInviteRequestSchema, body ?? {}),
      userId: user.userId,
      workspaceId,
    });
  }

  @Post("invites/:token/accept")
  async acceptInvite(
    @Req() request: SignedCookieRequest,
    @Param("token") token: string,
  ) {
    const { user } = await this.getSession(request);
    return this.workspacesService.acceptInvite(user.userId, token);
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

function getBaseUrl(request: Request): string {
  const forwardedProto = firstHeader(request.headers["x-forwarded-proto"]);
  const proto = forwardedProto || request.protocol || "http";
  const host = firstHeader(request.headers["x-forwarded-host"]) || request.get("host");
  return `${proto}://${host}`;
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
