import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req
} from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import {
  getCurrentUser,
  type SignedCookieRequest
} from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { SlideContextService } from "./slide-context.service";

@Controller()
export class SlideContextController {
  constructor(
    private readonly authService: AuthService,
    private readonly projectsService: ProjectsService,
    private readonly slideContextService: SlideContextService
  ) {}

  @Post("api/v1/projects/:projectId/decks/:deckId/slide-context/extract")
  async extractItems(
    @Param("projectId") projectId: string,
    @Param("deckId") deckId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.slideContextService.extractItems(projectId, deckId, body);
  }

  @Get("api/v1/projects/:projectId/decks/:deckId/slide-context")
  async listItems(
    @Param("projectId") projectId: string,
    @Param("deckId") deckId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.slideContextService.listItems(projectId, deckId);
  }

  @Patch("api/v1/projects/:projectId/slide-context/:itemId")
  async updateItem(
    @Param("projectId") projectId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.slideContextService.updateItem(projectId, itemId, body);
  }

  @Delete("api/v1/projects/:projectId/slide-context/:itemId")
  @HttpCode(204)
  async deleteItem(
    @Param("projectId") projectId: string,
    @Param("itemId") itemId: string,
    @Req() request: SignedCookieRequest
  ) {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    await this.slideContextService.deleteItem(projectId, itemId);
  }
}
