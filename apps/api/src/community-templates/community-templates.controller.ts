import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  communityTemplateCommentIdSchema,
  communityTemplateCommentListQuerySchema,
  communityTemplateCommentMutationSchema,
  communityTemplateDiscoverQuerySchema,
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

  @Get("discover")
  async discover(@Query() query: unknown, @Req() request: SignedCookieRequest) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.discover(
      parseRequest(communityTemplateDiscoverQuerySchema, query ?? {}),
      user.userId,
    );
  }

  @Get(":templateId")
  async detail(
    @Param("templateId") rawTemplateId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    const templateId = parseRequest(communityTemplateIdSchema, rawTemplateId);
    return this.service.getCommunityDetail(templateId, user.userId);
  }

  @Put(":templateId/like")
  async like(
    @Param("templateId") rawTemplateId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.setLike(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      user.userId,
      true,
    );
  }

  @Delete(":templateId/like")
  async unlike(
    @Param("templateId") rawTemplateId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.setLike(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      user.userId,
      false,
    );
  }

  @Post(":templateId/view")
  async view(
    @Param("templateId") rawTemplateId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.recordView(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      user.userId,
    );
  }

  @Post(":templateId/share")
  async share(
    @Param("templateId") rawTemplateId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.recordShare(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      user.userId,
    );
  }

  @Get(":templateId/comments")
  async comments(
    @Param("templateId") rawTemplateId: string,
    @Query() query: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.listComments(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      parseRequest(communityTemplateCommentListQuerySchema, query ?? {}),
      user.userId,
    );
  }

  @Post(":templateId/comments")
  async createComment(
    @Param("templateId") rawTemplateId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.createComment(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      parseRequest(communityTemplateCommentMutationSchema, body ?? {}),
      user.userId,
    );
  }

  @Patch(":templateId/comments/:commentId")
  async updateComment(
    @Param("templateId") rawTemplateId: string,
    @Param("commentId") rawCommentId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.updateComment(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      parseRequest(communityTemplateCommentIdSchema, rawCommentId),
      parseRequest(communityTemplateCommentMutationSchema, body ?? {}),
      user.userId,
    );
  }

  @Delete(":templateId/comments/:commentId")
  async deleteComment(
    @Param("templateId") rawTemplateId: string,
    @Param("commentId") rawCommentId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    return this.service.deleteComment(
      parseRequest(communityTemplateIdSchema, rawTemplateId),
      parseRequest(communityTemplateCommentIdSchema, rawCommentId),
      user.userId,
    );
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
