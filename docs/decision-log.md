# Decision Log

이 문서는 자동 구현 세션에서 생긴 비자명한 정책, 아키텍처, 데이터 보관, 접근제어, 저장 결정의 기록이다.

## ORBIT-8 self-managed auth policy

- Context: ORBIT-8은 회원가입, 로그인, 로그아웃, 현재 사용자 조회를 self-managed email/password auth로 구현한다. 기존 문서는 1차 스프린트에서 ORBIT-8을 제외하고 Demo ID를 사용한다고 정의했으나, 이번 구현 승인으로 인증 계약을 추가해야 한다.
- Options considered:
  - 기존 Demo ID 흐름만 유지하고 인증 구현을 보류한다.
  - 외부 auth provider를 붙인다.
  - email/password, Argon2id, signed HttpOnly cookie, Redis session으로 자체 인증을 구현한다.
- Final decision: ORBIT-8은 email/password 인증을 추가하되, 기존 Demo ID 기반 기능은 즉시 제거하지 않는다. 비밀번호는 Argon2id hash로만 저장하고, session id는 signed HttpOnly cookie로 전달하며 session payload는 Redis에 저장한다.
- Rationale: self-managed auth 요구를 충족하면서 기존 데모 흐름과 다른 작업의 project boundary를 갑자기 깨지 않는다.
- Affected files: `packages/shared/src/auth/**`, `apps/api/src/auth/**`, `apps/api/src/database/migrations/2026062702000-CreateAuthUsers.ts`, `apps/web/src/features/auth/**`, `docs/contracts.md`, `docs/demo-standards.md`.
- Follow-up review notes: 프로젝트/워크스페이스 membership 모델이 확정되면 Demo ID boundary를 session user 기반 authorization으로 교체한다.

## ORBIT-8 session and password bounds

- Context: 세션 유지 시간과 비밀번호 정책은 사람이 최종 확정해야 하지만, 이번 자동 구현 세션에서는 보수적인 MVP 기본값이 필요하다.
- Options considered:
  - 세션 TTL과 password length 제한을 두지 않는다.
  - 짧은 세션 TTL을 사용한다.
  - MVP 사용성을 고려한 7일 TTL과 최소 8자 password 정책을 둔다.
- Final decision: session TTL은 7일로 두고, password는 8자 이상 128자 이하로 검증한다. Redis key는 raw session id가 아니라 `SESSION_SECRET` 기반 HMAC digest를 사용한다.
- Rationale: 너무 짧은 세션으로 데모 흐름이 자주 끊기는 것을 피하면서, 무제한 password/session surface를 두지 않는다.
- Affected files: `packages/shared/src/auth/auth.schema.ts`, `apps/api/src/auth/auth.constants.ts`, `apps/api/src/auth/auth-session.store.ts`, `docs/contracts.md`.
- Follow-up review notes: 제품 보안 정책에서 MFA, password complexity, session inactivity timeout, refresh policy가 확정되면 shared schema와 API/session store를 갱신한다.

## ORBIT test automation gate policy

- Context: 기능 완료 기준을 PR 리뷰에서 추적하기 쉽게 만들고, PR과 merge 후 모두 상황에 맞는 자동 검증을 실행해야 한다.
- Options considered:
  - PR과 `main`/`develop` push 모두 빠른 unit/API/Python/Compose/Playwright smoke를 실행한다.
  - PR에서는 unit/API만 실행하고 merge 후 Playwright smoke를 실행한다.
  - PR에서는 수동 체크리스트만 사용하고 merge 후 자동 테스트를 실행한다.
- Final decision: PR과 `main`/`develop` push 모두 기존 TypeScript/Python/Compose 검증과 얇은 Playwright smoke를 실행한다. 무거운 full E2E, STT 품질 측정, 1000명 load test는 manual 또는 scheduled 검증으로 분리한다.
- Rationale: 기능 구현 누락과 기본 화면/API 회귀를 merge 전에 막되, 환경 의존적이고 오래 걸리는 검증은 필수 PR gate에서 분리해 flaky risk를 낮춘다.
- Affected files: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/testing/test-matrix.md`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `package.json`.
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

## ORBIT path-scoped PR CI policy

- Context: 모든 PR에서 TypeScript/Python/Compose/Playwright smoke를 실행하면 docs-only 또는 automation-only PR도 제품 회귀 테스트를 기다려야 한다. 반대로 workflow 전체를 path filter로 스킵하면 branch protection에서 required check가 pending으로 남을 수 있다.
- Options considered:
  - 기존처럼 모든 PR에서 전체 빠른 gate를 실행한다.
  - workflow-level `paths-ignore`로 docs-only PR 전체 CI를 스킵한다.
  - 선행 변경 파일 분류 job을 두고 job-level `if`로 관련 검증만 실행한다.
- Final decision: PR에서는 `detect-changes` job으로 docs-only, automation-only, CI workflow, product/API/shared/worker/compose/env/lockfile 변경을 분류하고 관련 job만 실행한다. `main`/`develop` push에서는 merge 후 조합 검증을 위해 전체 빠른 gate를 유지한다. 자동 리뷰 코드, prompt, schema, workflow, root automation 파일이 바뀐 PR에서는 Codex review job을 실행하지 않는다.
- Rationale: 구현과 무관한 PR의 대기 시간을 줄이면서도 required check pending 문제를 피한다. 또한 PR이 변경한 automation code가 `OPENAI_API_KEY` 또는 `GITHUB_TOKEN`과 함께 실행되는 경로를 차단한다.
- Affected files: `.github/workflows/ci.yml`, `docs/testing/test-matrix.md`.
- Follow-up review notes: branch protection에서 개별 job을 required check로 쓰는 경우 skipped job 표시가 팀 기대와 맞는지 확인하고, 필요하면 별도 aggregate required check를 추가한다.

## ORBIT Playwright smoke CI temporary suspension

- Context: Playwright smoke gate가 PR과 `main`/`develop` push 자동 검증에 포함되어 있지만, 현재는 안정성 재검토 전까지 자동화 테스트에서 임시로 제외해야 한다.
- Options considered:
  - Playwright smoke 테스트 파일과 `test:smoke` 스크립트를 삭제한다.
  - `playwright-smoke` job 정의는 유지하되 job-level 조건으로 항상 skip한다.
  - 변경 경로 분류에서만 `playwright_smoke` 출력을 끈다.
- Final decision: `playwright-smoke` job은 그대로 보존하고 job-level `if: ${{ false }}`로 임시 skip한다. 로컬 또는 수동 검증용 `pnpm test:smoke` 스크립트와 Playwright 테스트 파일은 유지한다.
- Rationale: 자동 gate에서만 제외하면 flaky 또는 환경 의존 이슈가 PR merge를 막지 않으면서도, smoke 재활성화와 수동 회귀 검증 경로를 잃지 않는다.
- Affected files: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/testing/test-matrix.md`.
- Follow-up review notes: smoke 안정화 원인이 정리되면 기존 path-scoped 조건을 복구하고 branch protection에서 skipped check 처리가 팀 기대와 맞는지 다시 확인한다.

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

## ORBIT-92 browser upload environment

- Context: ORBIT-91 화면은 브라우저에서 `PUT uploadUrl`을 직접 호출한다. 기존 local storage adapter는 공개 object URL만 반환해 실제 upload URL 흐름을 재현하지 못했다.
- Options considered:
  - API가 파일 binary를 proxy로 받아 MinIO에 저장한다.
  - 기존 공개 object URL을 유지하고 upload complete만 처리한다.
  - 모든 환경에서 S3-compatible presigned PUT URL을 발급한다.
- Final decision: local MinIO 모드에서는 API가 같은-origin upload proxy URL을 발급하고, proxy endpoint가 MinIO에 object를 저장한다. S3 모드에서는 `@orbit/storage`의 AWS SDK presigner 기반 S3-compatible adapter를 사용한다.
- Rationale: 로컬/CI 브라우저 smoke에서 CORS와 host signature mismatch를 피하면서도, staging/production S3 전환 시 같은 `StoragePort`와 upload-url/complete 계약을 유지할 수 있다.
- Affected files: `packages/storage/src/index.ts`, `packages/storage/package.json`, `apps/api/src/files/**`, `docker-compose.yml`, `pnpm-lock.yaml`.
- Follow-up review notes: staging/production에서는 S3 bucket CORS origin을 실제 web origin으로 제한하고, S3 credentials는 secret store로만 주입한다.

