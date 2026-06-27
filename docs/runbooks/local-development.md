# 로컬 개발 Runbook

## 전체 실행

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
cp .env.example .env.local
docker compose up --build
```

## DB migration

```bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
```

## Python worker

```bash
cd services/python-worker
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
uv run pytest
```

## 헬스체크

```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
docker compose ps
```

## 자주 보는 포인트

- `pnpm build`: workspace package가 먼저 빌드되는지 확인
- `pnpm db:migration:run`: pgvector extension과 초기 테이블 생성 확인
- `docker compose config`: Compose 문법 확인
- API Swagger: http://localhost:3000/docs
