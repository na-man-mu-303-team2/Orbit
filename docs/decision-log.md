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

## ORBIT test automation gate policy

- Context: Jira 완료 기준을 PR 리뷰에서 추적하기 쉽게 만들고, PR과 merge 후 모두 상황에 맞는 자동 검증을 실행해야 한다.
- Options considered:
  - PR과 `main`/`develop` push 모두 빠른 unit/API/Python/Compose/Playwright smoke를 실행한다.
  - PR에서는 unit/API만 실행하고 merge 후 Playwright smoke를 실행한다.
  - PR에서는 수동 체크리스트만 사용하고 merge 후 자동 테스트를 실행한다.
- Final decision: PR과 `main`/`develop` push 모두 기존 TypeScript/Python/Compose 검증과 얇은 Playwright smoke를 실행한다. 무거운 full E2E, STT 품질 측정, 1000명 load test는 manual 또는 scheduled 검증으로 분리한다.
- Rationale: Jira 구현 누락과 기본 화면/API 회귀를 merge 전에 막되, 환경 의존적이고 오래 걸리는 검증은 필수 PR gate에서 분리해 flaky risk를 낮춘다.
- Affected files: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/testing/jira-test-matrix.md`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `package.json`.
- Follow-up review notes: 실제 기능별 Playwright flow와 load harness가 안정화되면 branch protection required checks에 추가할지 별도로 검토한다.

## ORBIT smoke CI output policy

- Context: Playwright smoke 검증은 Docker Compose로 API/Web 서비스를 띄우지만, CI 실패 디버깅용 로그 출력은 애플리케이션 로그에 민감값이 섞일 경우 노출 위험을 만든다.
- Options considered:
  - 실패 시 `docker compose logs api web`을 출력한다.
  - 실패 시 서비스 상태만 출력하고 상세 로그는 로컬/권한 있는 환경에서 재현한다.
  - smoke 디버깅 출력을 모두 제거한다.
- Final decision: smoke job은 실패 여부와 관계없이 `docker compose ps`로 서비스 상태만 출력한다.
- Rationale: CI에서 환경 파일 내용이나 secret 값을 직접 출력하지 않는 보안 원칙을 우선하면서도, 서비스 기동 여부는 최소한으로 확인할 수 있다.
- Affected files: `.github/workflows/ci.yml`.
- Follow-up review notes: 추후 CI 로그 마스킹과 애플리케이션 로그 정책이 정리되면 제한된 로그 아티팩트 업로드 방식을 재검토한다.
