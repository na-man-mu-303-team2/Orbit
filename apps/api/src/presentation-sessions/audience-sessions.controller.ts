import { randomUUID } from "node:crypto";
import { loadOrbitConfig } from "@orbit/config";
import type { Request, Response } from "express";
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import {
  audienceJoinRequestSchema,
  audienceJoinCodeParamsSchema,
  audienceJoinResponseSchema,
  audienceSessionLookupResponseSchema,
  audienceStateResponseSchema,
} from "@orbit/shared";
import { parseRequest } from "../common/zod-request";
import {
  audienceAccessCookieName,
  audienceAccessCookieOptions,
  createAudienceAccessToken,
  hashAudienceAccessToken,
  verifyAudienceAccessToken,
} from "./audience-access-cookie";
import { PresentationSessionsService } from "./presentation-sessions.service";
import { AudienceRealtimeGateway } from "../realtime/audience-realtime.gateway";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/presentation-sessions")
export class AudienceSessionsController {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });
  private readonly joinRateLimiter = new AudienceJoinRateLimiter();

  constructor(
    private readonly presentationSessionsService: PresentationSessionsService,
    private readonly audienceRealtimeGateway: AudienceRealtimeGateway,
  ) {}

  @Get("join/:joinCode")
  async getJoinSession(@Param("joinCode") joinCode: string) {
    const params = audienceJoinCodeParamsSchema.parse({ joinCode });
    const session =
      await this.presentationSessionsService.getActiveSessionByJoinCode(
        params.joinCode,
      );

    return audienceSessionLookupResponseSchema.parse({ session });
  }

  @Post("join/:joinCode")
  async joinSession(
    @Param("joinCode") joinCode: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const params = audienceJoinCodeParamsSchema.parse({ joinCode });
    const input = parseRequest(audienceJoinRequestSchema, body ?? {});
    const session =
      await this.presentationSessionsService.getActiveSessionByJoinCode(
        params.joinCode,
      );
    const existingAccess = await this.tryGetExistingAccess(
      session.sessionId,
      request,
    );
    if (existingAccess) {
      return existingAccess;
    }

    if (!this.joinRateLimiter.consume(getClientIp(request), params.joinCode)) {
      throw new HttpException(
        "입장 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const audienceId = `audience_${randomUUID()}`;
    const token = createAudienceAccessToken(
      this.config,
      session,
      audienceId,
      getUserAgent(request),
    );
    const result = await this.presentationSessionsService.joinAudience(
      session,
      {
        audienceId,
        nickname: input.nickname,
        tokenHash: hashAudienceAccessToken(this.config, token),
      },
    );

    response.cookie(
      audienceAccessCookieName,
      token,
      audienceAccessCookieOptions(this.config, session.rawDataDeleteAfter),
    );

    return audienceJoinResponseSchema.parse(result);
  }

  @Get(":sessionId/audience/me")
  async getMe(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    const result = await this.presentationSessionsService.getAudienceMe(
      sessionId,
      payload.audienceId,
      hashAudienceAccessToken(this.config, token),
    );

    return audienceJoinResponseSchema.parse(result);
  }

  @Get(":sessionId/audience/state")
  async getState(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);
    const result = await this.presentationSessionsService.getAudienceState(
      sessionId,
      payload.audienceId,
      hashAudienceAccessToken(this.config, token),
    );

    return audienceStateResponseSchema.parse(result);
  }

  @Post(":sessionId/audience/interactions/:interactionId/respond")
  async submitInteractionResponse(
    @Param("sessionId") sessionId: string,
    @Param("interactionId") interactionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.submitInteractionResponse({
      sessionId,
      interactionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      body: body ?? {},
    });
  }

  @Get(":sessionId/audience/interactions/active")
  async getActiveInteraction(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.getAudienceActiveInteraction({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
    });
  }

  @Post(":sessionId/audience/questions")
  async submitQuestion(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);
    const tokenHash = hashAudienceAccessToken(this.config, token);

    const result = await this.presentationSessionsService.submitAudienceQuestion({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash,
      body: body ?? {},
    });

    const answer =
      await this.presentationSessionsService.getAudienceQuestionAnswer({
        sessionId,
        audienceId: payload.audienceId,
        tokenHash,
        questionId: result.question.questionId,
      }).catch(() => null);
    if (answer?.answer) {
      this.audienceRealtimeGateway.broadcastPrivateAnswer({
        sessionId,
        audienceId: payload.audienceId,
        question: answer.question,
        answer: answer.answer,
      });
    }

    return result;
  }

  @Get(":sessionId/audience/questions/:questionId")
  async getQuestionStatus(
    @Param("sessionId") sessionId: string,
    @Param("questionId") questionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.getAudienceQuestionStatus({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      questionId,
    });
  }

  @Get(":sessionId/audience/questions/:questionId/answer")
  async getQuestionAnswer(
    @Param("sessionId") sessionId: string,
    @Param("questionId") questionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.getAudienceQuestionAnswer({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      questionId,
    });
  }

  @Post(":sessionId/audience/questions/:questionId/feedback")
  async updateQuestionFeedback(
    @Param("sessionId") sessionId: string,
    @Param("questionId") questionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.updateAiAnswerFeedback({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      questionId,
      body: body ?? {},
    });
  }

  @Post(":sessionId/audience/reactions")
  async submitReaction(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    const result = await this.presentationSessionsService.submitReaction({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      body: body ?? {},
    });
    this.audienceRealtimeGateway.broadcastReaction({
      sessionId,
      audienceId: payload.audienceId,
      reaction: result.reaction,
    });
    return result;
  }

  @Get(":sessionId/audience/survey")
  async getSurvey(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.getAudienceSurveyForm({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
    });
  }

  @Post(":sessionId/audience/survey")
  async submitSurvey(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
  ) {
    const { payload, token } = this.requireAudienceAccess(sessionId, request);

    return this.presentationSessionsService.submitSurveyResponse({
      sessionId,
      audienceId: payload.audienceId,
      tokenHash: hashAudienceAccessToken(this.config, token),
      body: body ?? {},
    });
  }

  private async tryGetExistingAccess(
    sessionId: string,
    request: SignedCookieRequest,
  ) {
    const token = getSignedAudienceAccessToken(request);
    if (!token) {
      return null;
    }

    const payload = verifyAudienceAccessToken(
      this.config,
      token,
      getUserAgent(request),
    );
    if (!payload || payload.sessionId !== sessionId) {
      return null;
    }

    try {
      const result = await this.presentationSessionsService.getAudienceMe(
        sessionId,
        payload.audienceId,
        hashAudienceAccessToken(this.config, token),
      );
      return audienceJoinResponseSchema.parse(result);
    } catch {
      return null;
    }
  }

  private requireAudienceAccess(
    sessionId: string,
    request: SignedCookieRequest,
  ) {
    const token = getSignedAudienceAccessToken(request);
    if (!token) {
      throw new UnauthorizedException("Audience access required");
    }

    const payload = verifyAudienceAccessToken(
      this.config,
      token,
      getUserAgent(request),
    );
    if (!payload || payload.sessionId !== sessionId) {
      throw new UnauthorizedException("Audience access required");
    }

    return { payload, token };
  }
}

function getSignedAudienceAccessToken(
  request: SignedCookieRequest,
): string | null {
  const value = request.signedCookies?.[audienceAccessCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getUserAgent(request: Request): string {
  const value = request.headers["user-agent"];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.ip || request.socket.remoteAddress || "unknown";
}

class AudienceJoinRateLimiter {
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private readonly limit = 10;
  private readonly windowMs = 60_000;

  consume(ip: string, joinCode: string, now = Date.now()): boolean {
    const key = `${ip}:${joinCode}`;
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (current.count >= this.limit) {
      return false;
    }

    current.count += 1;
    return true;
  }
}
