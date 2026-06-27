import type { OrbitConfig } from "@orbit/config";
import type { CookieOptions } from "express";

export function authCookieOptions(
  config: OrbitConfig,
  expiresAt: string
): CookieOptions {
  return {
    expires: new Date(expiresAt),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(config),
    signed: true
  };
}

export function clearAuthCookieOptions(config: OrbitConfig): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(config),
    signed: true
  };
}

function shouldUseSecureCookie(config: OrbitConfig): boolean {
  return config.APP_ENV !== "local" && config.APP_ENV !== "test";
}
