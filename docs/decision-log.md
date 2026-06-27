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

## ORBIT-90 API project and asset boundary

- Context: ORBIT-90은 프로젝트 생성과 project-scoped asset upload URL/complete API를 구현한다. 저장소 문서는 1차 스프린트가 임시 사용자 기반 프로젝트 생성에서 시작한다고 정의하며, 인증/워크스페이스 초대 흐름은 별도 선행/인접 작업이다.
- Options considered:
  - 실제 인증/멤버십 모델을 새로 만든다.
  - 모든 workspaceId와 projectId를 허용한다.
  - 기존 `DEMO_USER_ID`, `DEMO_WORKSPACE_ID` 기준으로 임시 boundary를 적용한다.
- Final decision: ORBIT-90에서는 `DEMO_WORKSPACE_ID`만 접근 가능한 workspace로 보고, 생성자는 `DEMO_USER_ID`로 저장한다. project asset API는 project가 이 workspace 안에 있을 때만 허용한다.
- Rationale: 현재 문서화된 1차 스프린트 E2E 시작점과 demo ID 기준을 유지하면서, workspace member가 아닌 사용자 접근을 허용하지 않는다.
- Affected files: `apps/api/src/projects/**`, `apps/api/src/files/**`, `packages/shared/src/projects/project.schema.ts`, `docs/contracts.md`.
- Follow-up review notes: 실제 인증/워크스페이스 membership 구현이 들어오면 demo boundary를 세션 사용자와 membership repository 검증으로 교체한다.

## ORBIT-90 asset upload policy

- Context: ORBIT-10/ORBIT-90은 PDF/DOCX/PPTX/image upload complete와 지원하지 않는 mime type 실패를 요구하지만, 저장소에 명시된 파일 크기 정책은 없다.
- Options considered:
  - 파일 형식과 크기를 제한하지 않는다.
  - 모든 image mime type을 허용한다.
  - MVP 시나리오에 필요한 문서 형식과 주요 이미지 형식만 허용하고 보수적인 크기 제한을 둔다.
- Final decision: PDF, PPTX, DOCX, JPEG, PNG, WebP만 허용하고 단일 파일 최대 크기는 50MiB로 제한한다.
- Rationale: 문서의 검증 시나리오를 충족하면서 저장 비용과 예기치 않은 binary upload surface를 제한한다.
- Affected files: `packages/shared/src/files/file.schema.ts`, `apps/api/src/files/**`, `docs/contracts.md`.
- Follow-up review notes: 제품 정책에서 허용 파일 형식, 이미지 범위, 파일 크기 제한이 확정되면 shared schema와 UI 안내 문구를 함께 갱신한다.

## ORBIT-90 pending asset retention

- Context: upload URL 발급 후 complete가 호출되지 않는 실패 케이스가 명시되어 있다.
- Options considered:
  - upload URL 발급 시 metadata를 저장하지 않는다.
  - pending metadata를 저장하고 complete 시 uploaded로 전환한다.
  - complete 요청에서만 metadata를 최초 저장한다.
- Final decision: upload URL 발급 시 `pending` asset metadata를 저장하고, complete 호출 시 `uploaded`로 전환한다.
- Rationale: complete 누락 상태를 API/DB에서 추적할 수 있고 후속 cleanup job을 붙이기 쉽다.
- Affected files: `apps/api/src/files/**`, `apps/api/src/database/migrations/2026062703000-CreateProjectsAndProjectAssets.ts`.
- Follow-up review notes: pending asset TTL, object existence check, cleanup job은 작업큐 또는 storage adapter 기능이 준비된 뒤 별도 결정한다.
