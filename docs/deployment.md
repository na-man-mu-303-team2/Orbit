# AWS ECS Fargate 전환 기준

## 배포 목표

운영 배포는 ECS Fargate를 기준으로 한다. Kubernetes/EKS는 현재 범위에서 제외한다.

## 서비스 분리

- `web`: S3 Static Web + CloudFront
- `api`: ECS Fargate service, ALB 뒤에 배치
- `worker`: ECS Fargate worker service
- `python-worker`: ECS Fargate worker service 또는 내부 service

## Managed service 매핑

- DB: RDS PostgreSQL + pgvector
- Cache/session/realtime adapter: ElastiCache Redis/Valkey
- Queue: BullMQ + ElastiCache Redis/Valkey
- Static web: 전용 S3 bucket + CloudFront
- Project assets와 export: 전용 private S3 bucket, presigned URL
- Raw audio와 Evidence Clip: 별도 private S3 bucket. `raw/`는 terminal path 즉시 삭제를 기본으로 하고 14일 lifecycle을 안전망으로 사용하며, `evidence/`는 계약대로 7일 후 만료한다.
- Live STT: browser on-device STT, no managed cloud STT service
- Rehearsal/coaching STT: OpenAI STT/API via `python-worker`
- OCR: Amazon Textract
- Secrets: AWS Secrets Manager
- Logs/alarms: CloudWatch. 서버 컨테이너는 stdout JSON 로그를 출력하고 `LOG_PRETTY=false`를 유지한다.

## 체크리스트

- [ ] staging/prod 환경변수 분리
- [ ] migration runbook 작성
- [ ] rollback 절차 작성
- [ ] ALB WebSocket idle timeout 설정
- [ ] Assets와 private audio bucket 분리, public access block, encryption, CORS 설정 검증
- [ ] Private audio의 `raw/` 14일 안전망과 `evidence/` 7일 lifecycle policy 검증
- [ ] raw audio 삭제 정책 검증
- [ ] 청중 API에서 speaker notes/script가 노출되지 않는지 검증
- [ ] BullMQ와 ElastiCache Redis/Valkey 연결·TLS·network policy 검증
- [ ] staged BullMQ 처리와 `monolith` rollback 경로 smoke, queue/DB 잔여 상태 검증
