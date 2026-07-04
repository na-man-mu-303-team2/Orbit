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

- Context: 개인 서버 배포는 Doppler `orbit / stg` secret을 사용하지만, 저장소의 staging 예시는 S3, SQS, AWS Transcribe, AWS Textract를 전제로 한다. 개인 서버 override는 같은 서버 안의 Redis, MinIO, Python worker를 올리므로 staging secret 값을 그대로 주입하면 web 부팅, queue 처리, asset 접근, 인증 검증, STT demo가 깨질 수 있다.
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
