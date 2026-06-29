import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

/** 인증 email은 저장/비교 전에 공백 제거와 소문자 정규화를 거친다. */
export const authEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

/** MVP 비밀번호 정책은 길이만 제한하고 복잡도 정책은 후속 보안 정책으로 남긴다. */
export const authPasswordSchema = z.string().min(8).max(128);

/** 인증 응답에서 노출해도 되는 사용자 공개 필드만 정의한다. */
export const authUserSchema = z.object({
  userId: z.string().min(1),
  email: authEmailSchema,
  createdAt: isoDateTimeSchema
});

/** 회원가입과 로그인 요청이 공유하는 email/password 입력 계약이다. */
export const authCredentialsSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema
});

export const registerRequestSchema = authCredentialsSchema;
export const loginRequestSchema = authCredentialsSchema;

/** Redis에 저장하고 /me 응답으로 돌려주는 세션 payload 계약이다. */
export const authSessionSchema = z.object({
  user: authUserSchema,
  authenticatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema
});

/** 회원가입/로그인 성공 응답은 session id 없이 사용자 정보만 반환한다. */
export const authResponseSchema = z.object({
  user: authUserSchema
});

export const meResponseSchema = authSessionSchema;

/** 로그아웃은 세션 존재 여부와 무관하게 성공 여부만 반환한다. */
export const logoutResponseSchema = z.object({
  ok: z.literal(true)
});

export type AuthEmail = z.infer<typeof authEmailSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
