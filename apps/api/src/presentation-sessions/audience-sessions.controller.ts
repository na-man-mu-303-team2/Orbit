import { loadOrbitConfig } from "@orbit/config";
import type { Request, Response } from "express";
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import { verifyAudienceAccessSessionRequestSchema } from "@orbit/shared";
import { verifyAudienceAccessSessionResponseSchema } from "@orbit/shared";
import { parseRequest } from "../common/zod-request";
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

  constructor(
    private readonly presentationSessionsService: PresentationSessionsService
  ) {}

  @Post(":sessionId/verify")
  async verify(
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const input = parseRequest(verifyAudienceAccessSessionRequestSchema, body ?? {});
    const result = await this.presentationSessionsService.verifyAudienceAccess(
      sessionId,
      input.passcode
    );

    response.cookie(
      audienceAccessCookieName,
      createAudienceAccessToken(
        this.config,
        result.session,
        getUserAgent(request)
      ),
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
    if (!token) {
      throw new UnauthorizedException("Audience access required");
    }

    const payload = verifyAudienceAccessToken(
      this.config,
      token,
      getUserAgent(request)
    );
    if (!payload || payload.sessionId !== sessionId) {
      throw new UnauthorizedException("Audience access required");
    }

    const session = await this.presentationSessionsService.getOpenSessionById(
      sessionId
    );
    if (session.projectId !== payload.projectId) {
      throw new UnauthorizedException("Audience access required");
    }

    return verifyAudienceAccessSessionResponseSchema.parse({
      verified: true,
      session
    });
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
