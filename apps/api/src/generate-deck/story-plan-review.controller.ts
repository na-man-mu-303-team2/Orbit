import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { getCurrentUser, type SignedCookieRequest } from "../auth/current-user";
import { ProjectsService } from "../projects/projects.service";
import { StoryPlanReviewService } from "./story-plan-review.service";

@Controller("api/v1/projects/:projectId/jobs/:jobId/story-plan")
export class StoryPlanReviewController {
  constructor(
    private readonly authService: AuthService,
    private readonly storyPlanReview: StoryPlanReviewService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  async get(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.storyPlanReview.get(projectId, jobId);
  }

  @Post("edit")
  async edit(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.storyPlanReview.edit(projectId, jobId, body);
  }

  @Post("regenerate")
  async regenerate(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.storyPlanReview.regenerate(projectId, jobId, body);
  }

  @Post("approve")
  async approve(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.storyPlanReview.approve(projectId, jobId, body);
  }

  @Post("cancel")
  async cancel(
    @Param("projectId") projectId: string,
    @Param("jobId") jobId: string,
    @Req() request: SignedCookieRequest,
  ) {
    await this.assertCanWrite(projectId, request);
    return this.storyPlanReview.cancel(projectId, jobId);
  }

  private async assertCanWrite(
    projectId: string,
    request: SignedCookieRequest,
  ): Promise<void> {
    const user = await getCurrentUser(this.authService, request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
  }
}
