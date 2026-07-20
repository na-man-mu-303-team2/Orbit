import { describe, expect, it } from "vitest";
import {
  authResponseSchema,
  authDisplayNameSchema,
  loginRequestSchema,
  logoutResponseSchema,
  meResponseSchema,
  registerRequestSchema
} from "./auth.schema";

const validUser = {
  userId: "user_1",
  email: "person@example.com",
  displayName: "발표 장인",
  createdAt: "2026-06-27T00:00:00.000Z"
};

describe("auth schema validation", () => {
  it("normalizes valid register and login credentials", () => {
    expect(
      registerRequestSchema.parse({
        email: " Person@Example.COM ",
        displayName: "  발표 장인  ",
        password: "password-123"
      })
    ).toEqual({
      email: "person@example.com",
      displayName: "발표 장인",
      password: "password-123"
    });

    expect(
      loginRequestSchema.parse({
        email: "PERSON@example.com",
        password: "password-123"
      }).email
    ).toBe("person@example.com");
  });

  it("accepts expressive display names and rejects invalid lengths or control characters", () => {
    expect(authDisplayNameSchema.parse("  발표왕 🚀  ")).toBe("발표왕 🚀");
    expect(() => authDisplayNameSchema.parse("A")).toThrow();
    expect(() => authDisplayNameSchema.parse("123456789012345678901")).toThrow();
    expect(() => authDisplayNameSchema.parse("발표\n왕")).toThrow();
  });

  it("rejects malformed auth payloads", () => {
    expect(() =>
      registerRequestSchema.parse({
        email: "not-an-email",
        displayName: "A",
        password: "short"
      })
    ).toThrow();
  });

  it("validates auth response and session envelopes", () => {
    expect(authResponseSchema.parse({ user: validUser })).toEqual({
      user: validUser
    });

    expect(
      meResponseSchema.parse({
        user: validUser,
        authenticatedAt: "2026-06-27T00:00:00.000Z",
        expiresAt: "2026-07-04T00:00:00.000Z"
      })
    ).toEqual({
      user: validUser,
      authenticatedAt: "2026-06-27T00:00:00.000Z",
      expiresAt: "2026-07-04T00:00:00.000Z"
    });

    expect(logoutResponseSchema.parse({ ok: true })).toEqual({ ok: true });
  });
});
