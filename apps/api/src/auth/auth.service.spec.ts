import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AuthSessionStore } from "./auth-session.store";
import { AuthService } from "./auth.service";
import type { AuthSession } from "@orbit/shared";

type UserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

class InMemoryAuthSessionStore implements AuthSessionStore {
  readonly sessions = new Map<string, AuthSession>();

  async get(sessionId: string): Promise<AuthSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(
    sessionId: string,
    session: AuthSession,
    _ttlSeconds: number
  ): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

function createAuthTestHarness() {
  const users: UserRow[] = [];
  const dataSource = {
    query: vi.fn(async (query: string, params: unknown[] = []) => {
      if (query.includes("WHERE lower(email) = lower($1)")) {
        const email = String(params[0]).toLowerCase();
        return users.filter((user) => user.email.toLowerCase() === email);
      }

      if (query.includes("INSERT INTO users")) {
        const email = String(params[1]);
        if (
          users.some(
            (user) => user.email.toLowerCase() === email.toLowerCase()
          )
        ) {
          throw Object.assign(new Error("duplicate email"), { code: "23505" });
        }

        const now = params[3] instanceof Date ? params[3] : new Date();
        const user: UserRow = {
          user_id: String(params[0]),
          email,
          password_hash: String(params[2]),
          created_at: now,
          updated_at: now
        };
        users.push(user);
        return [user];
      }

      throw new Error(`Unexpected query: ${query}`);
    })
  } as unknown as DataSource;

  const sessionStore = new InMemoryAuthSessionStore();

  return {
    service: new AuthService(dataSource, sessionStore),
    sessionStore,
    users
  };
}

describe("AuthService", () => {
  it("registers a user with an Argon2id hash and creates a session", async () => {
    const { service, sessionStore, users } = createAuthTestHarness();

    const result = await service.register({
      email: "person@example.com",
      password: "password-123"
    });

    expect(result.user.email).toBe("person@example.com");
    expect(result.session.user).toEqual(result.user);
    expect(sessionStore.sessions.has(result.sessionId)).toBe(true);
    expect(users[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(users[0].password_hash).not.toContain("password-123");
  });

  it("logs in with a valid password and rejects invalid credentials", async () => {
    const { service } = createAuthTestHarness();

    await service.register({
      email: "person@example.com",
      password: "password-123"
    });

    await expect(
      service.login({
        email: "person@example.com",
        password: "wrong-password"
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const result = await service.login({
      email: "person@example.com",
      password: "password-123"
    });

    await expect(service.me(result.sessionId)).resolves.toMatchObject({
      user: {
        email: "person@example.com"
      }
    });
  });

  it("rejects duplicate email registration", async () => {
    const { service } = createAuthTestHarness();

    await service.register({
      email: "person@example.com",
      password: "password-123"
    });

    await expect(
      service.register({
        email: "person@example.com",
        password: "password-456"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("normalizes email before storing and rejects case-only duplicates", async () => {
    const { service, users } = createAuthTestHarness();

    await service.register({
      email: " Person@Example.COM ",
      password: "password-123"
    });

    expect(users[0].email).toBe("person@example.com");

    await expect(
      service.register({
        email: "person@example.com",
        password: "password-456"
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users).toHaveLength(1);
  });

  it("deletes sessions on logout and treats repeated logout as successful", async () => {
    const { service } = createAuthTestHarness();
    const result = await service.register({
      email: "person@example.com",
      password: "password-123"
    });

    await service.logout(result.sessionId);
    await expect(service.me(result.sessionId)).rejects.toBeInstanceOf(
      UnauthorizedException
    );

    await expect(service.logout(result.sessionId)).resolves.toBeUndefined();
    await expect(service.logout(null)).resolves.toBeUndefined();
  });

  it("rejects expired sessions and deletes them", async () => {
    const { service, sessionStore } = createAuthTestHarness();
    const sessionId = "session_expired";
    sessionStore.sessions.set(sessionId, {
      user: {
        userId: "user_1",
        email: "person@example.com",
        createdAt: "2026-06-27T00:00:00.000Z"
      },
      authenticatedAt: "2026-06-27T00:00:00.000Z",
      expiresAt: "2026-06-27T00:00:01.000Z"
    });

    await expect(service.me(sessionId)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(sessionStore.sessions.has(sessionId)).toBe(false);
  });
});
