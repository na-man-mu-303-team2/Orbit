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
- File storage: 목적별 S3 3분리와 짧은 presigned URL을 사용한다.
  - `static-web`: CloudFront가 읽는 웹 빌드 결과
  - `project-assets`: 원본·참고자료·이미지와 `exports/` 결과물
  - `private-audio`: `raw/`와 `evidence/`를 저장하며 Versioning을 사용하지 않는다.
  - raw audio는 분석 terminal path에서 즉시 삭제를 시도하고, `raw/` Lifecycle 14일은 실패 안전망으로 사용한다.
  - Evidence Clip은 `evidence/`에 저장하고 14일 후 삭제한다.
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
- [ ] S3 목적별 접근 정책, Lifecycle, 서버 측 암호화 설정
- [ ] raw audio 삭제 정책 검증
- [ ] 청중 API에서 speaker notes/script가 노출되지 않는지 검증
- [ ] BullMQ와 ElastiCache Redis/Valkey 연결·TLS·network policy 검증
- [ ] staged BullMQ 처리와 `monolith` rollback 경로 smoke, queue/DB 잔여 상태 검증
