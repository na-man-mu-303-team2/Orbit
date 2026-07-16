import { loadOrbitConfig } from "@orbit/config";
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import { joinAudiencePresentationRequestSchema } from "@orbit/shared";
import type { Request, Response } from "express";

import { parseRequest } from "../common/zod-request";
import { normalizeHttpOrigin, resolveAllowedWebOrigins } from "../common/web-origin";
import {
  audienceAccessCookieName,
  audienceAccessCookieOptions,
  createAudienceAccessToken,
  verifyAudienceAccessToken
} from "./audience-access-cookie";
import { PresentationSessionsService } from "./presentation-sessions.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/audience-sessions")
export class AudienceSessionsController {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(private readonly presentationSessionsService: PresentationSessionsService) {}

  @Get(":sessionId/public")
  getPublic(@Param("sessionId") sessionId: string) {
    return this.presentationSessionsService.getAudiencePublicInfo(sessionId);
  }

  @Post(":sessionId/join")
  async join(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    this.assertJsonSameOrigin(request);
    const input = parseRequest(joinAudiencePresentationRequestSchema, body ?? {});
    const userAgent = getUserAgent(request);
    const existing = getSignedAudienceAccessToken(request);
    const existingPayload = existing
      ? verifyAudienceAccessToken(this.config, existing, userAgent)
      : null;
    const result = await this.presentationSessionsService.joinAudience(sessionId, input);
    const audienceId =
      existingPayload?.sessionId === sessionId ? existingPayload.audienceId : undefined;

    response.cookie(
      audienceAccessCookieName,
      createAudienceAccessToken(this.config, result.session, userAgent, audienceId),
      audienceAccessCookieOptions(this.config, result.session.expiresAt)
    );
    return result;
  }

  @Get(":sessionId/access")
  async getAccess(
    @Param("sessionId") sessionId: string,
    @Req() request: SignedCookieRequest
  ) {
    const token = getSignedAudienceAccessToken(request);
    if (!token) throw new UnauthorizedException("Audience access required");
    const payload = verifyAudienceAccessToken(this.config, token, getUserAgent(request));
    if (!payload || payload.sessionId !== sessionId) {
      throw new UnauthorizedException("Audience access required");
    }
    return this.presentationSessionsService.getAudienceAccess(sessionId, payload.projectId);
  }

  private assertJsonSameOrigin(request: Request): void {
    const contentType = getHeader(request, "content-type");
    if (!contentType?.toLowerCase().startsWith("application/json")) {
      throw new UnsupportedMediaTypeException("JSON content type required");
    }
    const origin = normalizeHttpOrigin(getHeader(request, "origin"));
    if (!origin || !resolveAllowedWebOrigins(this.config.WEB_ORIGIN).includes(origin)) {
      throw new ForbiddenException("Same-origin request required");
    }
  }
}

function getUserAgent(request: Request): string {
  const value = request.headers["user-agent"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getSignedAudienceAccessToken(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[audienceAccessCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
