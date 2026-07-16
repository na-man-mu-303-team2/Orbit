# AI PPT staged BullMQ 운영 확정 및 SQS 도입 취소 기록

**최초 작성일**: 2026-07-14
**결정 변경일**: 2026-07-16
**상태**: SQS 계획 취소 · staged BullMQ 운영 확정
**관련 이슈**: [#338](https://github.com/na-man-mu-303-team2/Orbit/issues/338)
**닫힌 PR**: [#397](https://github.com/na-man-mu-303-team2/Orbit/pull/397) — 미병합

> 이 문서는 기존 SQS 전환 계획을 대체한다. 2026-07-16 팀 회의 결정에 따라 SQS transport와 AWS queue 인프라는 도입하지 않는다. 이 파일의 이전 내용과 #338의 과거 SQS 확정 댓글은 현재 실행 기준으로 사용하지 않는다.

## 1. 최종 결정

- #338-0부터 #338-3까지 병합된 stage Job, checkpoint, 부분 재시도, OCR/image fan-out과 quality/publication 구조는 유지한다.
- AI PPT stage transport의 최종 기준은 BullMQ다.
- `AI_DECK_EXECUTION_MODE=bullmq`는 staged pipeline의 기본 실행 경로다.
- `AI_DECK_EXECUTION_MODE=monolith`는 회귀 검증과 운영 rollback을 위한 호환 경로로 유지하며 제거하지 않는다.
- `AI_DECK_EXECUTION_MODE=sqs`는 지원하지 않는다. API와 Worker는 이 값을 startup에서 즉시 거부한다.
- #338-4 SQS transport adapter와 #338-5 monolith 제거·AWS 인프라 인계는 취소한다.
- 실제 SQS/DLQ, queue별 IAM, SQS 기반 ECS service, autoscaling, CloudWatch alarm과 production SQS cutover는 만들거나 수행하지 않는다.

## 2. 유지되는 #338 결과물

### 338-0: stage 계약과 persistence

- 공개 부모 `ai-deck-generation` Job과 내부 `ai_deck_generation_stages` checkpoint를 분리한다.
- stage별 결정적 identity, lease, attempt, artifact locator와 durable dispatch 계약을 유지한다.
- 공개 Job 상태는 `queued`, `running`, `succeeded`, `failed`만 사용한다.

### 338-1: staged BullMQ coordinator와 OCR

- ID-only coordinator와 파일별 `reference-extract-file` checkpoint를 유지한다.
- OCR shard별 재시도와 reference policy join으로 한 파일의 실패가 전체 OCR을 처음부터 반복하지 않게 한다.
- standalone reference extraction API의 공개 계약은 유지한다.

### 338-2: Python planning stage

- `source-grounding`, `content-planning`, `design-planning`, `layout-compile`을 독립 stage로 실행한다.
- `WEB_RESEARCH_QUALITY_FAILED`는 usable grounding 또는 사용자 입력이 있으면 warning 기반 degraded success로 처리한다.
- strict policy에서 usable grounding이 전혀 없으면 `SOURCE_GROUNDING_REQUIRED` terminal failure로 처리한다.
- #341의 Art Director `backgroundMode` 정규화와 `ART_DIRECTOR_INVALID_RESPONSE` terminal 계약을 유지한다.

### 338-3: image, quality와 publication

- slide별 `image-slide` fan-out과 checkpoint join을 유지한다.
- `semantic-quality`, `rendered-visual-quality`, `publication`을 독립 stage로 실행한다.
- optional image no-media fallback, Visual QA warning/terminal 구분과 `failedStage` 기반 부분 재시도를 유지한다.
- publication은 execution artifact, checkpoint, Deck upsert와 부모 Job 성공을 한 transaction으로 commit한다.

## 3. 최종 실행 모드와 queue 계약

| 설정 | 최종 계약 |
| --- | --- |
| `AI_DECK_EXECUTION_MODE=bullmq` | staged AI PPT pipeline을 실행하는 기본 transport |
| `AI_DECK_EXECUTION_MODE=monolith` | 기존 full-deck handler를 사용하는 호환·회귀·rollback 경로 |
| `AI_DECK_EXECUTION_MODE=sqs` | 미지원. API와 Worker startup에서 fail-fast |
| `JOB_QUEUE_DRIVER=bullmq` | AI PPT를 포함한 Job queue의 유지되는 전역 driver |

BullMQ staged message는 strict `{ pipelineJobId, projectId, stage, shardKey }`를 사용한다. binary, base64, 전체 Deck, provider raw response와 credential은 message에 넣지 않는다. `opts.jobId`는 `${pipelineJobId}:${stage}:${shardKey}`로 결정적으로 생성하고, 중복 delivery와 crash 복구는 DB checkpoint 상태 전이와 artifact identity로 수렴시킨다.

Worker role은 `all`, `reference-extract`, `research-content`, `design-layout`, `image`, `qa-finalize`를 유지한다. dedicated role도 BullMQ queue만 소비한다.

## 4. 운영 기준

- 로컬 기본값과 `.env.example`은 `bullmq`를 유지한다.
- staging·production 예제의 명시적 `monolith` 값은 유지한다.
- staging 또는 production을 `bullmq`로 전환하려면 별도로 승인된 배포 계획과 smoke, queue/DB 잔여 상태 검증을 거친다.
- `develop` merge의 personal staging 자동 배포 규칙은 변경하지 않는다.
- SQS 관련 환경변수, SDK 의존성, queue resource와 운영 runbook은 추가하지 않는다.

## 5. 취소된 단계

### 338-4: SQS transport adapter — 취소

- `@aws-sdk/client-sqs` adapter를 도입하지 않는다.
- SQS queue URL 환경변수를 추가하지 않는다.
- SQS send, receive, delete, visibility extension과 BullMQ/SQS parity test를 완료 조건으로 사용하지 않는다.
- PR #397은 미병합 상태로 닫혔으며 결과물에 포함하지 않는다.

### 338-5: monolith 제거와 AWS 인프라 인계 — 취소

- `monolith` handler와 실행 모드를 제거하지 않는다.
- SQS/DLQ, IAM, SQS consumer ECS, queue-depth autoscaling과 CloudWatch SQS 지표를 후속 작업으로 인계하지 않는다.
- SQS production cutover는 계획하지 않는다.

## 6. #338 최종 완료 조건

1. #338-0부터 #338-3까지의 migration, schema와 contract test가 유지된다.
2. staged BullMQ에서 파일별 OCR, planning stage, slide별 image, quality와 publication이 독립 checkpoint로 실행된다.
3. 중간 stage 실패 시 실패 stage 또는 shard만 재실행하고 성공한 upstream checkpoint와 provider 결과를 재사용한다.
4. 동일 BullMQ Job의 중복 처리와 crash 복구가 중복 checkpoint, image object 또는 Deck publication을 만들지 않는다.
5. web research, Art Director, optional image와 Visual QA의 degraded/terminal 정책이 `docs/contracts.md`와 shared/Worker/Python test에 일치한다.
6. `/ai/generate-deck` request/response와 최종 Deck schema, 공개 부모 Job 상태 계약이 유지된다.
7. `AI_DECK_EXECUTION_MODE=bullmq`와 `monolith`가 지원되고 `sqs`는 startup에서 거부된다.
8. `monolith`는 호환·회귀·rollback 경로로 남고 staged BullMQ는 최종 stage transport로 유지된다.
9. 실제 AWS SQS 인프라나 SQS parity는 #338 완료 조건에 포함하지 않는다.
10. shared, API, Worker, Python contract와 통합 회귀 테스트가 통과한다.

## 7. 명시적으로 대체된 이전 결정

다음 이전 결정은 2026-07-16 회의 결정으로 대체되었다.

- BullMQ와 SQS가 공통 stage message를 사용한다는 목표
- 다섯 SQS queue group과 queue별 DLQ를 생성한다는 목표
- `AI_DECK_EXECUTION_MODE=sqs`를 활성화한다는 목표
- SQS queue별 ECS service와 autoscaling을 구성한다는 목표
- SQS parity 이후 `monolith`를 제거한다는 목표

stage Job, checkpoint, 부분 재시도와 fan-out/join은 transport와 독립적인 개선이므로 대체되지 않는다.
