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
- Queue: SQS
- File storage: S3 private bucket, presigned URL
- Live STT: browser on-device STT, no managed cloud STT service
- Rehearsal/coaching STT: OpenAI STT/API via `python-worker`
- OCR: Amazon Textract
- Secrets: AWS Secrets Manager
- Logs/alarms: CloudWatch

## 체크리스트

- [ ] staging/prod 환경변수 분리
- [ ] migration runbook 작성
- [ ] rollback 절차 작성
- [ ] ALB WebSocket idle timeout 설정
- [ ] S3 lifecycle policy와 KMS encryption 설정
- [ ] raw audio 삭제 정책 검증
- [ ] 청중 API에서 speaker notes/script가 노출되지 않는지 검증
- [ ] SQS adapter와 BullMQ adapter 계약 일치 확인
