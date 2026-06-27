import { randomUUID } from "node:crypto";
import {
  authResponseSchema,
  authSessionSchema,
  authUserSchema,
  meResponseSchema
} from "@orbit/shared";
import type {
  AuthResponse,
  AuthSession,
  AuthUser,
  LoginRequest,
  MeResponse,
  RegisterRequest
} from "@orbit/shared";
import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import * as argon2 from "argon2";
import { DataSource } from "typeorm";
import { authSessionTtlSeconds } from "./auth.constants";
import { AUTH_SESSION_STORE, AuthSessionStore } from "./auth-session.store";

type UserRow = {
  user_id: string;
  email: string;
  password_hash: string;
  created_at: Date | string;
  updated_at: Date | string;
};

export interface AuthResult extends AuthResponse {
  session: AuthSession;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AUTH_SESSION_STORE)
    private readonly sessions: AuthSessionStore
  ) {}

  async register(input: RegisterRequest): Promise<AuthResult> {
    const existingUser = await this.findUserByEmail(input.email);
    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const now = new Date();
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id
    });

    try {
      const rows = await this.dataSource.query<UserRow[]>(
        `
          INSERT INTO users (user_id, email, password_hash, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          RETURNING user_id, email, password_hash, created_at, updated_at
        `,
        [`user_${randomUUID()}`, input.email, passwordHash, now]
      );

      return this.createSession(this.toAuthUser(rows[0]));
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException("Email already registered");
      }

      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthResult> {
    const user = await this.findUserByEmail(input.email);
    if (!user) {
      throw invalidCredentials();
    }

    const passwordMatches = await argon2.verify(
      user.password_hash,
      input.password
    );
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return this.createSession(this.toAuthUser(user));
  }

  async me(sessionId: string): Promise<MeResponse> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    return meResponseSchema.parse(session);
  }

  async logout(sessionId: string | null): Promise<void> {
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }
  }

  private async createSession(user: AuthUser): Promise<AuthResult> {
    const authenticatedAt = new Date();
    const expiresAt = new Date(
      authenticatedAt.getTime() + authSessionTtlSeconds * 1000
    );
    const session = authSessionSchema.parse({
      user,
      authenticatedAt: authenticatedAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
    const sessionId = `session_${randomUUID()}`;

    await this.sessions.set(sessionId, session, authSessionTtlSeconds);

    return {
      ...authResponseSchema.parse({ user }),
      session,
      sessionId
    };
  }

  private async findUserByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.dataSource.query<UserRow[]>(
      `
        SELECT user_id, email, password_hash, created_at, updated_at
        FROM users
        WHERE email = $1
      `,
      [email]
    );

    return rows[0];
  }

  private toAuthUser(row: UserRow): AuthUser {
    return authUserSchema.parse({
      userId: row.user_id,
      email: row.email,
      createdAt: toIso(row.created_at)
    });
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException("Invalid email or password");
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
