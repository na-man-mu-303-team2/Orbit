import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { authSessionCookieName } from "./auth.constants";
import { AuthService } from "./auth.service";

export type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

export async function getCurrentUser(
  authService: AuthService,
  request: SignedCookieRequest,
) {
  const sessionId = getSignedSessionId(request);
  if (!sessionId) {
    throw new UnauthorizedException("Authentication required");
  }

  return (await authService.me(sessionId)).user;
}

function getSignedSessionId(request: SignedCookieRequest): string | null {
  const value = request.signedCookies?.[authSessionCookieName];
  return typeof value === "string" && value.length > 0 ? value : null;
}
