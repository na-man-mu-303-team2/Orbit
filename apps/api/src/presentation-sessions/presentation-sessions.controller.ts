import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
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
import { AudienceRealtimeGateway } from "../realtime/audience-realtime.gateway";
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
    private readonly audienceRealtimeGateway: AudienceRealtimeGateway,
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

  @Post(":sessionId/start")
  async startSession(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.startSession({
      projectId,
      sessionId,
      actorId: user.userId,
    });
  }

  @Post(":sessionId/end")
  async endSession(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    const result = await this.presentationSessionsService.endSession({
      projectId,
      sessionId,
      actorId: user.userId,
    });
    this.audienceRealtimeGateway.broadcastSessionEnded(result.session);
    return result;
  }

  @Get(":sessionId/survey")
  async getSurveyForm(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.getSessionSurveyForm({
      projectId,
      sessionId,
    });
  }

  @Put(":sessionId/survey")
  async upsertSurveyForm(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.upsertSessionSurveyForm({
      projectId,
      sessionId,
      body: body ?? {},
    });
  }

  @Get(":sessionId/survey.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  async exportSurveyCsv(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.exportSessionSurveyCsv({
      projectId,
      sessionId,
    });
  }

  @Get("interactions/library")
  async listInteractionLibrary(
    @Param("projectId") projectId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.listLibraryInteractions(projectId);
  }

  @Post("interactions/library")
  async createInteractionLibraryItem(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.createLibraryInteraction(
      projectId,
      body ?? {},
    );
  }

  @Get(":sessionId/interactions")
  async listSessionInteractions(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.listSessionInteractions({
      projectId,
      sessionId,
    });
  }

  @Post(":sessionId/interactions/select")
  async selectSessionInteractions(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.selectSessionInteractions(
      { projectId, sessionId },
      body ?? {},
    );
  }

  @Post(":sessionId/interactions")
  async createAdHocSessionInteraction(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.createAdHocSessionInteraction(
      { projectId, sessionId },
      body ?? {},
    );
  }

  @Post(":sessionId/interactions/:interactionId/activate")
  async activateSessionInteraction(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("interactionId") interactionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.activateSessionInteraction({
      projectId,
      sessionId,
      interactionId,
      actorId: user.userId,
    });
  }

  @Post(":sessionId/interactions/:interactionId/close")
  async closeSessionInteraction(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("interactionId") interactionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.closeSessionInteraction({
      projectId,
      sessionId,
      interactionId,
      actorId: user.userId,
    });
  }

  @Get(":sessionId/interactions/:interactionId/results")
  async getInteractionResults(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("interactionId") interactionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.getInteractionResults({
      projectId,
      sessionId,
      interactionId,
    });
  }

  @Get(":sessionId/questions")
  async listPresenterQuestions(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanReadProject(projectId, user.userId);
    return this.presentationSessionsService.listPresenterQuestions({
      projectId,
      sessionId,
    });
  }

  @Patch(":sessionId/questions/:questionId/answered")
  async markQuestionAnswered(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("questionId") questionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.markQuestionAnswered({
      projectId,
      sessionId,
      questionId,
      actorId: user.userId,
    });
  }

  @Patch(":sessionId/ai-references")
  async updateAiReferenceSelection(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const user = await this.getCurrentUser(request);
    await this.projectsService.assertCanWriteProject(projectId, user.userId);
    return this.presentationSessionsService.updateAiReferenceSelection(
      { projectId, sessionId },
      body ?? {},
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

function getSignedSessionId(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[authSessionCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}