## ORBIT develop Codex review automation policy

- Context: `develop` 대상 PR마다 Codex standard review를 실행해 diff, 관련 계약 문서, 주변 코드, CI 결과를 함께 검토해야 한다. 리뷰는 파일/라인, 레포 규칙, 계약/API, 테스트/CI, 실제 위험, 공식 기술스택 문서 근거를 남겨야 한다.
- Options considered:
  - GitHub 내장 Codex 리뷰만 사용한다.
  - GitHub Actions에서 diff만 Codex에 전달한다.
  - GitHub Actions에서 diff, 레포 규칙, 계약 문서, 기술스택 공식문서 요약, CI 결과를 묶어 Codex standard review를 실행한다.
- Final decision: `pull_request`의 `opened`, `synchronize`, `reopened`, `ready_for_review` 이벤트에서 base branch가 `develop`이고 same-repository PR이며 draft가 아닐 때만 Codex review를 실행한다. Codex가 읽는 context는 secret-like path와 lockfile/binary/generated full diff를 제외하고, 생성된 리뷰는 diff line 검증 후 GitHub PR review로 게시한다.
- Rationale: 비용을 통제하면서도 계약/API와 테스트 누락을 확인할 충분한 맥락을 제공하고, fork PR 또는 secret 노출 위험을 기본적으로 차단한다.
- Affected files: `.github/workflows/ci.yml`, `.github/codex/**`, `infra/scripts/build-codex-review-context.mjs`, `infra/scripts/post-codex-review.mjs`, `docs/review/official-tech-stack-references.md`, `.gitignore`.
- Follow-up review notes: GitHub Actions에서 첫 실행 결과를 확인한 뒤 Codex model/effort, inline comment cap, fork PR 정책, branch protection required check 포함 여부를 별도 검토한다.

## ORBIT Korean Codex review output policy

- Context: Codex standard review는 ORBIT 팀 PR에 직접 게시되는 리뷰이므로, 한국어 협업 흐름과 맞아야 한다. 기존 prompt와 게시 스크립트 문구는 영어 summary와 inline comment를 만들었다.
- Options considered:
  - Codex action의 기본 영어 출력에 맡긴다.
  - GitHub에 게시하기 직전에 번역 단계를 별도로 추가한다.
  - prompt에서 사람이 읽는 필드를 한국어로 요구하고, 게시 스크립트의 고정 문구도 한국어로 바꾼다.
- Final decision: `summary`, `title`, `body`, `followUps`는 한국어로 작성하게 하고, severity/category enum, 파일 경로, line reference, command, schema key는 원문을 유지한다. 게시 스크립트의 fixed heading과 evidence label도 한국어로 표시한다.
- Rationale: 별도 번역 단계 없이 리뷰 품질과 schema 안정성을 유지하면서, 팀원이 PR에서 바로 읽을 수 있는 한국어 리뷰를 만든다.
- Affected files: `.github/codex/prompts/develop-standard-review.md`, `infra/scripts/post-codex-review.mjs`, `docs/decision-log.md`.
- Follow-up review notes: 첫 한국어 자동 리뷰 결과에서 용어가 어색하거나 severity/category가 번역되어 schema 검증을 깨는지 확인한다.

## ORBIT develop Codex review automation removal

- Context: `OPENAI_API_KEY` 기반 Codex PR review automation이 `develop`에 적용되었지만, 운영 정책 재검토를 위해 일단 제거해야 한다.
- Options considered:
  - GitHub repository secret만 제거하고 workflow는 남긴다.
  - Codex review job만 조건으로 비활성화한다.
  - OpenAI key를 사용하는 Codex review job, prompt/schema/context/posting scripts, review-only docs를 제거하고 기존 CI 분기 검증은 유지한다.
- Final decision: `develop` PR에서 OpenAI Codex review를 실행하거나 PR review comment를 게시하는 GitHub Actions 경로를 제거한다. PR 유형별 CI 검증과 `pnpm lint` 실행 방식은 유지한다.
- Rationale: secret 의존 자동리뷰를 중단하면서도 기존 CI 비용 절감/검증 분기와 로컬 lint 안정성은 보존한다.
- Affected files: `.github/workflows/ci.yml`, `.github/codex/**`, `infra/scripts/build-codex-review-context.mjs`, `infra/scripts/post-codex-review.mjs`, `docs/review/official-tech-stack-references.md`, `.gitignore`, `docs/decision-log.md`.
- Follow-up review notes: 자동리뷰를 다시 도입할 경우 모델, 비용, secret 권한, fork PR 정책, required check 포함 여부를 별도 승인 후 새 결정으로 기록한다.

## ORBIT GitHub Codex Korean review guidance

- Context: GitHub 내장 Codex 코드 리뷰는 저장소의 `AGENTS.md` review guidance를 읽을 수 있지만, 저장소에는 리뷰 출력 언어를 고정하는 지침이 없었다. 팀 협업 흐름은 한국어 PR 리뷰를 기대하며, 이전 `OPENAI_API_KEY` 기반 자동리뷰 제거 결정과 충돌하지 않는 방식이 필요하다.
- Options considered:
  - Codex 기본 출력 언어에 맡긴다.
  - GitHub Actions 기반 Codex review automation을 다시 도입한다.
  - `AGENTS.md`에 GitHub PR 리뷰용 한국어 출력 지침을 추가한다.
- Final decision: `AGENTS.md`에 `Review guidelines`를 추가해 Codex가 GitHub PR 리뷰 요약과 inline comment를 한국어로 작성하게 한다. 코드 식별자, 파일 경로, 명령어, schema key, enum, severity label은 원문을 유지하고, secret 값은 출력하지 않는다.
- Rationale: 별도 secret이나 GitHub Actions 자동리뷰 경로를 되살리지 않고도, GitHub 내장 Codex 리뷰가 저장소 협업 언어와 보안 원칙을 따르게 할 수 있다.
- Affected files: `AGENTS.md`, `docs/decision-log.md`.
- Follow-up review notes: 다음 Codex PR 리뷰에서 요약과 inline comment가 한국어로 작성되는지, technical identifier가 불필요하게 번역되지 않는지 확인한다.

## ORBIT Jira retirement

- Context: 팀이 Jira를 더 이상 사용하지 않기로 하면서, PR마다 Jira key를 요구하거나 merge 후 Jira Automation webhook을 호출하는 저장소 규칙과 자동화가 불필요해졌다.
- Options considered:
  - `jira-link` check만 제거하고 Jira key 팀 규칙과 merge-time Jira 완료 workflow는 유지한다.
  - Jira 관련 workflow만 비활성화하고 문서 규칙은 나중에 정리한다.
  - Jira key 팀 규칙, PR template 항목, Jira webhook workflow, 관련 helper scripts, Jira 전용 문서를 함께 제거한다.
- Final decision: Jira 관련 GitHub Actions workflow와 helper scripts를 제거하고, 브랜치/PR/커밋에 Jira key를 요구하는 팀 규칙을 삭제한다. 기존 Jira test matrix는 일반 test matrix로 전환한다.
- Rationale: 사용하지 않는 외부 서비스 규칙과 secret 의존 자동화를 남기면 새 PR 작성과 branch protection 운영에 혼선을 만든다.
- Affected files: `.github/workflows/jira-link.yml`, `.github/workflows/jira-complete-issue.yml`, `.github/pull_request_template.md`, `AGENTS.md`, `docs/git-rules.md`, `docs/conventions/jira.md`, `docs/runbooks/jira-webhook-self-hosted-runner.md`, `docs/testing/test-matrix.md`, `infra/scripts/validate-jira-link.mjs`, `infra/scripts/build-jira-webhook-payload.mjs`, `docs/decision-log.md`.
- Follow-up review notes: GitHub branch protection의 `main`, `develop` required status checks에서 `jira-link`가 남아 있으면 제거한다. Repository secrets에 `JIRA_AUTOMATION_WEBHOOK_URL`이 남아 있으면 삭제한다. Self-hosted runner label `jira-access`가 Jira 전용이었다면 정리한다.

## ORBIT-228 personal server develop deployment boundary

- Context: 공식 production 배포 경로가 완성되기 전에 `develop` 브랜치를 개인 서버에서 staging/demo로 검증할 수 있는 반복 가능한 절차가 필요하다.
- Options considered:
  - 개인 서버를 production 환경으로 취급한다.
  - 수동 Docker Compose 명령을 계속 사용한다.
  - Doppler secret, Nginx reverse proxy, Docker Compose override를 사용해 개인 서버 staging/demo 경로를 정의한다.
