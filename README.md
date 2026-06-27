# ORBIT

ORBIT은 발표자료 생성, 편집, 협업 발표, 리허설, 청중 참여를 하나의 흐름으로 연결하는 로컬 우선 모노레포입니다.

## 기술스택

- Monorepo: pnpm workspace, Turborepo
- Web: Vite, React, TypeScript, TanStack Query, Zustand, Konva, Socket.IO client, Yjs
- API: NestJS, TypeScript, TypeORM, PostgreSQL, Socket.IO, Zod
- Worker: NestJS Worker, BullMQ/Redis adapter 기준
- Python worker: FastAPI, Python 3.12, uv
- Local infra: Docker Compose, PostgreSQL + pgvector, Redis, MinIO
- Production target: AWS ECS Fargate, RDS PostgreSQL, ElastiCache, S3, SQS, Transcribe, Textract

주요 버전:

| 영역 | 기술 | 버전 기준 |
| --- | --- | --- |
| Runtime | Node.js | `node:24-alpine` |
| Runtime | Python | `python:3.12-slim` |
| Package manager | pnpm | `10.12.4` |
| Web | React | `^19.1.0` |
| Web | Vite | `^7.0.0` |
| API/Worker | NestJS | `^11.1.3` |
| DB | PostgreSQL + pgvector | `pgvector/pgvector:pg16` |
| Cache | Redis | `redis:7-alpine` |
| Storage | MinIO | `RELEASE.2025-04-22T22-12-26Z` |

상세 버전표는 [docs/architecture/tech-stack-versions.md](docs/architecture/tech-stack-versions.md)를 기준으로 합니다.

## 빠른 시작

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
cp .env.example .env.local
pnpm build
docker compose up --build
```

로컬 주소:

- Web: http://localhost:5173
- API health: http://localhost:3000/health
- API Swagger: http://localhost:3000/docs
- Python worker health: http://localhost:8000/health
- MinIO console: http://localhost:9001

## 주요 명령

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm db:migration:run
pnpm db:migration:revert
pnpm py:sync
pnpm py:test
```

## 구조

```txt
apps/
  web/              # Vite React client
  api/              # NestJS REST API + Socket.IO gateway
  worker/           # NestJS background worker
services/
  python-worker/    # FastAPI worker
packages/
  shared/           # Zod schemas and shared contracts
  editor-core/      # Deck scene JSON domain helpers
  storage/          # MinIO/S3 storage port
  job-queue/        # BullMQ/SQS job queue port
  ai/               # LLM/STT/OCR provider interfaces
  realtime/         # Socket.IO event helpers
  config/           # Environment validation
infra/
  docker/           # Local service Dockerfiles
  scripts/          # Smoke/config scripts
docs/
  architecture/
  conventions/
  runbooks/
  spikes/
```

## 1차 스프린트 기준

1차 스프린트에서는 회원가입, 로그인, 초대 링크를 제외하고 고정 Demo ID로 E2E를 연결합니다. 공통 계약은 [docs/contracts.md](docs/contracts.md), Demo ID 기준은 [docs/demo-standards.md](docs/demo-standards.md)를 따릅니다.
