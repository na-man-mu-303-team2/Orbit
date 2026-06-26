# ORBIT 로컬 우선 아키텍처

## 방향

ORBIT은 전체 Jira 이슈 구현을 전제로 `docker compose up --build` 한 번으로 Web, API, Worker, Python worker, PostgreSQL, Redis, MinIO를 실행할 수 있게 구성한다.

운영 기준은 Kubernetes가 아니라 AWS ECS Fargate와 managed service다.

## 로컬 서비스

| 서비스 | 역할 | 로컬 포트 |
| --- | --- | --- |
| web | Vite React UI | 5173 |
| api | NestJS REST API, Socket.IO gateway | 3000 |
| worker | NestJS background worker | - |
| python-worker | FastAPI document/STT/AI helper | 8000 |
| postgres | PostgreSQL + pgvector | 5432 |
| redis | cache, BullMQ backend | 6379 |
| minio | S3 호환 파일 저장소 | 9000, 9001 |

## 운영 매핑

| 로컬 | 운영 |
| --- | --- |
| PostgreSQL + pgvector | RDS PostgreSQL + pgvector |
| Redis | ElastiCache Redis/Valkey |
| BullMQ + Redis | SQS adapter |
| MinIO | S3 |
| FastAPI worker | ECS Fargate worker |
| Socket.IO | ALB + ECS + Redis adapter |
| `.env` | AWS Secrets Manager |

## 확장 원칙

- API request/response, Job, WebSocket payload는 `packages/shared`의 Zod schema를 우선한다.
- 저장소는 `StoragePort`, 큐는 `JobQueuePort`, AI/STT/OCR은 provider interface 뒤에 둔다.
- DB 변경은 TypeORM migration으로만 반영한다.
- STT/OCR/LLM 결과는 shared schema 검증 후 저장한다.
- 발표자 script와 raw audio는 청중 API로 노출하지 않는다.