- Final decision: 개인 서버는 `develop` staging/demo 환경으로만 취급한다. Doppler `orbit / stg`, host Nginx public entrypoint, localhost-bound app services, Docker Compose staging override를 사용한다.
- Rationale: 실제 서버에서 `develop`을 검증할 수 있게 하면서도, 문서화된 AWS ECS Fargate production 목표와 경계를 분리한다.
- Affected files: `docker-compose.staging.yml`, `infra/scripts/deploy-personal-server.sh`, `docs/runbooks/personal-server-deployment.md`, `docs/decision-log.md`.
- Follow-up review notes: 수동 배포 스크립트가 서버에서 검증된 뒤 GitHub Actions 자동 배포를 별도 결정으로 추가한다. TLS를 설정하기 전까지 이 endpoint를 production으로 취급하지 않는다.

## ORBIT-228 personal server runtime override policy

- Context: 개인 서버 배포는 Doppler `orbit / stg` secret을 사용하지만, 저장소의 staging 예시는 S3, AWS Transcribe, AWS Textract를 전제로 한다. 개인 서버 override는 같은 서버 안의 Redis, MinIO, Python worker를 올리므로 staging secret 값을 그대로 주입하면 web 부팅, queue 처리, asset 접근, 인증 검증, STT demo가 깨질 수 있다.
- Options considered:
  - Doppler `stg` 값을 개인 서버 토폴로지에 맞춰 수동으로 계속 관리한다.
  - staging 예시 값을 그대로 사용하고 실패 항목을 runbook troubleshooting으로만 설명한다.
  - Docker Compose override에서 개인 서버 전용 runtime driver와 localhost-bound service mapping을 고정하고, runbook은 HTTPS와 Nginx `/assets/` proxy 요구를 명시한다.
- Final decision: 개인 서버 compose override에서 web `WEB_PORT`, MinIO storage, BullMQ queue, OpenAI STT, Python OCR, Textract disabled 값을 명시적으로 고정한다. MinIO object API는 host Nginx가 `/assets/`를 proxy할 수 있도록 localhost에만 bind하고, staging 인증 흐름 검증은 HTTPS origin을 요구한다.
- Rationale: 개인 서버 배포가 Doppler staging 값의 AWS 전제에 흔들리지 않게 하고, asset URL과 secure cookie 동작을 실제 브라우저 검증 경로와 맞춘다. MinIO object API는 외부 공개 포트가 아니라 localhost Nginx upstream으로 제한한다.
- Affected files: `docker-compose.staging.yml`, `docs/runbooks/personal-server-deployment.md`, `docs/decision-log.md`.
- Follow-up review notes: 개인 서버 Nginx 설정이 실제 서버에 반영된 뒤 `/assets/<bucket>/<key>` 접근, 인증 cookie 저장, reference extraction/job 처리, rehearsal STT demo를 서버에서 수동 검증한다.

## ORBIT-228 personal server automatic deploy policy

- Context: 개인 서버 배포 절차가 수동 스크립트로 정리되었지만, `develop` merge 뒤 사람이 서버에 접속해 실행해야 하면 staging/demo 검증이 누락될 수 있다. 또한 `APP_ENV=staging` validation은 local default인 `S3_BUCKET=orbit-local`을 금지하므로 개인 서버 MinIO bucket도 staging 전용 이름을 사용해야 한다.
- Options considered:
  - 수동 배포 스크립트만 유지한다.
  - GitHub-hosted runner에서 SSH secret으로 개인 서버에 접속한다.
  - 개인 서버 self-hosted runner가 최소 sudo wrapper만 실행하고, 서버 내부 checkout과 Doppler token으로 배포한다.
- Final decision: `develop` push와 수동 `workflow_dispatch`에서 `orbit-personal-staging` self-hosted runner가 `/usr/local/sbin/orbit-deploy-personal-staging` wrapper를 실행한다. 개인 서버 MinIO bucket은 `orbit-personal-staging`으로 고정한다. GitHub repository secret은 사용하지 않고, Doppler token과 deploy key는 서버에만 둔다.
- Rationale: GitHub에 서버 SSH secret을 저장하지 않고, runner 권한을 단일 wrapper 실행으로 제한하면서 merge 후 배포를 자동화한다. staging validation의 local-default 금지 정책도 유지한다.
- Affected files: `.github/workflows/deploy-personal-staging.yml`, `docker-compose.staging.yml`, `docs/runbooks/personal-server-deployment.md`, `docs/decision-log.md`.
- Follow-up review notes: 첫 merge 후 GitHub Actions에서 runner label 매칭, sudoers wrapper 실행, `db:migration:run`, `/api/health`, `/assets/orbit-personal-staging/` 접근을 확인한다. 완전 자동 배포가 목표면 GitHub Environment `personal-staging`에 required reviewer를 설정하지 않는다.

## ORBIT personal HTTP demo auth cookie exception

- Context: 개인 서버 develop demo가 HTTP origin으로 운영되는 동안 `APP_ENV=staging`의 secure auth cookie가 브라우저에 저장되지 않아 로그인 후 `/api/v1/auth/me`가 401을 반환한다.
- Options considered:
  - 즉시 HTTPS 도메인과 TLS 인증서를 붙인다.
  - `APP_ENV=local`로 내려서 staging validation을 우회한다.
  - 명시적 `AUTH_COOKIE_SECURE=false` override를 개인 서버 staging에만 허용한다.
- Final decision: `AUTH_COOKIE_SECURE` optional env를 추가하고, 명시된 경우 auth cookie의 `secure` 값을 override한다. 단, `AUTH_COOKIE_SECURE=false`는 `APP_ENV=staging`에서 `WEB_ORIGIN`과 `API_BASE_URL`이 모두 `http://`인 개인 서버 HTTP demo에만 허용하고, `APP_ENV=production` 또는 `https://` staging origin에서는 금지한다.
- Rationale: 개인 서버 HTTP demo의 인증 흐름을 검증할 수 있게 하면서도 HTTPS staging/prod에서 non-secure auth cookie가 실수로 남는 설정을 startup 단계에서 거부한다.
- Affected files: `packages/config/src/index.ts`, `apps/api/src/auth/auth-cookie.ts`, `apps/api/src/config/env.schema.spec.ts`, `.env.example`, `.env.staging.example`, `.env.production.example`, `docker-compose.staging.yml`, `docs/conventions/environment.md`, `docs/runbooks/personal-server-deployment.md`, `docs/decision-log.md`.
- Follow-up review notes: HTTPS 적용 후 Doppler `orbit / stg`의 `AUTH_COOKIE_SECURE` 값을 비우거나 `true`로 되돌린다. 값이 남아 있으면 HTTPS staging startup이 실패해야 한다.

## ORBIT-38 rehearsal report retention and access policy

- Context: ORBIT-38은 리허설 결과 보고서 화면과 report API를 단독 완료형으로 구현한다. ORBIT-37의 고급 0-100 점수 산식은 아직 확정되지 않았고, transcript 원문은 발표자 발화 민감 데이터가 될 수 있다.
- Options considered:
  - `jobs.result`만 조회해 보고서를 표시한다.
  - `rehearsal_runs.report_json`을 공식 보고서 저장 위치로 둔다.
  - transcript를 기본 보존하거나, 사용자가 별도 보존을 선택하기 전까지 저장하지 않는다.
  - 현재 demo/project boundary를 재사용하거나 완전한 workspace member role 모델을 새로 추가한다.
- Final decision: 공식 보고서는 `rehearsal_runs.report_json`에 저장하고 `GET /api/v1/rehearsals/:runId/report`에서 조회한다. `transcript_retained=false`를 기본값으로 두며, 이때 `report.transcript`는 `null`이어야 한다. 접근 제어는 현재 프로젝트 접근 경계를 재사용하고, 고급 0-100 점수는 ORBIT-37 후속으로 남긴다.
- Rationale: report API가 Job 기록에 덜 묶이고, 민감 발화 원문 보존을 최소화하며, ORBIT-38 범위 안에서 presenter-only 기본 접근을 현재 구조와 충돌 없이 제공할 수 있다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `apps/api/src/rehearsals/**`, `apps/api/src/database/migrations/2026062903000-AddRehearsalReportColumns.ts`, `apps/worker/src/rehearsal-stt.processor.ts`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: ORBIT-37에서 실제 점수 산식과 transcript 보존 opt-in 정책이 확정되면 `RehearsalReport` schema, worker 저장 정책, UI 노출 조건을 함께 재검토한다.

