import { z } from "zod";

import { isoDateTimeSchema } from "../common/time.schema";

export const authEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const authPasswordSchema = z.string().min(8).max(128);

export const authUserSchema = z.object({
  userId: z.string().min(1),
  email: authEmailSchema,
  createdAt: isoDateTimeSchema
});

export const authCredentialsSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema
});

export const registerRequestSchema = authCredentialsSchema;
export const loginRequestSchema = authCredentialsSchema;

export const authSessionSchema = z.object({
  user: authUserSchema,
  authenticatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema
});

export const authResponseSchema = z.object({
  user: authUserSchema
});

export const meResponseSchema = authSessionSchema;

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
