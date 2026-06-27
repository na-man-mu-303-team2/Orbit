import { loadOrbitConfig } from "@orbit/config";
import {
  authResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  registerRequestSchema
} from "@orbit/shared";
import type { AuthResponse, LoginRequest, RegisterRequest } from "@orbit/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { authCookieOptions, clearAuthCookieOptions } from "./auth-cookie";
import { authSessionCookieName } from "./auth.constants";
import { AuthService, type AuthResult } from "./auth.service";

type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

@Controller("api/v1/auth")
export class AuthController {
  private readonly config = loadOrbitConfig(process.env, { service: "api" });

  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.register(
      parseAuthRequest(registerRequestSchema, body)
    );
    return this.finishAuthResponse(response, result);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.authService.login(
      parseAuthRequest(loginRequestSchema, body)
    );
    return this.finishAuthResponse(response, result);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    await this.authService.logout(getSignedSessionId(request));
    response.clearCookie(
      authSessionCookieName,
      clearAuthCookieOptions(this.config)
    );

    return logoutResponseSchema.parse({ ok: true });
  }

  @Get("me")
  async me(
    @Req() request: SignedCookieRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const sessionId = getSignedSessionId(request);
    if (!sessionId) {
      response.clearCookie(
        authSessionCookieName,
        clearAuthCookieOptions(this.config)
      );
      throw new UnauthorizedException("Authentication required");
    }

    return this.authService.me(sessionId);
  }

  private setSessionCookie(
    response: Response,
    sessionId: string,
    expiresAt: string
  ): void {
    response.cookie(
      authSessionCookieName,
      sessionId,
      authCookieOptions(this.config, expiresAt)
    );
  }

  private finishAuthResponse(
    response: Response,
    result: AuthResult
  ): AuthResponse {
    this.setSessionCookie(response, result.sessionId, result.session.expiresAt);
    return authResponseSchema.parse({ user: result.user });
  }
}

function parseAuthRequest<T extends RegisterRequest | LoginRequest>(
  schema: z.ZodType<T>,
  body: unknown
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: "Invalid request body",
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  return result.data;
}

function getSignedSessionId(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[authSessionCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}
