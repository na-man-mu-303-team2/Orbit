import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest,
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { AiSuggestionsService } from "./ai-suggestions.service";

@Controller("api/v1/projects/:projectId/ai-suggestions")
export class AiSuggestionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly aiSuggestionsService: AiSuggestionsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  async list(
    @Param("projectId") projectId: string,
    @Query() query: Record<string, unknown>,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.aiSuggestionsService.list(projectId, query);
  }

  @Post()
  async create(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.aiSuggestionsService.create(projectId, body);
  }

  @Post(":suggestionId/apply")
  async apply(
    @Param("projectId") projectId: string,
    @Param("suggestionId") suggestionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.aiSuggestionsService.apply(projectId, suggestionId);
  }

  @Post(":suggestionId/reject")
  async reject(
    @Param("projectId") projectId: string,
    @Param("suggestionId") suggestionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.aiSuggestionsService.reject(projectId, suggestionId, body);
  }
}
