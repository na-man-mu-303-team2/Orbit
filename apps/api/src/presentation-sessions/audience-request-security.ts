import type { OrbitConfig } from "@orbit/config";
import {
  ForbiddenException,
  UnauthorizedException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import type { Request } from "express";

import { normalizeHttpOrigin, resolveAllowedWebOrigins } from "../common/web-origin";
import {
  audienceAccessCookieName,
  verifyAudienceAccessToken,
  type VerifiedAudienceAccessToken
} from "./audience-access-cookie";

export type SignedCookieRequest = Request & {
  signedCookies?: Record<string, string | false | undefined>;
};

export function assertAudienceJsonSameOrigin(
  config: OrbitConfig,
  request: Request
): void {
  const contentType = getHeader(request, "content-type");
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new UnsupportedMediaTypeException("JSON content type required");
  }
  const origin = normalizeHttpOrigin(getHeader(request, "origin"));
  if (!origin || !resolveAllowedWebOrigins(config.WEB_ORIGIN).includes(origin)) {
    throw new ForbiddenException("Same-origin request required");
  }
}

export function requireAudienceIdentity(
  config: OrbitConfig,
  request: SignedCookieRequest,
  sessionId: string
): VerifiedAudienceAccessToken {
  const value = request.signedCookies?.[audienceAccessCookieName];
  if (typeof value !== "string" || value.length === 0) {
    throw new UnauthorizedException("Audience access required");
  }
  const payload = verifyAudienceAccessToken(config, value, getUserAgent(request));
  if (!payload || payload.sessionId !== sessionId) {
    throw new UnauthorizedException("Audience access required");
  }
  return payload;
}

export function getUserAgent(request: Request): string {
  return getHeader(request, "user-agent") ?? "";
}

export function getAudienceClientAddress(request: Request): string {
  return request.ip || "unknown";
}

function getHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
