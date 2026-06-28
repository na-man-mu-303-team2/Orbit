# ORBIT official tech-stack references

This document is the CI-readable summary of the official technology references used by the Codex standard review workflow. It complements `docs/architecture/tech-stack-versions.md` and is derived from the project tech-stack official-docs research note.

## Review use

- Prefer repository contracts and local docs first: `AGENTS.md`, `docs/contracts.md`, `docs/architecture/local-first-stack.md`, `docs/architecture/tech-stack-versions.md`, and `docs/conventions/environment.md`.
- Use these official references to check whether code changes contradict documented framework, runtime, security, or deployment behavior.
- Do not treat this page as a dependency upgrade request. Lockfiles remain the source for exact installed versions.

## Core references

| Area | Technology | Official reference |
| --- | --- | --- |
| Runtime | Node.js | `https://nodejs.org/docs/latest/api/` |
| Package manager | pnpm | `https://pnpm.io/` |
| Monorepo | Turborepo | `https://turborepo.com/docs` |
| Language | TypeScript | `https://www.typescriptlang.org/docs/` |
| Web build | Vite | `https://vite.dev/guide/` |
| Web UI | React | `https://react.dev/` |
| Server state | TanStack Query | `https://tanstack.com/query/latest/docs/framework/react/overview` |
| Client state | Zustand | `https://zustand.docs.pmnd.rs/` |
| Canvas editor | Konva | `https://konvajs.org/docs/` |
| Realtime client/server | Socket.IO | `https://socket.io/docs/v4/` |
| Collaboration data | Yjs | `https://docs.yjs.dev/` |
| API framework | NestJS | `https://docs.nestjs.com/` |
| ORM | TypeORM | `https://typeorm.io/` |
| Runtime schema | Zod | `https://zod.dev/` |
| HTTP security headers | Helmet | `https://helmetjs.github.io/` |
| Password hashing | Argon2 | `https://www.rfc-editor.org/rfc/rfc9106.html` |
| Queue | BullMQ | `https://docs.bullmq.io/` |
| Python API | FastAPI | `https://fastapi.tiangolo.com/` |
| Python validation | Pydantic | `https://docs.pydantic.dev/latest/` |
| Python package runner | uv | `https://docs.astral.sh/uv/` |
| Python lint | Ruff | `https://docs.astral.sh/ruff/` |
| Python typecheck | mypy | `https://mypy.readthedocs.io/` |
| Python test | pytest | `https://docs.pytest.org/` |
| Database | PostgreSQL | `https://www.postgresql.org/docs/current/` |
| Vector extension | pgvector | `https://github.com/pgvector/pgvector` |
| Cache | Redis | `https://redis.io/docs/latest/` |
| Local object storage | MinIO | `https://docs.min.io/` |
| Containers | Docker | `https://docs.docker.com/` |
| Local orchestration | Docker Compose | `https://docs.docker.com/compose/` |
| E2E testing | Playwright | `https://playwright.dev/docs/intro` |
| GitHub automation | GitHub Actions | `https://docs.github.com/actions` |
| Issue tracking | Jira | `https://support.atlassian.com/jira/` |
| AI API | OpenAI API | `https://developers.openai.com/api/docs/` |
| Speech to text | Amazon Transcribe | `https://docs.aws.amazon.com/transcribe/` |
| OCR | Amazon Textract | `https://docs.aws.amazon.com/textract/` |
| AWS compute | ECS Fargate | `https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html` |
| AWS storage | S3 | `https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html` |
| AWS database | RDS PostgreSQL | `https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html` |
| AWS cache | ElastiCache | `https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html` |
| AWS queue | SQS | `https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html` |
| AWS secrets | Secrets Manager | `https://docs.aws.amazon.com/secretsmanager/` |

## ORBIT-specific review reminders

- Deck JSON source of truth is the shared schema and `docs/contracts.md`, not Konva state.
- API request/response, Job, WebSocket, File, Project, and Deck contracts should be validated through `packages/shared`.
- DB changes must use TypeORM migrations.
- Storage, queue, AI, STT, and OCR should stay behind the documented adapter/provider boundaries.
- Local infra uses Docker Compose, PostgreSQL plus pgvector, Redis, and MinIO; production target is ECS Fargate plus AWS managed services.
- `.env`, `.env.local`, API keys, tokens, and secret values must never be committed or printed.
