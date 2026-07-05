import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createProjectRequestSchema,
  createProjectAccessRequestSchema,
  updateProjectMemberRoleRequestSchema,
  updateProjectMemberStatusRequestSchema,
  upsertProjectMemberRequestSchema,
} from "@orbit/shared";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { authSessionCookieName } from "../auth/auth.constants";
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
    @Param("workspaceId") workspaceId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    return this.projectsService.list(workspaceId, user.userId);
  }

  @Post()
  async createProject(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(createProjectRequestSchema, body ?? {});
    const user = await this.getCurrentUser(request);
    return this.projectsService.create(
      workspaceId,
      input,
      user.userId,
    );
  }

  @Delete(":projectId")
  async deleteProject(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    return this.projectsService.delete(workspaceId, projectId, user.userId);
  }

  @Get(":projectId/members")
  async listProjectMembers(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    return this.projectsService.listMembers(workspaceId, projectId, user.userId);
  }

  @Post(":projectId/members")
  async inviteProjectMember(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(upsertProjectMemberRequestSchema, body ?? {});
    const user = await this.getCurrentUser(request);
    return this.projectsService.inviteMember(
      workspaceId,
      projectId,
      user.userId,
      input.email,
      input.role,
    );
  }

  @Patch(":projectId/members/:userId/role")
  async updateProjectMemberRole(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(updateProjectMemberRoleRequestSchema, body ?? {});
    const user = await this.getCurrentUser(request);
    return this.projectsService.updateMemberRole(
      workspaceId,
      projectId,
      user.userId,
      userId,
      input.role,
    );
  }

  @Patch(":projectId/members/:userId/status")
  async updateProjectMemberStatus(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(updateProjectMemberStatusRequestSchema, body ?? {});
    const user = await this.getCurrentUser(request);
    return this.projectsService.updateMemberStatus(
      workspaceId,
      projectId,
      user.userId,
      userId,
      input.status,
    );
  }

  @Delete(":projectId/members/:userId")
  async removeProjectMember(
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    return this.projectsService.removeMember(
      workspaceId,
      projectId,
      user.userId,
      userId,
    );
  }

  private async getCurrentUser(request: SignedCookieRequest) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      throw new UnauthorizedException("Authentication required");
    }

    return (await this.authService.me(sessionId)).user;
  }
}

@Controller("api/v1/projects")
export class ProjectAccessController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authService: AuthService,
  ) {}

  @Get(":projectId/access")
  async getProjectAccess(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    return this.projectsService.getProjectAccess(projectId, user.userId);
  }

  @Post(":projectId/access-requests")
  async requestProjectAccess(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const input = parseRequest(createProjectAccessRequestSchema, body ?? {});
    const user = await this.getCurrentUser(request);
    return this.projectsService.requestAccess(projectId, user.userId, input.role);
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
