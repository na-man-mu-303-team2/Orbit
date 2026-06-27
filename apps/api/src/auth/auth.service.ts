import { randomUUID } from "node:crypto";
import {
  authResponseSchema,
  authSessionSchema,
  authUserSchema,
  loginRequestSchema,
  meResponseSchema,
  registerRequestSchema
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

/** ORBIT-8 인증의 계정 생성, 비밀번호 검증, Redis 세션 생성을 담당한다. */
@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AUTH_SESSION_STORE)
    private readonly sessions: AuthSessionStore
  ) {}

  /** 이메일/비밀번호를 정규화하고 Argon2id hash만 저장한 뒤 새 세션을 만든다. */
  async register(input: RegisterRequest): Promise<AuthResult> {
    const credentials = registerRequestSchema.parse(input);
    const existingUser = await this.findUserByEmail(credentials.email);
    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    const now = new Date();
    const passwordHash = await argon2.hash(credentials.password, {
      type: argon2.argon2id
    });

    try {
      const rows = await this.dataSource.query<UserRow[]>(
        `
          INSERT INTO users (user_id, email, password_hash, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
          RETURNING user_id, email, password_hash, created_at, updated_at
        `,
        [`user_${randomUUID()}`, credentials.email, passwordHash, now]
      );

      return this.createSession(this.toAuthUser(rows[0]));
    } catch (error: unknown) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException("Email already registered");
      }

      throw error;
    }
  }

  /** 저장된 Argon2id hash와 입력 비밀번호를 비교해 로그인 세션을 만든다. */
  async login(input: LoginRequest): Promise<AuthResult> {
    const credentials = loginRequestSchema.parse(input);
    const user = await this.findUserByEmail(credentials.email);
    if (!user) {
      throw invalidCredentials();
    }

    const passwordMatches = await argon2.verify(
      user.password_hash,
      credentials.password
    );
    if (!passwordMatches) {
      throw invalidCredentials();
    }

    return this.createSession(this.toAuthUser(user));
  }

  /** Redis에 저장된 세션을 조회하고 만료된 세션은 즉시 삭제한다. */
  async me(sessionId: string): Promise<MeResponse> {
    const session = await this.sessions.get(sessionId);
    if (!session) {
      throw new UnauthorizedException("Authentication required");
    }

    if (isExpired(session)) {
      await this.sessions.delete(sessionId);
      throw new UnauthorizedException("Authentication required");
    }

    return meResponseSchema.parse(session);
  }

  /** 로그아웃 요청은 세션이 없어도 성공으로 보고 남아 있는 Redis 세션만 삭제한다. */
  async logout(sessionId: string | null): Promise<void> {
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }
  }

  /** 인증 성공 시 7일 TTL의 session payload를 만들고 session id와 함께 반환한다. */
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

  /** email 대소문자 차이를 무시하고 기존 사용자를 찾는다. */
  private async findUserByEmail(email: string): Promise<UserRow | undefined> {
    const rows = await this.dataSource.query<UserRow[]>(
      `
        SELECT user_id, email, password_hash, created_at, updated_at
        FROM users
        WHERE lower(email) = lower($1)
      `,
      [email]
    );

    return rows[0];
  }

  /** DB row의 snake_case 필드를 외부 응답용 auth user 계약으로 변환한다. */
  private toAuthUser(row: UserRow): AuthUser {
    return authUserSchema.parse({
      userId: row.user_id,
      email: row.email,
      createdAt: toIso(row.created_at)
    });
  }
}

/** 가입 여부를 드러내지 않는 공통 로그인 실패 예외를 만든다. */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException("Invalid email or password");
}

/** Postgres unique index 충돌을 회원가입 중복 이메일 오류로 해석한다. */
function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

/** TypeORM query 결과의 날짜 타입 차이를 ISO 문자열로 통일한다. */
function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/** 세션의 expiresAt이 현재 시각을 지났는지 확인한다. */
function isExpired(session: AuthSession): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now();
}
