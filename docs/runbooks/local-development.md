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
corepack pnpm db:migration:run
docker compose exec postgres psql -U orbit -d orbit -c "\dt migration_command_checks"
docker compose exec postgres psql -U orbit -d orbit -c "select extname from pg_extension where extname = 'vector';"
corepack pnpm db:migration:revert
docker compose exec postgres psql -U orbit -d orbit -c "select to_regclass('public.migration_command_checks');"
```

예상 결과:

- `migration:run` 후 `migration_command_checks` 테이블이 보인다.
- `pg_extension` 조회에서 `vector`가 보인다.
- `migration:revert` 후 `to_regclass` 결과가 비어 있다.

패키지 직접 실행:

```bash
corepack pnpm --filter api migration:run
corepack pnpm --filter api migration:revert
corepack pnpm --filter api migration:generate -- src/database/migrations/NextMigration
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
- `corepack pnpm db:migration:run`: pgvector extension과 sample migration table 생성 확인
- `docker compose config`: Compose 문법 확인
- API Swagger: http://localhost:3000/docs
