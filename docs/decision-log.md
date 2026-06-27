# Decision Log

이 문서는 자동 구현 세션에서 생긴 비자명한 정책, 아키텍처, 데이터 보관, 접근제어, 저장 결정의 기록이다.

## ORBIT-8 self-managed auth policy

- Context: ORBIT-8은 회원가입, 로그인, 로그아웃, 현재 사용자 조회를 self-managed email/password auth로 구현한다. 기존 문서는 1차 스프린트에서 ORBIT-8을 제외하고 Demo ID를 사용한다고 정의했으나, 이번 구현 승인으로 인증 계약을 추가해야 한다.
- Options considered:
  - 기존 Demo ID 흐름만 유지하고 인증 구현을 보류한다.
  - 외부 auth provider를 붙인다.
  - email/password, Argon2id, signed HttpOnly cookie, Redis session으로 자체 인증을 구현한다.
- Final decision: ORBIT-8은 email/password 인증을 추가하되, 기존 Demo ID 기반 기능은 즉시 제거하지 않는다. 비밀번호는 Argon2id hash로만 저장하고, session id는 signed HttpOnly cookie로 전달하며 session payload는 Redis에 저장한다.
- Rationale: Jira 완료 기준의 self-managed auth 요구를 충족하면서 기존 데모 흐름과 다른 작업의 project boundary를 갑자기 깨지 않는다.
- Affected files: `packages/shared/src/auth/**`, `apps/api/src/auth/**`, `apps/api/src/database/migrations/2026062702000-CreateAuthUsers.ts`, `apps/web/src/features/auth/**`, `docs/contracts.md`, `docs/demo-standards.md`.
- Follow-up review notes: 프로젝트/워크스페이스 membership 모델이 확정되면 Demo ID boundary를 session user 기반 authorization으로 교체한다.

## ORBIT-8 session and password bounds

- Context: Jira 설명은 사람이 세션 유지 시간과 비밀번호 정책을 확정해야 한다고 적고 있지만, 이번 자동 구현 세션에서는 보수적인 MVP 기본값이 필요하다.
- Options considered:
  - 세션 TTL과 password length 제한을 두지 않는다.
  - 짧은 세션 TTL을 사용한다.
  - MVP 사용성을 고려한 7일 TTL과 최소 8자 password 정책을 둔다.
- Final decision: session TTL은 7일로 두고, password는 8자 이상 128자 이하로 검증한다. Redis key는 raw session id가 아니라 `SESSION_SECRET` 기반 HMAC digest를 사용한다.
- Rationale: 너무 짧은 세션으로 데모 흐름이 자주 끊기는 것을 피하면서, 무제한 password/session surface를 두지 않는다.
- Affected files: `packages/shared/src/auth/auth.schema.ts`, `apps/api/src/auth/auth.constants.ts`, `apps/api/src/auth/auth-session.store.ts`, `docs/contracts.md`.
- Follow-up review notes: 제품 보안 정책에서 MFA, password complexity, session inactivity timeout, refresh policy가 확정되면 shared schema와 API/session store를 갱신한다.
