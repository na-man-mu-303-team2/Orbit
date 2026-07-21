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

/** 닉네임은 표시 문자열을 보존하되 바깥 공백과 제어 문자를 허용하지 않는다. */
export const authDisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value), {
    message: "Display name must not contain control characters"
  });

/** ORBIT가 제공하는 공식 프로필 아바타의 고정 식별자다. */
export const officialAvatarIdSchema = z.enum([
  "orbit-01",
  "orbit-02",
  "orbit-03",
  "orbit-04",
  "orbit-05",
  "orbit-06",
  "orbit-07",
  "orbit-08",
  "orbit-09",
  "orbit-10",
  "orbit-11",
  "orbit-12",
  "orbit-13",
  "orbit-14",
  "orbit-15",
]);

export const avatarFileIdSchema = z.string().regex(/^avatar_[a-f0-9-]{36}$/);

/** 사용자 프로필은 공식 아바타 또는 본인 업로드 이미지 중 하나만 가리킨다. */
export const authAvatarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("official"), avatarId: officialAvatarIdSchema }),
  z.object({ kind: z.literal("uploaded"), fileId: avatarFileIdSchema }),
]);

/** 인증 응답에서 노출해도 되는 사용자 공개 필드만 정의한다. */
export const authUserSchema = z.object({
  userId: z.string().min(1),
  email: authEmailSchema,
  displayName: authDisplayNameSchema,
  createdAt: isoDateTimeSchema,
  avatar: authAvatarSchema.nullable().optional(),
});

/** 회원가입과 로그인 요청이 공유하는 email/password 입력 계약이다. */
export const authCredentialsSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema
});

export const registerRequestSchema = authCredentialsSchema.extend({
  displayName: authDisplayNameSchema
});
export const loginRequestSchema = authCredentialsSchema;
export const updateProfileRequestSchema = z.object({
  displayName: authDisplayNameSchema
});
export const updateOfficialAvatarRequestSchema = z.object({
  avatarId: officialAvatarIdSchema,
});

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
export type AuthDisplayName = z.infer<typeof authDisplayNameSchema>;
export type OfficialAvatarId = z.infer<typeof officialAvatarIdSchema>;
export type AuthAvatar = z.infer<typeof authAvatarSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type UpdateOfficialAvatarRequest = z.infer<
  typeof updateOfficialAvatarRequestSchema
>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
