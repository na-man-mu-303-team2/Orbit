import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  communityTemplateIdSchema,
  communityTemplateListQuerySchema,
  publishCommunityTemplateRequestSchema,
  useCommunityTemplateRequestSchema,
} from "@orbit/shared";
import { z } from "zod";

import { AuthService } from "../auth/auth.service";
import { getCurrentUser, SignedCookieRequest } from "../auth/current-user";
import { parseRequest } from "../common/zod-request";
import { CommunityTemplatesService } from "./community-templates.service";

const workspaceIdSchema = z.string().trim().min(1).max(200);

@Controller("api/v1/community-templates")
export class CommunityTemplatesController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: CommunityTemplatesService,
  ) {}

  @Get()
  async list(@Query() query: unknown, @Req() request: SignedCookieRequest) {
    await getCurrentUser(this.authService, request);
    return this.service.list(
      parseRequest(communityTemplateListQuerySchema, query ?? {}),
    );
  }

  @Get("recent")
  async recent(@Req() request: SignedCookieRequest) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.listRecent(user.userId);
  }
}

@Controller("api/v1/workspaces/:workspaceId/community-templates")
export class WorkspaceCommunityTemplatesController {
  constructor(
    private readonly authService: AuthService,
    private readonly service: CommunityTemplatesService,
  ) {}

  @Get("sources")
  async sources(
    @Param("workspaceId") rawWorkspaceId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    const workspaceId = parseRequest(workspaceIdSchema, rawWorkspaceId);
    return this.service.listSources(workspaceId, user.userId);
  }

  @Post()
  async publish(
    @Param("workspaceId") rawWorkspaceId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    const workspaceId = parseRequest(workspaceIdSchema, rawWorkspaceId);
    const input = parseRequest(
      publishCommunityTemplateRequestSchema,
      body ?? {},
    );
    return this.service.publish(workspaceId, input, user.userId);
  }

  @Post(":templateId/use")
  async use(
    @Param("workspaceId") rawWorkspaceId: string,
    @Param("templateId") rawTemplateId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    const workspaceId = parseRequest(workspaceIdSchema, rawWorkspaceId);
    const templateId = parseRequest(communityTemplateIdSchema, rawTemplateId);
    const input = parseRequest(useCommunityTemplateRequestSchema, body ?? {});
    return this.service.use(workspaceId, templateId, input, user.userId);
  }
}
