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
  createProjectRequestSchema,
  projectAccessRequestSchema,
  projectMemberInviteSchema,
  projectMemberUpdateSchema,
} from "@orbit/shared";
import type { Request } from "express";
import { authSessionCookieName } from "../auth/auth.constants";
import { AuthService } from "../auth/auth.service";
import { parseRequest } from "../common/zod-request";
import { ProjectsService } from "./projects.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/workspaces/:workspaceId/projects")
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async listProjects(
    @Req() request: SignedCookieRequest,
    @Param("workspaceId") workspaceId: string,
  ) {
    const { user } = await this.getSession(request);

    return this.projectsService.list(workspaceId, user.userId);
  }

  @Post()
  async createProject(
    @Req() request: SignedCookieRequest,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(createProjectRequestSchema, body ?? {});
    const { user } = await this.getSession(request);

    return this.projectsService.create(
      workspaceId,
      user.userId,
      input,
    );
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

@Controller("api/v1/projects/:projectId/access-requests")
export class ProjectAccessRequestsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async requestProjectAccess(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(projectAccessRequestSchema, body ?? {});
    const { user } = await this.getSession(request);

    return this.projectsService.requestAccess(projectId, user.userId, input);
  }

  @Get("me")
  async getMyProjectAccessRequest(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
  ) {
    const { user } = await this.getSession(request);

    return this.projectsService.getAccessRequestStatus(projectId, user.userId);
  }

  private async getSession(request: SignedCookieRequest) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      throw new UnauthorizedException("Authentication required");
    }

    return this.authService.me(sessionId);
  }
}

@Controller("api/v1/projects/:projectId/members")
export class ProjectMembersController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async getProjectMembers(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
  ) {
    const { user } = await this.getSession(request);

    return this.projectsService.getShareState(projectId, user.userId);
  }

  @Post()
  async inviteProjectMember(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(projectMemberInviteSchema, body ?? {});
    const { user } = await this.getSession(request);

    return this.projectsService.inviteProjectMember(
      projectId,
      user.userId,
      input,
    );
  }

  @Patch(":userId")
  async updateProjectMember(
    @Req() request: SignedCookieRequest,
    @Param("projectId") projectId: string,
    @Param("userId") memberUserId: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(projectMemberUpdateSchema, body ?? {});
    const { user } = await this.getSession(request);

    return this.projectsService.updateProjectMember(
      projectId,
      user.userId,
      memberUserId,
      input,
    );
  }

  private async getSession(request: SignedCookieRequest) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      throw new UnauthorizedException("Authentication required");
    }

    return this.authService.me(sessionId);
  }
}
