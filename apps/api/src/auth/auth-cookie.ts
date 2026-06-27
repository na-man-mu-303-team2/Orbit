import type { OrbitConfig } from "@orbit/config";
import type { CookieOptions } from "express";

/** 로그인/회원가입 성공 시 사용할 signed HttpOnly session cookie 옵션을 만든다. */
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

/** 로그아웃이나 인증 실패 시 같은 속성의 cookie를 정확히 지우기 위한 옵션을 만든다. */
export function clearAuthCookieOptions(config: OrbitConfig): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: shouldUseSecureCookie(config),
    signed: true
  };
}

/** 로컬/테스트에서는 HTTP 개발을 허용하고 원격 환경에서는 secure cookie를 강제한다. */
function shouldUseSecureCookie(config: OrbitConfig): boolean {
  return config.APP_ENV !== "local" && config.APP_ENV !== "test";
}
