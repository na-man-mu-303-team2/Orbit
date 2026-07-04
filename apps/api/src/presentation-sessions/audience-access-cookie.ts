import { createHmac } from "node:crypto";
import type { OrbitConfig } from "@orbit/config";
import type { PresentationSession } from "@orbit/shared";
import type { CookieOptions } from "express";

export const audienceAccessCookieName = "orbit_audience_access";

type AudienceAccessTokenPayload = {
  audienceId: string;
  sessionId: string;
  projectId: string;
  uaHash: string;
  issuedAt: string;
  expiresAt: string;
};

export type VerifiedAudienceAccessToken = AudienceAccessTokenPayload;

export function createAudienceAccessToken(
  config: OrbitConfig,
  session: PresentationSession,
  audienceId: string,
  userAgent: string,
): string {
  const payload: AudienceAccessTokenPayload = {
    audienceId,
    sessionId: session.sessionId,
    projectId: session.projectId,
    uaHash: hashUserAgent(config.SESSION_SECRET, userAgent),
    issuedAt: new Date().toISOString(),
    expiresAt: session.rawDataDeleteAfter,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function hashAudienceAccessToken(
  config: OrbitConfig,
  token: string,
): string {
  return createHmac("sha256", config.SESSION_SECRET)
    .update(token)
    .digest("base64url");
}

export function verifyAudienceAccessToken(
  config: OrbitConfig,
  token: string,
  userAgent: string,
  now = new Date(),
): VerifiedAudienceAccessToken | null {
  const payload = decodeAudienceAccessToken(token);
  if (!payload) {
    return null;
  }

  if (payload.uaHash !== hashUserAgent(config.SESSION_SECRET, userAgent)) {
    return null;
  }

  if (new Date(payload.expiresAt).getTime() <= now.getTime()) {
    return null;
  }

  return payload;
}

export function audienceAccessCookieOptions(
  config: OrbitConfig,
  expiresAt: string,
): CookieOptions {
  return {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(config),
    signed: true,
  };
}

function decodeAudienceAccessToken(
  token: string,
): AudienceAccessTokenPayload | null {
  try {
    const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (!isAudienceAccessTokenPayload(value)) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function isAudienceAccessTokenPayload(
  value: unknown,
): value is AudienceAccessTokenPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.audienceId === "string" &&
    typeof record.sessionId === "string" &&
    typeof record.projectId === "string" &&
    typeof record.uaHash === "string" &&
    typeof record.issuedAt === "string" &&
    typeof record.expiresAt === "string"
  );
}

function hashUserAgent(secret: string, userAgent: string): string {
  return createHmac("sha256", secret).update(userAgent).digest("base64url");
}

function shouldUseSecureCookie(config: OrbitConfig): boolean {
  if (config.AUTH_COOKIE_SECURE !== undefined) {
    return config.AUTH_COOKIE_SECURE;
  }

  return config.APP_ENV !== "local" && config.APP_ENV !== "test";
}
