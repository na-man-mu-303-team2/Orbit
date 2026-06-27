# ORBIT

ORBIT는 발표 자료 생성, 편집, 발표 리허설, 청중 참여 흐름을 하나의 로컬 우선 모노레포로 연결하는 프로젝트입니다.

이 저장소는 `pnpm` workspace와 Turborepo를 사용하며, Web, API, Worker, Python worker, 공통 패키지를 한 저장소에서 함께 관리합니다.

## 빠른 시작

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
cp .env.example .env.local
node infra/scripts/check-env.mjs
docker compose up --build
```

로컬 서비스 주소:

| 서비스 | 주소 |
| --- | --- |
| Web | <http://localhost:5173> |
| API health | <http://localhost:3000/health> |
| API Swagger | <http://localhost:3000/docs> |
| Python worker health | <http://localhost:8000/health> |
| MinIO console | <http://localhost:9001> |

## 폴더 구조

```text
apps/
  web/              Vite React client
  api/              NestJS REST API + Socket.IO gateway
  worker/           NestJS background worker
services/
  python-worker/    FastAPI worker for document, speech, and AI helper tasks
packages/
  shared/           Zod schemas, shared contracts, API/Job/WebSocket types
  config/           Environment validation and runtime config
  editor-core/      Deck/editor domain helpers
  realtime/         Realtime event helpers
  job-queue/        Job queue ports and adapters
  storage/          Storage ports and adapters
  ai/               LLM/STT/OCR provider interfaces
infra/
  docker/           Service Dockerfiles
  scripts/          Environment and smoke-check scripts
docs/
  architecture/     Architecture and stack documents
  conventions/      Git, Jira, environment conventions
  runbooks/         Operational runbooks
  spikes/           Research notes
.github/
  workflows/        CI, Jira link validation, Jira completion automation
```

작업 영역 기준:

| 작업 영역 | 주로 수정하는 곳 |
| --- | --- |
| Web 화면/클라이언트 | `apps/web`, 필요 시 `packages/shared`, `packages/editor-core`, `packages/realtime` |
| API | `apps/api`, 필요 시 `packages/shared`, `packages/config`, `packages/storage`, `packages/job-queue`, `packages/realtime` |
| Background worker | `apps/worker`, 필요 시 `packages/shared`, `packages/job-queue`, `packages/storage`, `packages/ai` |
| Python worker | `services/python-worker` |
| 공통 계약 | `packages/shared`, `docs/contracts.md` |

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Monorepo | pnpm workspace, Turborepo |
| Runtime | Node.js `>=22.12`, Docker 기준 Node 24 |
| Language | TypeScript 5.8, Python 3.12 |
| Web | React 19, Vite 7, TanStack Query, Zustand |
| Canvas editor | Konva, React Konva |
| Realtime | Socket.IO, Yjs |
| API | NestJS 11, TypeORM, Swagger, Zod |
| Worker | NestJS, BullMQ, Redis |
| Python worker | FastAPI, Uvicorn, Pydantic, OpenAI SDK |
| Local DB | PostgreSQL + pgvector |
| Local cache/queue | Redis |
| Local storage | MinIO |
| Production target | AWS ECS Fargate, RDS PostgreSQL, ElastiCache, S3, SQS |

상세 버전 기준은 [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md)를 확인합니다.

## 주요 명령

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
node infra/scripts/check-env.mjs
docker compose config
docker compose up --build
```

Python worker 변경 시:

```bash
cd services/python-worker
uv sync
uv run ruff check .
uv run mypy app
uv run pytest
```

DB migration 변경 시:

```bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
```

## Git 브랜치 전략

기본 전략은 GitHub Flow입니다.

- `main`에 직접 커밋하지 않습니다.
- 모든 작업은 이슈 키가 들어간 브랜치에서 진행합니다.
- PR은 기본적으로 `develop`을 대상으로 만들고, 필요한 경우 `develop` 변경사항을 `main`으로 동기화합니다.
- 이미 원격에 push된 공유 브랜치에는 rebase 또는 force push를 하지 않습니다.

브랜치 이름 예시:

```text
feature/ORBIT-123-slide-control
fix/ORBIT-124-keyword-detection
docs/ORBIT-216-readme-current-state
chore/ORBIT-214-jira-webhook-runner
sync/ORBIT-214-develop-main
```

권장 prefix:

| prefix | 용도 |
| --- | --- |
| `feature` | 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `test` | 테스트 추가/수정 |
| `refactor` | 리팩터링 |
| `chore` | 설정/잡무 |
| `ci` | CI 변경 |
| `sync` | 브랜치 동기화 |