## ORBIT-113 rehearsal report score boundary

- Context: 리허설 리포트 화면이 `RehearsalReport.metrics`의 기본 지표를 바탕으로 종합 발표 점수, 전달력, 속도 안정성, 키워드 회수 점수를 프론트엔드에서 계산해 표시하고 있었다. 하지만 `docs/contracts.md`는 ORBIT-37의 고급 0-100 점수 산식이 확정되기 전까지 점수를 계약과 UI에 포함하지 않는다고 정의한다.
- Options considered:
  - 기존 UI 계산 점수를 임시 점수로 유지한다.
  - `RehearsalReport`에 `score` 계열 필드를 추가하고 현재 프론트 산식을 공식화한다.
  - ORBIT-37 전까지 점수 필드를 계약에서 거부하고 UI는 공식 `report_json`의 원시 지표와 coaching만 표시한다.
- Final decision: `score`, `deliveryScore`, `speedScore` 같은 0-100 점수 필드는 ORBIT-37 전까지 `RehearsalReport` 계약에서 거부한다. UI는 점수 블록을 제거하고 `durationSeconds`, `wordsPerMinute`, `keywordCoverage`, `fillerWordCount`, `pauseCount`, `coaching`처럼 worker가 저장한 공식 값만 표시한다.
- Rationale: 산식 없는 점수를 공식 리포트처럼 보여주면 사용자와 팀이 분석 품질을 과신할 수 있다. 계약을 먼저 고정해 worker, API, UI가 같은 데이터 원본을 따르게 한다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `packages/shared/src/rehearsals/rehearsal.schema.test.ts`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: ORBIT-37에서 점수 산식과 평가 기준이 확정되면 shared schema에 공식 점수 필드를 추가하고, worker에서 계산해 `report_json`에 저장한 뒤 UI가 그 필드만 표시하도록 재검토한다.

## ORBIT-114 rehearsal report detail generation

- Context: ORBIT-113에서 산식 없는 0-100 점수는 계약과 UI에서 제거했지만, 리허설 리포트에는 말 속도 변화, 습관어 상세, pause 상세, 누락 키워드 상세처럼 UI가 추정하지 않고 공식 `report_json`에서 읽을 수 있는 상세 재료가 필요하다.
- Options considered:
  - UI가 평균값과 deck keyword를 사용해 상세 지표를 계속 추정한다.
  - Python worker가 상세 지표를 만들고 TS worker가 shared `RehearsalReport` schema 검증 후 `report_json`에 저장한다.
  - 상세 지표를 별도 테이블에 저장한다.
- Final decision: `speedSamples`, `fillerWordDetails`, `pauseDetails`, `missedKeywords`를 `RehearsalReport` 공식 필드로 추가한다. Python worker가 가능한 값만 계산하고 값이 부족하면 빈 배열을 반환하며, TS worker는 분석 응답을 safe fallback으로 검증한 뒤 shared schema를 통과한 리포트만 저장한다.
- Rationale: 상세 지표를 `report_json`에 함께 저장하면 API, worker, UI가 같은 공식 원본을 공유하고, UI가 평균값이나 deck만으로 누락 키워드와 속도 변화를 추정하지 않아도 된다. 점수 산식은 여전히 ORBIT-37 전까지 제외한다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `packages/shared/src/rehearsals/rehearsal.schema.test.ts`, `services/python-worker/app/main.py`, `services/python-worker/app/rehearsal.py`, `services/python-worker/tests/test_rehearsal_analyze.py`, `apps/worker/src/rehearsal-stt.processor.ts`, `apps/worker/src/rehearsal-stt.processor.spec.ts`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: UI 후속 작업은 `speedSamples`, `fillerWordDetails`, `pauseDetails`, `missedKeywords`만 사용해 상세 섹션을 렌더링하고, 필드가 빈 배열이면 추정값 대신 empty state를 보여준다.

## ORBIT-116 rehearsal run meta and slide timing policy

- Context: 리허설 리포트에 슬라이드별 실제 체류 시간을 표시하려면 녹음 완료 전에 web이 slide 진입 이벤트를 API에 저장해야 한다. 기존 계약에는 `PATCH /api/v1/rehearsals/:runId/meta`가 설계되어 있었지만 DB 저장, API 구현, worker 조회, web 업로드 순서가 연결되어 있지 않았다.
- Options considered:
  - web이 리포트 화면에서 deck과 평균 발표 시간으로 slide timing을 추정한다.
  - `rehearsal_runs.meta_json`에 원문 없는 사건 정보만 저장하고, worker가 report 생성 시 공식 `slideTimings`를 계산한다.
  - Python worker에 slide timing 계산을 위임한다.
- Final decision: `rehearsal_runs.meta_json`을 공식 run meta 저장 위치로 추가하고, web은 `audio/complete` 전에 `slideTimeline`, `missedKeywords`, `adviceEvents`만 PATCH한다. worker는 `slideTimeline`의 연속된 slide 진입 시각 차이로 `slideTimings`를 계산하며, 종료 시각이 없는 마지막 slide는 실제 시간을 추정하지 않는다.
- Rationale: transcript, speaker notes, raw audio, script 원문 없이도 리포트에 필요한 사건 정보만 저장할 수 있고, deck 목표 시간과 run meta를 함께 읽을 수 있는 TS worker가 공식 report JSON을 일관되게 조립할 수 있다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `apps/api/src/rehearsals/**`, `apps/api/src/database/migrations/2026070301000-AddRehearsalRunMetaJson.ts`, `apps/worker/src/rehearsal-stt.processor.ts`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: chunked audio upload이 구현되면 meta PATCH와 audio-complete 사이의 ordering을 동일하게 유지하고, 녹음 종료 시각을 별도 meta 필드로 추가할지 검토한다.

## ORBIT-117 QnA report minimal contract

- Context: 청중 QnA 기반 피드백을 리허설 리포트에 표시해야 하지만, 현재 audience 기능은 입장/검증 중심이고 질문 원문 저장 API가 아직 없다. 계약 문서는 질문 원문을 report에 저장하지 않는 정책을 이미 정의한다.
- Options considered:
  - 질문 원문 배열을 report에 저장한다.
  - 기존 `packages/shared/src/presentation/presentation.schema.ts`의 레거시 `reportSchema.questionCount`를 리허설 report로 재사용한다.
  - `RehearsalReport`에 원문 없는 `qnaSummary`만 추가하고 실제 질문 데이터 소스는 후속 작업으로 둔다.
- Final decision: `RehearsalReport.qnaSummary`는 `questionCount`, `questionSummary`, `unclearTopics[].topic`, optional `slideId`만 포함한다. 현재 PR에서는 기본값으로 질문 수 0과 빈 요약을 저장하고, UI는 empty state를 표시한다. 레거시 presentation report schema는 외부 참조 가능성을 고려해 이번 범위에서 삭제하지 않는다.
- Rationale: 질문 원문과 발표자 발화 원문을 리포트에 섞지 않는 보안/보존 정책을 지키면서, 후속 audience 질문 저장 API가 생겼을 때 연결할 최소 계약을 먼저 고정한다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `apps/worker/src/rehearsal-stt.processor.ts`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: audience 질문 생성/저장 API가 구현되면 원문 보존 범위, 요약 생성 위치, slideId 매핑 정책을 별도 결정으로 기록한 뒤 `qnaSummary` 생성 로직을 연결한다.

## ORBIT GitHub Actions CI removal policy

- Context: 기존 CI workflow의 `typescript` job이 실패하고 있으며, 사용자는 이미지에 표시된 CI job(`detect-changes`, `automation-check`, `typescript`, `python-worker`, `compose-config`, `playwright-smoke`)에 해당하는 CI 코드를 일단 모두 제거하도록 승인했다.
- Options considered:
  - 실패한 `typescript` job만 임시 비활성화한다.
  - `playwright-smoke`처럼 전체 CI job을 skip 상태로 보존한다.
  - `.github/workflows/ci.yml`을 제거하고 PR 검증은 수동 체크리스트로 전환한다.
