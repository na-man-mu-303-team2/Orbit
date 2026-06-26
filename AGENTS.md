# AGENTS.md

이 파일은 ORBIT 저장소에서 에이전트가 반드시 지켜야 하는 최상위 작업 규칙이다.
상세 설명과 예시는 `docs/` 문서를 따른다.

## 목적과 우선순위

- 규칙이 충돌하면 `AGENTS.md`를 다른 문서보다 우선한다.
- 요청 범위를 벗어난 리팩터링, 파일 이동, 대량 포맷팅을 하지 않는다.
- 사용자가 명시적으로 요청하지 않은 외부 서비스, Git 원격 상태 변경, 배포 작업을 하지 않는다.
- 구현보다 공통 계약이 먼저다. Deck, File, Job, WebSocket 구조가 바뀌면 `docs/contracts.md`와 `packages/shared`를 함께 확인한다.

## 저장소 구조와 앱 경계

- Web 작업은 기본적으로 `apps/web`, 필요한 경우 `packages/shared`, `packages/editor-core`, `packages/realtime` 안에서 처리한다.
- API 작업은 기본적으로 `apps/api`, 필요한 경우 `packages/shared`, `packages/config`, `packages/storage`, `packages/job-queue`, `packages/realtime` 안에서 처리한다.
- Worker 작업은 기본적으로 `apps/worker`, 필요한 경우 `packages/shared`, `packages/job-queue`, `packages/storage`, `packages/ai` 안에서 처리한다.
- Python worker 작업은 기본적으로 `services/python-worker` 안에서 처리한다.
- 공통 타입, API request/response, Job, WebSocket payload는 `packages/shared`의 Zod schema를 기준으로 한다.
- 여러 영역에 영향이 필요한 경우 공통 계약 변경과 기능 구현을 구분해서 작게 진행한다.
- 로컬 우선 아키텍처는 `docs/architecture/local-first-stack.md`를 따른다.

## 공통 계약 필수 규칙

- Deck JSON의 원본은 Konva 상태가 아니라 `packages/shared`의 schema와 `docs/contracts.md`의 계약이다.
- 파일 업로드 결과는 `fileId`, `projectId`, `purpose`, `url`, `createdAt` 구조를 유지한다.
- 오래 걸리는 작업은 공통 Job 구조와 `queued`, `running`, `succeeded`, `failed` 상태값을 사용한다.
- WebSocket 이벤트는 공통 envelope과 `roomId`, `sessionId`, `userId`, `payload`, `sentAt` 구조를 사용한다.
- 1차 스프린트의 E2E 시작점은 로그인부터가 아니라 임시 사용자 기반 프로젝트 생성부터다.
- Demo ID는 `docs/demo-standards.md`, `.env.example`, `packages/shared`에서 일관되게 관리한다.

## 기술스택과 환경 규칙

- 로컬 실행은 Docker Compose 기준이며 `docker compose up --build`로 전체 서비스를 올릴 수 있어야 한다.
- 운영 목표는 Kubernetes가 아니라 AWS ECS Fargate와 managed service 기준이다.
- 기술스택 버전 기준은 `docs/architecture/tech-stack-versions.md`를 따른다.
- 환경변수 규칙은 `docs/conventions/environment.md`를 따른다.
- `.env`, `.env.local`, API 키, 토큰, 비밀값을 커밋하지 않는다.
- Python worker는 `requirements.txt`가 아니라 `pyproject.toml`과 `uv.lock`을 기준으로 관리한다.
- JavaScript, TypeScript 의존성은 `package.json`과 `pnpm-lock.yaml`을 기준으로 관리한다.

## Git, 브랜치, PR 규칙

- 기본 브랜치 전략은 GitHub Flow를 사용한다.
- `main`에 직접 커밋하지 않는다.
- 모든 작업은 브랜치에서 진행하고 PR로 병합한다.
- 브랜치 이름은 가능한 경우 `feature/PPT-123-slide-control`처럼 `type/이슈번호-작업명` 형식을 사용한다.
- PR 제목에는 가능한 경우 이슈 번호와 기능명을 포함한다.
- PR 본문에는 변경 요약, 테스트/검증 내용, 영향 범위를 남긴다.
- 공통 계약을 바꾸는 PR은 `docs/contracts.md` 또는 shared schema 변경을 함께 포함한다.
- 이미 push된 공유 브랜치에는 rebase 또는 force push를 하지 않는다.
- 사용자가 요청하지 않은 Git 원격 상태 변경을 하지 않는다.
- Git과 PR 세부 기준은 `docs/git-rules.md`를 따른다.

## 코드와 테스트 필수 규칙

- 불필요한 추상화보다 명확한 구조를 우선한다.
- 외부 입력은 Zod, Pydantic 등 런타임 검증을 거친다.
- DB 변경은 TypeORM migration으로 관리한다.
- 저장소는 `StoragePort`, 작업큐는 `JobQueuePort`, AI/STT/OCR은 provider interface 뒤에 둔다.
- STT/OCR/LLM 결과는 shared schema 검증 후 저장한다.
- 발표자 script와 raw audio는 청중 API로 노출하지 않는다.
- 코드 주석은 꼭 필요한 경우에만 짧게 작성한다.
- 버그 수정 시 가능하면 재발 방지 테스트를 추가한다.
- 테스트를 실행하지 못한 경우 이유와 남은 검증 범위를 작업 결과에 남긴다.

## 권장 검증 명령

변경 범위에 맞춰 필요한 명령을 실행한다.

```bash
pnpm build
pnpm lint
pnpm test
node infra/scripts/check-env.mjs
docker compose config
```

Python worker를 변경한 경우:

```bash
cd services/python-worker
uv sync
uv run ruff check .
uv run mypy app
uv run pytest
```

DB migration을 변경한 경우:

```bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
```

## 금지 사항

- `.env`, `.env.local`, API 키, 토큰, 비밀값을 커밋하지 않는다.
- `node_modules`, `.venv`, `dist`, `.turbo`, 빌드 산출물, 캐시 파일을 커밋하지 않는다.
- 사용자가 요청하지 않은 대규모 리팩터링, 파일 이동, 포맷팅을 하지 않는다.
- 사용자가 요청하지 않은 외부 서비스 호출, 원격 push, 배포, Jira 상태 변경을 하지 않는다.
- 공개 브랜치에 force push하지 않는다.

## 상세 문서

- 공통 계약: `docs/contracts.md`
- Demo ID 기준: `docs/demo-standards.md`
- Git과 PR 규칙: `docs/git-rules.md`
- 로컬 우선 아키텍처: `docs/architecture/local-first-stack.md`
- 기술스택 버전: `docs/architecture/tech-stack-versions.md`
- 환경변수 규칙: `docs/conventions/environment.md`
- 로컬 개발 Runbook: `docs/runbooks/local-development.md`
- AWS 배포 기준: `docs/deployment.md`
- STT spike: `docs/spikes/on-device-stt.md`