## Jira, Commit, PR 규칙

Jira 자동 연결을 위해 브랜치명, 커밋 메시지, PR 제목에 같은 Jira 이슈 키를 넣습니다.

```text
브랜치: docs/ORBIT-216-readme-current-state
커밋: docs: ORBIT-216 README 최신화
PR 제목: [ORBIT-216] 문서: PR 자동 검사 사용 방법 정리하기
```

커밋 메시지 형식:

```text
<type>: ORBIT-123 변경 요약
```

예시:

```text
feat: ORBIT-123 실시간 슬라이드 제어 추가
fix: ORBIT-124 키워드 중복 알림 수정
docs: ORBIT-216 README 최신화
```

PR 본문에는 완료 처리할 Jira 이슈를 `완료한 JIRA 이슈` 섹션에 적습니다.

```markdown
## 완료한 JIRA 이슈

- [ORBIT-216] 문서: PR 자동 검사 사용 방법 정리하기

## 변경 요약

- README에 현재 폴더 구조, 기술 스택, 브랜치/PR/Jira 규칙을 정리했습니다.

## 테스트/검증

- `git diff --check`
- `node infra/scripts/check-env.mjs`

## 영향 범위

- 문서 변경만 포함합니다.
```

`jira-link` 체크는 PR 제목과 source branch에 같은 Jira 이슈 키가 있는지 검증합니다.

## PR 자동 검사와 완료 자동화

PR에는 다음 체크가 붙습니다.

| 체크 | 내용 |
| --- | --- |
| `jira-link` | PR 제목과 브랜치명에 같은 Jira 키가 있는지 확인 |
| `typescript` | TypeScript build/lint/test |
| `python-worker` | Python worker sync/lint/typecheck/test |
| `compose-config` | Docker Compose 설정 검증 |

Jira 이슈 완료 기준은 단순 push가 아니라 PR merge입니다.

```text
Jira 이슈 확인
-> ORBIT 키 포함 브랜치 생성
-> 구현/문서 수정
-> ORBIT 키 포함 커밋
-> develop 대상 PR 생성
-> 필수 체크 통과
-> PR merge
-> Jira 자동 완료 workflow 실행
```

Jira 완료 webhook은 `main` 또는 `develop`에 merge된 PR의 제목, source branch, PR 본문 `완료한 JIRA 이슈` 섹션에서 Jira 이슈 키를 찾아 처리합니다.

## 환경변수 규칙

- 로컬 실행 전 `.env.example`을 복사해 `.env.local`을 만듭니다.
- `.env`, `.env.local`, API 키, 토큰, 비밀값은 커밋하지 않습니다.
- staging/production 예시는 `.env.staging.example`, `.env.production.example`을 기준으로 합니다.
- 환경변수 규칙은 [docs/conventions/environment.md](docs/conventions/environment.md)를 확인합니다.

```bash
cp .env.example .env.local
node infra/scripts/check-env.mjs
```

## 공통 계약 규칙

- Deck JSON의 기준은 Konva 상태가 아니라 `packages/shared` schema와 [docs/contracts.md](docs/contracts.md)입니다.
- API request/response, Job, WebSocket payload는 `packages/shared`의 Zod schema를 기준으로 합니다.
- 공통 계약을 바꾸는 PR은 `docs/contracts.md` 또는 shared schema 변경을 함께 포함합니다.
- Demo ID는 [docs/demo-standards.md](docs/demo-standards.md), `.env.example`, `packages/shared`에서 일관되게 관리합니다.

## 커밋 금지 항목

다음 항목은 커밋하지 않습니다.

```text
.env
.env.local
API keys
tokens
secrets
node_modules
.venv
dist
.turbo
build outputs
cache files
```

## 참고 문서

| 문서 | 내용 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 에이전트와 작업자가 지켜야 하는 최상위 작업 규칙 |
| [docs/contracts.md](docs/contracts.md) | 공통 계약 |
| [docs/git-rules.md](docs/git-rules.md) | Git과 PR 규칙 |
| [docs/conventions/jira.md](docs/conventions/jira.md) | Jira 연동 규칙 |
| [docs/conventions/environment.md](docs/conventions/environment.md) | 환경변수 규칙 |
| [docs/runbooks/local-development.md](docs/runbooks/local-development.md) | 로컬 개발 runbook |
| [docs/architecture/local-first-stack.md](docs/architecture/local-first-stack.md) | 로컬 우선 아키텍처 |
| [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md) | 기술 스택 버전 |
| [docs/deployment.md](docs/deployment.md) | AWS 배포 기준 |