- Final decision: `.github/workflows/ci.yml`을 삭제해 GitHub Actions CI job을 제거한다. 개인 서버 배포용 `.github/workflows/deploy-personal-staging.yml`은 CI가 아니라 staging deploy workflow이므로 유지한다.
- Rationale: 사용자가 요청한 CI 코드 삭제 범위를 이미지의 CI job 전체로 해석하고, 배포 자동화까지 함께 제거하는 과도한 변경은 피한다. PR 검증은 수동 명령과 PR 본문 증거로 남긴다.
- Affected files: `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `docs/testing/test-matrix.md`, `README.md`, `docs/decision-log.md`.
- Follow-up review notes: GitHub branch protection에 삭제된 CI job이 required check로 남아 있으면 GitHub 설정에서 제거해야 한다. CI를 다시 도입할 때는 `pnpm test:smoke` 범위와 Python worker OS/Python 버전 차이를 먼저 정리한다.

## ORBIT TypeScript CI restore policy

- Context: 전체 CI 제거 뒤 사용자는 삭제된 CI 중 `typescript` 자동 검증만 다시 되살리도록 요청했다. 기존 `typescript` job은 `check-env`, `pnpm build`, `pnpm lint`, `pnpm test`를 실행했다.
- Options considered:
  - 기존 `.github/workflows/ci.yml` 전체를 복원한다.
  - `typescript` job만 별도 workflow로 복원한다.
  - build/lint만 실행하고 test는 제외한다.
- Final decision: `.github/workflows/typescript-ci.yml`을 새로 추가해 TypeScript 관련 path의 PR과 `develop` push에서 `check-env`, `pnpm build`, `pnpm lint`, `pnpm test`만 실행한다. Python worker, Compose, Playwright smoke, automation-check, detect-changes job은 복원하지 않는다.
- Rationale: 사용자가 요청한 복구 범위를 TypeScript 자동 검증으로 제한하면서, 기존 `typescript` job의 핵심 회귀 검증은 유지한다. 별도 workflow로 분리해 전체 CI 삭제 결정과 충돌하지 않도록 한다.
- Affected files: `.github/workflows/typescript-ci.yml`, `.env.staging.example`, `.env.production.example`, `apps/web/src/features/editor/shell/EditorShell.test.tsx`, `docs/testing/test-matrix.md`, `README.md`, `docs/decision-log.md`.
- Follow-up review notes: GitHub branch protection required check로 `typescript`를 다시 지정할지는 첫 PR 실행 결과를 확인한 뒤 별도 결정한다. Python worker/Compose/Playwright smoke 자동화 재도입은 별도 안정화 PR에서 검토한다.

## ORBIT rehearsal filler and long-pause detection heuristic

- Context: 리허설 리포트의 `fillerWordCount`, `fillerWordDetails`, `pauseCount`, `pauseDetails`는 이미 공식 계약에 있지만, Python worker의 filler 감지는 정확한 단어 매칭에 치우쳐 있고 긴 침묵 감지는 segment timestamp가 있을 때만 확인된다.
- Options considered:
  - `RehearsalReport`에 새 분석 필드를 추가한다.
  - LLM으로 transcript에서 filler를 재추출한다.
  - 기존 report 계약은 유지하고 Python worker의 보수적 휴리스틱과 회귀 테스트만 강화한다.
- Final decision: 기존 `RehearsalReport` 계약을 유지한다. Python worker는 `으음`, `음음`, `umm`, `uhh`처럼 늘어난 filler 토큰과 `뭐 랄까`, `you know`, `i mean`, `kind of`, `sort of` 같은 phrase filler를 canonical 표현으로 묶어 계산한다. 긴 침묵은 기존 `pauseDetails`의 segment gap 계산을 공식 경로로 유지하고 회귀 테스트로 고정한다.
- Rationale: 계약과 UI를 흔들지 않고 현재 report STT 분석 품질을 개선할 수 있다. transcript에 남지 않은 filler나 timestamp가 없는 침묵은 서버 분석만으로 복원할 수 없으므로, 이번 변경은 STT provider가 제공한 transcript와 segment metadata 안에서 안전하게 개선한다.
- Affected files: `services/python-worker/app/rehearsal.py`, `services/python-worker/tests/test_rehearsal_analyze.py`, `docs/decision-log.md`.
- Follow-up review notes: report STT provider가 word-level timestamp 또는 더 원본에 가까운 disfluency transcript를 제공하면 audio/segment 기반 pause와 filler 분석을 별도 결정으로 재검토한다.

## ORBIT local report STT model uses whisper-1

- Context: 리허설 리포트의 긴 침묵/발표 속도(WPM)/구간 속도는 STT가 준 segment timestamp와 duration으로 계산한다. 그런데 기존 로컬 기본 모델 `gpt-4o-transcribe`는 `response_format="json"`만 지원해 transcript 텍스트만 반환하고 duration·segment를 주지 않는다. 그 결과 로컬에서 리허설을 녹음해도 WPM은 `-`, 긴 침묵은 0으로만 나와 해당 지표를 테스트할 수 없었다.
- Options considered:
  - `gpt-4o-transcribe`를 유지하고 Python worker에서 오디오 길이를 별도 측정(ffprobe 등)해 duration만 확보한다. (WPM은 복구되나 segment timestamp가 없어 긴 침묵/구간 속도는 여전히 불가.)
  - report STT provider를 hosted WhisperX로 교체한다. (정밀한 word-level alignment를 얻지만 별도 추론 서버 운영이 필요.)
  - 로컬 기본 report STT 모델을 `whisper-1`로 바꿔 `verbose_json` 경로로 duration과 segment timestamp를 확보한다.
- Final decision: 로컬 설정(`.env.example`, `docker-compose.yml`)의 `OPENAI_TRANSCRIPTION_MODEL` 기본값만 `whisper-1`로 바꾼다. `_openai_response_format`은 이미 whisper-1에 대해 `verbose_json`을 반환하므로 파싱 로직 변경은 없다. staging/production 예시 설정은 이번 결정 범위에서 제외한다.
- Rationale: 코드 변경 없이 로컬에서 긴 침묵·filler·WPM 지표를 실제 데이터로 검증할 수 있다. whisper-1의 `verbose_json`만이 duration과 segment timestamp를 동시에 제공한다. 전사 텍스트 정확도는 gpt-4o 계열보다 소폭 낮을 수 있으나, 시간 기반 지표 복구가 우선이다.
- Affected files: `.env.example`, `docker-compose.yml`, `services/python-worker/tests/test_audio_transcribe.py`, `docs/decision-log.md`.
- Follow-up review notes: staging/production report STT 모델을 어떤 값으로 고정할지는 전사 정확도와 시간 지표 요구를 함께 저울질해 별도 결정으로 확정한다. 정밀한 침묵 분석이 필요하면 WhisperX provider 전환을 재검토한다.

## ORBIT staging report STT model uses whisper-1

- Context: 로컬 리허설 report STT 기본 모델을 `whisper-1`로 바꾼 뒤, 개인 서버 staging에서도 같은 긴 침묵·WPM·segment timestamp 기반 지표를 확인해야 한다. 기존 staging 예시는 `gpt-4o-transcribe`를 사용하고, `docker-compose.staging.yml`은 Doppler/staging secret의 `OPENAI_TRANSCRIPTION_MODEL` 값을 그대로 받아서 Python worker가 시간 정보 없는 transcript만 받을 수 있었다.
- Options considered:
  - staging secret 값만 수동으로 바꾼다.
  - `.env.staging.example`만 `whisper-1`로 바꾸고 compose override는 그대로 둔다.
  - `.env.staging.example`과 개인 서버 staging compose override에서 report STT 모델을 `whisper-1`로 명시한다.
- Final decision: staging 예시와 개인 서버 staging compose override의 API, worker, python-worker env에서 `OPENAI_TRANSCRIPTION_MODEL=whisper-1`을 사용한다. `REPORT_STT_PROVIDER=openai`는 유지하고 WhisperX provider로 전환하지 않는다.
- Rationale: staging에서도 local과 같은 report STT 시간 지표를 재현할 수 있고, Doppler/staging secret에 이전 모델 값이 남아 있어도 개인 서버 staging report STT 실행 경로가 흔들리지 않는다. 표준 OpenAI API key는 계속 서버 환경에만 두며 브라우저에 노출하지 않는다.
- Affected files: `.env.staging.example`, `docker-compose.staging.yml`, `docs/conventions/environment.md`, `docs/decision-log.md`.
- Follow-up review notes: production의 report STT 모델은 전사 정확도, 비용, 시간 기반 지표 요구를 따로 검토한 뒤 확정한다. staging 배포 뒤 실제 리허설 녹음에서 `durationSeconds`, `speedSamples`, `pauseDetails`가 채워지는지 확인한다.

## ORBIT P0 parallel coaching contract boundary

- Context: 네 담당자가 평가기, 음성 측정, 집중 연습, report 통합을 병렬 구현하려면 기존 C0 read contract만으로는 사용자 focus revision, 한국어 CPM, STT confidence 부재, pause v2, 문장 target, 짧은 음성 근거의 보존·권한 경계가 고정되지 않는다. 현재 raw audio는 분석 뒤 삭제되고, 30~60초 모범 발화 audio는 Later 후보이므로 P0 Evidence Clip과도 구분해야 한다.
- Options considered:
  - 각 담당 브랜치가 필요한 enum, DTO, fixture, 저장 구조를 자체 정의한다.
  - 문서에 shape만 적고 schema와 migration은 담당 구현 PR에서 나중에 합친다.
  - shared schema, 공통 fixture, strict Python 요청 경계, focus/clip migration을 선행 PR로 고정하고 담당 구현은 이를 import한다.
- Final decision: `RehearsalFocusProfile`은 Brief와 분리된 project-level CAS aggregate로 두고 run snapshot에 revision과 item 값을 동결한다. 한국어 속도는 공백 제외 CPM v1을 canonical로, WPM을 호환값으로 둔다. STT confidence는 provider가 준 경우만 사용하고, pause v2 분류 근거가 없으면 `unknown`을 강제한다. sentence target은 text snapshot hash를 가진다. 문제 근거용 Evidence Clip은 raw audio와 별개인 최대 12초 파생물로 기본 7일 보관하고 Owner만 재생한다. report에는 clip ID만 포함하고 URL·storage key·audio file ID를 넣지 않는다. Presenter Aid는 전체 script를 숨기고 남은 시간·keyword 최대 3개·미해결 문제 최대 1개만 허용한다.
- Rationale: 계약과 fixture를 먼저 고정하면 네 구현 스트림이 같은 상태·단위·보안 경계를 사용하고, confidence·timestamp·audio가 없을 때 값을 추측하지 않는다. 12초 사용자 근거와 30~60초 모범 audio를 분리해 기존 raw audio 삭제 정책과 Later 범위를 보존한다.
- Affected files: `packages/shared/src/coaching/*`, `packages/shared/src/rehearsals/*`, `packages/shared/src/index.ts`, `packages/shared/src/README.md`, `apps/api/src/database/migrations/2026071301000-CreateP0CoachingContracts.ts`, `apps/api/src/database/data-source.ts`, `apps/worker/src/rehearsal-stt.processor.ts`, `services/python-worker/app/main.py`, `services/python-worker/app/audio/transcribe.py`, `services/python-worker/app/rehearsal.py`, `services/python-worker/tests/test_rehearsal_analyze.py`, `docs/contracts.md`, `docs/product/adaptive-rehearsal-coach-direction.md`, `docs/decision-log.md`.
- Follow-up review notes: API 구현은 focus PUT에서 CAS conflict를 HTTP 409로 매핑하고 Evidence playback마다 project Owner를 재검사한다. clip storage key는 DB 내부와 StoragePort에만 두고 로그에 남기지 않는다. 만료·조기 삭제·project 삭제는 기존 deletion outbox를 재사용한다. Editor 접근 확대, 30일 연장, 30~60초 모범 audio는 별도 제품·개인정보·권한 결정 전에는 구현하지 않는다.

## ORBIT rehearsal analysis DTO v2 contract

- Context: 기존 `/rehearsal/analyze` DTO는 `durationSeconds=0`으로 근거 없음과 실제 값을 구분하지 못하고, language/provider/model, normalized confidence, response measurement state가 없다. TypeScript sender와 Python boundary를 순차 배포하려면 양쪽이 구현할 strict v2 shape와 짧은 v1 호환 표면을 먼저 고정해야 한다.
- Options considered:
  - 기존 v1 필드에 optional field만 추가하고 `durationSeconds=0` 의미를 유지한다.
  - v1/v2 endpoint를 장기간 병행한다.
  - 같은 endpoint에서 `contractVersion: 2` request/response를 canonical로 고정하고, 기존 v1은 배포 전환 동안만 dual-read한다.
- Final decision: request와 response는 `contractVersion: 2`를 사용한다. recording/provider duration을 nullable 양수로 분리하고, segment time pair·시간 순서·finite number·ID 길이를 strict Zod schema로 검증한다. response는 Quality Gate, measurement state, capability, filler occurrence, pause v1·v2와 합계·정렬 불변식을 포함한다. confidence 미제공은 `unavailable/CONFIDENCE_NOT_PROVIDED`이며 지표 계산 자체를 차단하지 않는다. 현재 normalization profile registry는 비어 있어 알 수 없는 profile은 거부한다. v1 request schema와 합성 fixture는 Python cutover 및 retry Job drain이 끝날 때까지만 유지한다.
- Rationale: 값과 측정 상태를 함께 전달하면 `0`을 측정 실패로 오해하지 않고, 양쪽 runtime이 동일한 nested strict 계약을 독립적으로 구현할 수 있다. version literal과 명시적 compatibility schema는 부분 배포 중 신규 write와 legacy read 경계를 드러낸다.
- Affected files: `packages/shared/src/coaching/rehearsal-analyze.schema.ts`, `packages/shared/src/coaching/p0-core-contract.fixtures.json`, `packages/shared/src/coaching/p0-core-contract.schema.test.ts`, `services/python-worker/tests/test_rehearsal_analyze.py`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: Python은 canonical v2 fixture를 읽는 strict Pydantic v2 request/response와 안전한 HTTP 422 body를 구현한다. TypeScript worker는 그 다음 v2만 새로 쓰고 response를 shared schema로 parse한다. 두 runtime 배포와 retry Job drain을 확인한 뒤 v1 schema와 fixture를 별도 cleanup PR에서 제거한다.

## ORBIT rehearsal recording duration transport contract

- Context: v2 분석 DTO는 실제 녹음 전체 시간과 Provider duration을 분리하지만, 기존 Run meta와 audio-complete 요청에는 Web recorder가 측정한 실제 경과시간을 전달하는 공통 필드가 없다. 기존 worker는 Provider duration이 없으면 `0` sentinel을 만들어 실제 0과 근거 없음을 구분하지 못한다.
- Options considered:
  - Provider duration을 실제 녹음 시간으로 계속 사용한다.
  - legacy upload와 chunk upload가 서로 다른 duration 필드를 사용한다.
  - `recordingDurationSeconds` nullable 양수 계약을 audio-complete와 Run meta가 함께 사용하고 기존 payload는 `null`로 읽는다.
- Final decision: `recordingDurationSeconds`는 생략 또는 `null`, 값이 있으면 양수 finite number만 허용한다. legacy upload complete, chunk upload complete, Run meta가 같은 shared schema를 사용하며 `0`, 음수, `NaN`, `Infinity`를 거부한다. Web/API producer는 분석 enqueue 전에 값을 Run meta에 저장하고, worker는 후속 P1에서 같은 값을 v2 분석 요청에 전달하되 Provider duration으로 덮어쓰지 않는다.
- Rationale: 실제 전체 녹음 시간을 별도 canonical transport로 보존하면 duration resolver와 마지막 slide timing이 같은 근거를 사용하고, 배포 전 저장된 Run meta와 기존 complete 요청은 `null` default로 계속 읽을 수 있다.
- Affected files: `packages/shared/src/rehearsals/rehearsal.schema.ts`, `packages/shared/src/rehearsals/rehearsal.schema.test.ts`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `apps/web/src/features/rehearsal/speech/rehearsalLogCollector.ts`, `apps/web/src/features/rehearsal/speech/rehearsalLogCollector.test.ts`, `apps/web/src/features/rehearsal/speech/p3RehearsalSession.test.ts`, `docs/contracts.md`, `docs/decision-log.md`.
- Follow-up review notes: Web/API producer는 legacy와 chunk upload 모두 실제 recorder 경과시간을 보내고 Run meta 저장 성공 뒤에만 분석 Job을 enqueue한다. P1 worker sender는 Run meta 값을 `recordingDurationSeconds`로 전달하고 STT Provider 값은 `providerDurationSeconds`에만 둔다.

## ORBIT environment contract CI and personal staging deployment gate

- Context: 기존 환경 검증은 TypeScript CI 내부에서 예시 파일의 key 존재와 집합만 비교했다. 허용되지 않은 빈 값·중복·잘못된 선언 형식을 잡지 못했고, `develop` push의 개인 서버 배포 workflow도 CI 결과와 독립적으로 시작했다.
- Options considered:
  - 기존 TypeScript CI 안에서만 `check-env.mjs`를 강화하고 배포 workflow는 그대로 둔다.
  - 별도 Environment Contract CI를 모든 PR과 `develop` push에서 실행하고 성공한 `develop` run만 개인 서버 배포를 시작한다.
  - 실제 Doppler 값을 PR CI에 전달해 한 번에 검사한다.
- Final decision: 환경 계약을 의존성 설치가 없는 별도 `environment-contract` job으로 분리한다. 예시 파일은 key 누락·집합 불일치·중복·형식 오류·환경별로 허용되지 않은 빈 값을 검사한다. 실제 개인 서버 값은 secret을 출력하지 않는 배포 전 Bash preflight로 검사한다. `develop` push의 자동 배포는 같은 workflow의 후속 `needs` job이 reusable deploy workflow를 호출해 검증한 `github.sha`를 wrapper에 전달하고, 서버의 실제 `develop` HEAD가 다르면 build 전에 거부한다. 상위 workflow concurrency는 PR run만 `cancel-in-progress`하고 `develop` push run은 취소하지 않는다.
- Rationale: PR에는 실제 secret을 노출하지 않으면서 환경 계약 오류를 빠르게 확인하고, merge 뒤에도 환경 검증 실패나 검증되지 않은 최신 commit이 서비스 교체까지 진행되는 것을 막는다. PR 검증은 최신 commit만 남기되, `develop` 배포가 build·migration·service 교체 도중 새 push 때문에 중간 취소되는 것은 방지한다. 수동 배포는 CI를 우회할 수 있지만 동일한 서버 환경 preflight와 Compose interpolation 검증은 반드시 거친다.
- Affected files: `.github/workflows/environment-contract-ci.yml`, `.github/workflows/typescript-ci.yml`, `.github/workflows/deploy-personal-staging.yml`, `infra/scripts/check-env.mjs`, `infra/scripts/check-personal-staging-env.sh`, `infra/scripts/deploy-personal-server.sh`, `docs/conventions/environment.md`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `README.md`, `docs/decision-log.md`.
- Follow-up review notes: PR의 `environment-contract` check가 생성되면 GitHub `main dev protect` ruleset에 required status check로 등록해야 merge 차단이 활성화된다. PR merge 전에 개인 서버의 `/usr/local/sbin/orbit-deploy-personal-staging` wrapper를 runbook의 mode와 SHA 전달 버전으로 갱신하고, 첫 자동 배포에서 환경 오류가 key 이름만 출력되는지와 검증 SHA·서버 HEAD 일치를 확인한다.

## ORBIT personal staging Doppler environment-only redeploy

- Context: 개인 서버 컨테이너는 Doppler 값을 시작 시 읽으므로 `orbit / stg` secret만 수정·삭제하면 실행 중인 프로세스에는 반영되지 않는다. 기존 `develop` 전체 배포를 다시 실행하면 불필요한 image build가 발생하고, 필수값 삭제나 잘못된 값이 서비스 교체 뒤에 발견될 수 있다.
- Options considered:
  - Doppler 변경마다 기존 `full` build/migration 배포를 다시 실행한다.
  - 서명 검증 relay service를 추가해 GitHub App installation token을 동적으로 발급한다.
  - Doppler Webhook이 최소 권한 fine-grained token으로 기존 workflow의 `environment-only` mode를 직접 dispatch한다.
- Final decision: personal staging에만 직접 workflow dispatch를 사용한다. `environment-only` mode는 현재 `develop` SHA와 서버 HEAD 일치, 필수값·Compose 검증, 기존 이미지의 Node/Python runtime schema 검증을 모두 통과한 뒤에만 앱 컨테이너 네 개를 `--no-build --force-recreate`한다. 전체 코드 배포는 기존 `full` mode와 Environment Contract CI gate를 유지한다.
- Rationale: 앱 secret과 서버 credential을 GitHub로 복사하지 않고 기존 self-hosted runner·Doppler read-only token·배포 lock을 재사용한다. 검증 실패를 서비스 교체 전에 확정하고, 코드 변경이 없는 secret 갱신에는 image build를 생략한다. 짧은 수명의 GitHub App installation token은 relay가 없는 정적 Webhook 인증에 사용하지 않는다.
- Affected files: `.github/workflows/environment-contract-ci.yml`, `.github/workflows/deploy-personal-staging.yml`, `infra/scripts/deploy-personal-server.sh`, `docs/conventions/environment.md`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `README.md`, `docs/decision-log.md`.
- Follow-up review notes: merge 전에 서버 wrapper를 mode와 SHA를 받되 `full`은 기존 script 호환을 위해 SHA-only로 전달하는 버전으로 갱신하고, PR #264의 단순 full redeploy 경로는 중복으로 merge하지 않는다. merge 뒤 Doppler `stg` Webhook과 `Actions: write` fine-grained token을 저장소 범위로 설정한다. 첫 변경에서 preflight 실패 시 기존 컨테이너가 유지되는지, 성공 시 네 앱 컨테이너만 재생성되는지, 중복 delivery가 직렬화되는지 확인한다.

## ORBIT personal staging env source policy and safe Doppler sync

- Context: 새 env key가 예시 파일에 추가돼도 Doppler key 생성과 개인 서버 Compose 전달은 별개여서, 운영자가 key를 하나씩 만들고 서버 배포 script를 다시 실행했다. 모든 예시 값을 Doppler에 일괄 복사하면 secret placeholder나 환경별 URL을 실제 값처럼 저장하고 기존 secret을 덮어쓸 위험이 있다.
- Options considered:
  - `.env.staging.example` 전체를 매번 Doppler에 bulk upload한다.
  - 새 key를 계속 수동 등록하고 서버 배포 script를 직접 실행한다.
  - 각 key의 source와 개인 서버 delivery를 정책 파일로 분류하고, 누락된 안전한 일반 설정만 추가한 뒤 기존 webhook으로 재배포한다.
- Final decision: `infra/env/personal-staging-env-policy.json`에서 모든 staging key를 `repo-default`, `doppler-optional`, `doppler-required`와 `compose`, `code-default` 조합으로 분류한다. Environment Contract CI는 정책 누락·추가 key·안전하지 않은 repo default·Compose 전달 불일치를 차단한다. `develop` full 배포는 GitHub Environment의 config-scoped `DOPPLER_STG_SYNC_TOKEN`으로 기존 값을 덮어쓰지 않고 누락된 `repo-default` + `compose` key만 한 번에 추가한 뒤 개인 서버를 배포한다. 환경별 값과 secret은 자동 생성하지 않고 누락 시 배포를 차단한다.
- Rationale: 일반 설정은 저장소의 검토 가능한 기본값으로 자동화하면서 secret 값의 출처와 변경 권한은 Doppler에 남긴다. 동기화가 기존 값을 수정하지 않고 하나의 Doppler 변경으로 처리되므로 webhook 재배포도 key 수만큼 반복되지 않는다. 개인 서버 runtime의 read-only Doppler token과 GitHub-hosted sync job의 `orbit / stg` 전용 read/write token을 분리하며, full 배포와 webhook 후속 배포는 같은 concurrency group에서 직렬화한다.
- Affected files: `.github/workflows/deploy-personal-staging.yml`, `.github/workflows/environment-contract-ci.yml`, `infra/env/personal-staging-env-policy.json`, `infra/scripts/personal-staging-env.mjs`, `infra/scripts/personal-staging-env.test.mjs`, `infra/scripts/sync-personal-staging-doppler.mjs`, `infra/scripts/check-env.mjs`, `docker-compose.staging.yml`, `package.json`, `docs/conventions/environment.md`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `docs/decision-log.md`.
- Follow-up review notes: merge 전에 GitHub Environment `personal-staging`에 `DOPPLER_STG_SYNC_TOKEN`을 등록한다. 첫 `develop` push에서 key 이름만 출력되는지, sync job 성공 뒤 full 배포가 실행되는지, Doppler Webhook Logs와 `trigger_source=doppler-stg-secrets-update` 후속 실행이 직렬화되는지 확인하고 실제 값 또는 token은 로그에 남기지 않는다.

## ORBIT stable privileged shim and Git-managed deploy implementation

- Context: 개인 서버의 root 소유 wrapper가 mode와 expected SHA 인자를 전달하지 않는 오래된 형태로 남아 있었다. 그 결과 `environment-only` workflow도 Git 관리 deploy script의 기본값인 `full`로 실행되어 Git pull을 시도했고, 검증된 SHA 고정도 우회했다. 저장소의 배포 계약과 `/usr/local/sbin`의 설치 상태가 서로 달라지는 drift를 자동 테스트로 감지할 수 없었다.
- Options considered:
  - root wrapper에 mode·SHA 검증과 호환 분기를 계속 복제한다.
  - 배포가 실행될 때마다 현재 checkout의 wrapper를 root 경로에 자동 복사한다.
  - root wrapper는 사용자 전환과 `"$@"` 전달만 담당하는 stable privileged shim으로 고정하고, 변경 가능한 검증·배포 구현은 Git 관리 script 한 곳에 둔다.
- Final decision: `infra/scripts/orbit-deploy-personal-staging-wrapper.sh`를 `/usr/local/sbin/orbit-deploy-personal-staging`의 검토 가능한 원본으로 관리한다. 설치된 파일은 `root:root 0750`을 유지하고 `/usr/bin/sudo -iu orbit -- /bin/bash /var/www/orbit/infra/scripts/deploy-personal-server.sh "$@"`만 실행한다. wrapper는 배포 중 자동 갱신하지 않으며, 변경이 필요할 때 검토된 원본을 root 전용 백업 후 원자적으로 한 번 교체한다. mode·SHA 검증과 실제 배포 정책은 `infra/scripts/deploy-personal-server.sh`가 단독 소유한다.
- Rationale: sudoers가 허용하는 root 진입점을 작고 안정적으로 유지하면서 정책 중복과 stale wrapper drift를 제거한다. `bash -lc` 문자열 조합 없이 인자 경계를 보존하고, checkout의 검토된 deploy script가 `full`과 `environment-only`의 유일한 구현이 된다. 배포가 자기 root wrapper를 자동 변경하지 않으므로 권한 상승 경계도 별도 운영 승인 아래 유지된다.
- Affected files: `infra/scripts/orbit-deploy-personal-staging-wrapper.sh`, `infra/scripts/personal-staging-wrapper.test.mjs`, `.github/workflows/environment-contract-ci.yml`, `package.json`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `docs/decision-log.md`.
- Follow-up review notes: PR merge 전에 개인 서버에서 검토된 wrapper를 root 전용 백업 후 원자적으로 설치하고 `root:root 0750`, `bash -n`, 저장소 원본과 checksum 일치, 잘못된 mode probe의 `Invalid deployment mode.` 응답을 확인한다. 서버 HEAD가 최신 `develop`과 일치하는지 확인한 뒤 새 `environment-only` run에서 Git pull, image build, migration이 실행되지 않는지 검증한다.

## ORBIT personal staging fresh-run recovery

- Context: GitHub Environment의 `DOPPLER_STG_SYNC_TOKEN`을 교체한 뒤 기존 `develop` workflow run을 재실행해도 called workflow의 `DOPPLER_TOKEN`이 빈 문자열로 해석되었다. 같은 run ID의 attempt만 반복하면 token 등록 시점 문제와 reusable workflow 경계 문제를 구분할 수 없다. sync job만 상위 workflow로 옮기면 Doppler webhook의 `environment-only` 배포가 sync와 full 배포 사이에 끼어들 수 있고, 기본 브랜치가 `main`인 저장소에서 `develop`에만 새 `workflow_dispatch`를 추가하면 GitHub가 수동 trigger를 제공하지 않는다.
- Options considered:
  - 기존 실패 run의 failed job을 계속 재실행한다.
  - Doppler sync job만 상위 Environment Contract CI로 옮긴다.
  - `develop`의 Environment Contract CI에 새 `workflow_dispatch`를 추가한다.
  - 기본 브랜치에도 이미 존재하는 `Deploy Personal Staging` 수동 entrypoint의 `develop + full + manual` 실행을 복구 경로로 사용한다.
- Final decision: 기존 `Deploy Personal Staging` workflow를 `develop`, `full`, `manual`로 수동 실행하면 `develop-push`와 같은 Doppler sync를 먼저 실행한다. 자동 push, 수동 full 복구, Doppler webhook 배포는 모두 `personal-staging-deploy` concurrency group을 유지한다. 새 top-level dispatch, Repository secret, `secrets: inherit`는 추가하지 않는다.
- Rationale: 기본 브랜치에 이미 등록된 수동 entrypoint로 완전히 새로운 run ID를 만들면서 sync와 서버 배포 사이의 순서를 보존한다. Environment secret 경계를 유지하고 token이 비어 있으면 self-hosted runner 배포 전에 중단한다.
- Affected files: `.github/workflows/deploy-personal-staging.yml`, `infra/scripts/personal-staging-env.test.mjs`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `docs/decision-log.md`.
- Follow-up review notes: PR merge push로 생성된 새 run ID에서 token 존재 확인, Doppler sync, full 배포를 순서대로 확인한다. 계속 빈 문자열이면 reusable workflow 경계를 원인으로 확정하고 환경 계약, sync, full deploy 전체 체인을 하나의 workflow 및 같은 concurrency 경계로 이동한다. 성공하면 기존 run 재실행 또는 secret 등록 시점 문제로 분류하고 현재 구조를 유지한다. 이후 수동 `develop + full + manual` run도 같은 검증에 사용할 수 있다.

## ORBIT personal staging direct Environment secret boundary

- Context: token을 다시 교체한 뒤 생성한 새 `develop` push run `29559013580`에서도 called workflow의 `sync-personal-staging-env` job은 `personal-staging` Environment deployment로 실행됐지만 `DOPPLER_TOKEN`이 빈 문자열이었다. 따라서 기존 run 재실행이나 token 등록 시점 문제는 제외됐고, 실제 자동 배포에서 reusable workflow 경계를 통과할 때 Environment secret을 읽지 못하는 동작이 재현됐다. sync job만 상위 workflow로 옮기면 수동·webhook 배포가 sync와 full 배포 사이에 끼어들 수 있다.
- Options considered:
  - Repository secret 또는 `secrets: inherit`로 token을 called workflow에 전달한다.
  - sync job만 Environment Contract CI로 이동하고 full deploy 호출은 그대로 둔다.
  - 자동 환경 계약, Doppler sync, full deploy 전체를 Environment Contract CI의 direct jobs로 실행하고 workflow 전체를 공통 deploy concurrency로 묶는다.
- Final decision: `develop` push의 `environment-contract → sync-personal-staging-env → deploy-personal-staging` 체인을 `.github/workflows/environment-contract-ci.yml`의 direct jobs로 실행한다. 이 push run의 concurrency group은 `personal-staging-deploy`로 고정하고, PR run만 기존 ref별 environment-contract group과 취소 정책을 유지한다. `.github/workflows/deploy-personal-staging.yml`은 `workflow_dispatch` 전용으로 남겨 수동 full과 Doppler webhook `environment-only`를 처리하며 `workflow_call` entrypoint는 제거한다.
- Rationale: GitHub Environment secret을 실제 job이 선언된 workflow에서 직접 읽고, 자동 환경 계약부터 서버 full 배포까지 수동·webhook 배포와 겹치지 않게 한다. token scope를 넓히거나 secret을 Repository 수준으로 내리지 않으며, sync 실패 시 self-hosted runner를 시작하지 않는다.
- Affected files: `.github/workflows/environment-contract-ci.yml`, `.github/workflows/deploy-personal-staging.yml`, `infra/scripts/personal-staging-env.test.mjs`, `docs/runbooks/personal-server-deployment.md`, `docs/testing/test-matrix.md`, `docs/decision-log.md`.
- Follow-up review notes: merge push로 생성된 새 run에서 direct sync job의 token 존재 확인과 Doppler sync 성공을 확인하고, 이어지는 full 배포의 검증 SHA·서버 HEAD·health check를 확인한다. 별도 `environment-only` run에서는 Git pull, image build, migration 로그가 없고 앱 컨테이너 재생성 및 health check만 실행되는지 확인한다.
