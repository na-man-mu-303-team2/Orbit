# AI PPT #341 → #339 → #338 통합 실행 계획

**작성일**: 2026-07-14

**상태**: 확정 · #341 완료 · #339 PR 8 코드·자동 배포 검증 완료 · 배포 후 서버 HEAD·queue/DB·smoke 증거 대기

**관련 이슈**: [#341](https://github.com/na-man-mu-303-team2/Orbit/issues/341) → [#339](https://github.com/na-man-mu-303-team2/Orbit/issues/339) → [#338](https://github.com/na-man-mu-303-team2/Orbit/issues/338)

**세부 계획**:

- `docs/plans/art-director-background-mode-normalization.md`
- `docs/plans/generate-deck-separation-before-issue-338.md`
- `docs/plans/ai-ppt-sqs-pipeline-refactoring.md`

## 1. 목표와 실행 게이트

세 이슈를 다음 순서로 완료한다.

```mermaid
flowchart LR
    A["계획·이슈 동기화"] --> B["#341<br/>Art Director 정규화"]
    B --> C["#339<br/>레거시 제거·stage 경계 분리"]
    C --> D["#338<br/>checkpoint·부분 재시도·queue adapter"]
    D --> E["후속 인프라 이슈<br/>SQS·ECS·CloudWatch 실제 전환"]
```

구현 착수 전:

- 현재 세 계획 문서에 아래 확정사항을 반영하고 상태를 `확정 · 실행 전`으로 변경한다.
- GitHub 인증을 복구한 뒤 #341·#339·#338에 각 최신 계획 전문을 댓글로 남긴다. 기존 댓글은 기준으로 사용하지 않는다.
- 계획 문서의 Git 추적이 완료된 뒤 작업을 시작한다.
- 각 PR은 최신 `develop`에서 별도 브랜치로 시작하며, 선행 PR 병합 전 다음 의존 PR을 병합하지 않는다.

## 2. PR 실행 순서

### #341 — Art Director 정규화

| PR | 작업 | 종료 조건 |
| --- | --- | --- |
| `fix/art-director-background-normalization` | provider JSON을 `json.loads()`로 파싱하고 `slides[].backgroundMode`에서 `backgroundSequence`를 덮어쓴 뒤 Pydantic 검증한다. 불일치는 재호출하지 않고 enum/count/order/JSON 오류만 1회 내부 재시도한다. 오류 원문은 안전한 메시지로 치환하고 `docs/contracts.md`에 canonical 규칙을 추가한다. | mismatch가 첫 호출에서 복구되고 Python·Worker·Web 회귀 테스트가 통과한다. |

### #339 — 활성 경로 정리와 모듈 분리

| 순서 | PR 목표 | 핵심 결정 |
| --- | --- | --- |
| 339-0 | 현재 제품 경로 고정 | #341 수정 이후 `/createdeck → generate-deck → program-v2` 결과와 OCR·이미지·QA·publication 순서를 deterministic fixture로 고정한다. |
| 339-1 | 에디터 PPTX import 전환 | `/pptx-imports` 대신 `/pptx-ooxml-generations`에 `{ fileId }`만 전달한다. 구형 consumer는 아직 유지한다. |
| 339-2 | OOXML sync·export 완성 | imported Deck의 PUT과 patch 저장 모두 sync를 enqueue한다. `deckId` 기반 PostgreSQL advisory lock으로 sync를 직렬화하고 높은 `ooxmlSyncedDeckVersion`만 조건부 반영한다. export는 최신 sync가 아니면 retry하고, 최신 `currentPackageFileId`를 별도 export asset으로 복사한다. |
| 339-3 | 레거시 producer 중단 | `/pptx-imports`, `/mockup/ai-ppt`, 구형 HomePage·`GenerateDeckView`, `ai-template-deck-generation` 신규 enqueue를 중단한다. 기존 consumer는 drain을 위해 유지한다. |
| 339-4 | 레거시 제거와 배포 후 잔여 확인 | API·consumer·queue 등록·active schema 제거와 personal staging 자동 배포는 완료됐다. #339 종료 전 배포 환경의 두 legacy queue에서 `waiting`, `paused`, `delayed`, `prioritized`, `waiting-children`, `active`, `repeat`가 모두 0이고 관련 DB Job의 queued/running이 0인지 읽기 전용으로 확인한다. 사전 drain을 수행했다고 소급해서 기록하지 않으며 `historicalJobTypeSchema`는 과거 row 조회를 위해 유지한다. |
| 339-5 | OOXML 순수 변환 계약 | `PptxOoxmlGenerationRequest`를 strict `{ fileId }`로 축소하고 AI slot 생성, OpenAI 입력, apply-slot-text route를 제거한다. TemplateBlueprint mapping은 유지한다. |
| 339-6 | GenerateDeck `program-v2` 전용화 | public request에서 `generationMode`, `design.engineVersion`, recipe-v1 전용 `design.slidePresetId`, `designReferences`, `templateBlueprintId`를 제거하고 TypeScript/Python root·nested extra field를 거부한다. 호환 shim은 두지 않으며 `layoutVariant`, `slotPreset`, slide-preset registry/selector도 제거한다. 기존 Deck의 `metadata.createdFrom.designReferences` parsing과 PPTX용 `templateBlueprintSchema`, `templateBlueprintIdSchema`, `template_blueprints`, OOXML generation/sync/export mapping은 유지하되 일반 AI generation에서는 참조하지 않는다. |
| 339-7A | Python generation core 분리 | `deck_generation/` 아래 `models`, `source_grounding`, `content_planning`, `design_planning`, `layout_compiler`, `visual_requirements`, `quality`, `diagnostics`, `pipeline`으로 이동한다. 하위 stage는 상세 계획의 순환 없는 upstream helper DAG와 `models.py` DTO를 따르며 동기식 `pipeline.py`만 stage entrypoint 순서를 조립한다. #341 정규화는 기존 `design_program.py` 구현을 재사용해 design stage가 보장하고 공개 `/ai/generate-deck` 계약과 실패 정책은 바꾸지 않는다. |
| 339-7B | Worker 후처리 분리 | asset resolution, semantic quality, rendered visual quality, publication을 모듈로 추출하고 processor에는 payload 검증과 Job lifecycle만 남긴다. 동작과 실패 정책은 아직 변경하지 않는다. |
| 339-8 | #338 readiness 검증 | 전체 생성·PPTX round-trip·historical Job·reference extraction 회귀 행렬과 personal staging 자동 배포를 통과시키고, 실제 배포 서버 HEAD, 339-4 legacy queue/DB 및 339-6 `generate-deck` queue/DB의 배포 후 잔여 상태 0, GenerateDeck smoke 성공을 기록한 뒤 #339를 종료한다. |

PR 8의 로컬·required 자동 CI·personal staging 자동 배포 증거와 미확보된 실제 배포 서버 HEAD·배포 후 queue/DB·GenerateDeck smoke 증거는 `docs/plans/generate-deck-separation-before-issue-338.md`의 PR 8 및 readiness checklist를 단일 기준으로 사용한다. 이 증거가 모두 확보되기 전에는 #339를 열린 상태로 유지하고 #338 구현을 시작하지 않는다.

### #338 — stage Job, checkpoint와 queue adapter

| 순서 | PR 목표 | 핵심 결정 |
| --- | --- | --- |
| 338-0 | stage 계약과 persistence | shared stage/message schema, optional `Job.error.failedStage`, `retryable`, diagnostics warning code를 추가한다. `ai_deck_generation_stages` migration과 checkpoint repository를 구현한다. |
| 338-1 | staged BullMQ coordinator와 OCR | 기존 monolith를 기본값으로 둔 채 staged BullMQ 경로를 추가한다. 파일별 OCR fan-out, source join, durable dispatch와 stage-only retry를 구현한다. |
| 338-2 | Python planning stage 연결 | `source-grounding`, `content-planning`, `design-planning`, `layout-compile`을 독립 실행한다. research 실패 정책은 새 계약으로 변경하고 #341의 Art Director 정규화·terminal 정책은 보존하며 `docs/contracts.md`와 shared contract test를 갱신한다. |
| 338-3 | image·QA·publication 연결 | slide별 image fan-out, semantic quality, rendered visual quality, publication을 연결한다. 로컬 기본 실행을 staged BullMQ로 전환하고 Visual QA unavailable 정책은 새 계약으로 변경하되, #339에서 고정한 optional image no-media fallback과 advisory Visual QA acceptance는 stage 경계에서도 보존한다. |
| 338-4 | SQS transport adapter | `@aws-sdk/client-sqs`를 이용해 동일 stage message의 send/receive/delete/visibility 연장을 구현한다. 다른 Job은 계속 `JOB_QUEUE_DRIVER=bullmq`를 사용한다. |
| 338-5 | monolith 제거와 인계 | staged BullMQ 전체 회귀와 SQS adapter parity test를 통과한 뒤 Worker의 기존 장기 `generate-deck` handler와 `monolith` 실행 모드를 제거한다. 실제 AWS 리소스 전환은 후속 인프라 이슈로 인계한다. |

## 3. 확정 계약과 실패 정책

### Stage와 checkpoint

- 내부 message는 `{ pipelineJobId, projectId, stage, shardKey }`만 전달한다. binary, base64, 전체 Deck, provider 원문은 넣지 않는다.
- stage는 `reference-extract-file`, `source-grounding`, `content-planning`, `design-planning`, `layout-compile`, `image-slide`, `semantic-quality`, `rendered-visual-quality`, `publication`으로 고정한다.
- `shard_key`는 `NOT NULL DEFAULT ''`이며 `(pipeline_job_id, stage, shard_key)`를 UNIQUE로 둔다.
- 별도 join stage는 만들지 않는다. 마지막 OCR/image child가 종료될 때 전체 expected shard 상태를 트랜잭션으로 확인하고 다음 stage checkpoint를 `ON CONFLICT DO NOTHING`으로 생성한다.
- queued checkpoint 자체를 durable dispatch record로 사용한다. 전송 성공 후 `dispatched_at`을 기록하며, dispatcher가 미전송 queued row를 재전송한다.
- provider 호출은 crash 경계에서 재실행될 수 있으므로 exactly-once를 보장한다고 표현하지 않는다. 대신 checkpoint, 결정적 image object key와 publication 조건부 upsert로 중복 저장을 막는다.
- claim 시 `attempt`를 증가시키고 transient failure는 최대 5회 재시도한다. DB lease는 10분, heartbeat는 60초, SQS visibility 연장은 5분 단위로 유지한다.
- expired lease는 reconciler가 queued로 되돌리며 최대 시도 초과 시 checkpoint와 부모 Job을 함께 `failed`로 종료한다.
- 실패 Job 재시도 API는 기록된 `failedStage`부터 시작하고 upstream 성공 checkpoint는 보존한다. OCR/image shard 실패는 해당 shard만 초기화하며 downstream checkpoint만 무효화한다.

### 공개 및 shared 계약

- `/createdeck`, 공개 `/ai/generate-deck`, 최종 Deck schema와 부모 Job 상태 네 가지는 유지한다.
- `generateDeckResponse.warnings: string[]`는 사용자 메시지로 유지하고 `diagnostics.warningCodes`를 machine-readable code 배열로 추가한다.
- `visualQaStatus`에 `unavailable`을 추가한다.
- `Job.error`에는 optional `failedStage`와 `retryable`을 추가해 기존 Job row parsing을 깨뜨리지 않는다.
- AI PPT 전용 설정은 `AI_DECK_EXECUTION_MODE=monolith|bullmq|sqs`로 시작하고 338-5에서 `bullmq|sqs`만 남긴다.
- `AI_DECK_WORKER_QUEUE=all|reference-extract|research-content|design-layout|image|qa-finalize`를 사용한다. 로컬은 `all`, AWS ECS는 queue별 값을 사용한다.
- SQS mode에서만 다섯 queue URL을 필수 검증한다. 전역 `JOB_QUEUE_DRIVER`는 다른 Job을 위해 `bullmq`로 유지한다.

### 최종 실패 정책

- `backgroundSequence` 불일치: `slides[].backgroundMode` 기준으로 즉시 복구하며 stage retry에 포함하지 않는다.
- `ART_DIRECTOR_INVALID_RESPONSE`: enum/count/order/JSON 오류가 내부 재시도 후 남으면 terminal.
- `WEB_RESEARCH_QUALITY_FAILED`: usable grounding 또는 사용자 입력이 있으면 warning/degraded success.
- `SOURCE_GROUNDING_REQUIRED`: strict policy에서 usable grounding이 전혀 없으면 terminal.
- `GENERATE_DECK_VISUAL_QA_UNAVAILABLE`: semantic/deterministic validation에 blocking issue와 unresolved placeholder가 모두 없으면 warning과 함께 publication.
- rendered Visual QA advisory: 남은 issue가 `BALANCE_WEAK`, `LAYOUT_REPETITIVE`, `BACKGROUND_RHYTHM_FLAT`, `CARD_OVERUSED`로만 구성되고 영향 slide 수가 `max(1, floor(slideCount * 0.2))` 이하면 현재 #339 baseline처럼 warning과 함께 publication.
- `GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED`: 실제 visual blocking issue가 bounded repair 후에도 남으면 terminal.
- optional image 실패: 현재 #339 baseline처럼 no-media composition으로 결정론적으로 전환되고 blocking issue와 placeholder가 남지 않을 때만 degraded success. required asset 실패는 기존 quality gate terminal로 유지하고, optional no-media fallback request 실패만 `GENERATE_DECK_OPTIONAL_IMAGE_FALLBACK_FAILED` terminal로 분리하며 #338 stage 전환에서도 이 경계를 보존한다.
- V12의 반대되는 research·Visual QA unavailable 정책은 #338이 대체하며, optional image fallback과 advisory Visual QA acceptance는 #339 baseline을 보존한다. V12 자체는 과거 품질 승인 fixture만 보존한다.

## 4. 검증과 완료 기준

각 PR은 targeted test를 실행하고, 이슈 종료 PR에서 전체 검증을 실행한다.

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/web test
pnpm --filter @orbit/api test
pnpm --filter @orbit/worker test
pnpm test:coaching:migrations
pnpm test:coaching:integration
pnpm build
pnpm lint
node infra/scripts/check-env.mjs
docker compose config --quiet

cd services/python-worker
uv sync --locked
uv run ruff check .
uv run mypy app
uv run pytest
```

추가 필수 시나리오:

- #341 mismatch fixture가 provider 한 번만 호출하고 최종 Deck snapshot까지 일치한다.
- PPTX import → PUT/patch 편집 → sync → export → 재-import에서 최신 writable 요소가 유지된다.
- 레거시 consumer 제거와 personal staging 자동 배포는 완료됐다. #339 종료 전 실제 배포 서버 HEAD와 배포 환경의 legacy queue/DB 잔여 상태를 읽기 전용으로 확인하고, 사전 drain을 수행했다고 소급 주장하지 않으며 과거 Job row는 계속 조회한다.
- 339-6 계약은 `develop` merge 시 기존 personal staging workflow가 run 실행 시점의 최신 `develop` HEAD를 서버에 동기화한 뒤 그 HEAD에서 Web/API/Worker/Python worker 이미지를 빌드·교체하고 health check를 통과하는 방식으로 자동 배포한다. workflow trigger SHA와 서버의 실제 `git rev-parse HEAD`를 구분하고, workflow를 중단하거나 required reviewer를 추가하지 않으며, 배포 후 `generate-deck` queue/DB의 stuck Job이 0인지 확인한 다음 GenerateDeck smoke를 통과시킨다. production cutover는 별도 승인된 계획으로 다룬다.
- duplicate stage message, enqueue 직후 crash, provider 완료 직후 crash, lease 만료를 각각 재현한다.
- OCR 하나 또는 image 하나의 실패가 다른 shard와 이전 stage를 재실행하지 않는다.
- queue message에 bytes/base64가 없고 결정적 asset key와 publication upsert가 중복 결과를 막는다.
- research, Art Director, optional image, Visual QA의 degraded/terminal 경계를 shared·Worker·Web contract test로 고정한다.
- BullMQ와 mocked SQS adapter가 같은 message schema, checkpoint 상태 전이와 retry 결과를 만든다.
- migration은 `run → 검증 → revert → run`을 통과한다.

## 5. 운영 인계와 명시적 전제

- #338 범위는 application stage pipeline, BullMQ 실행, SQS adapter와 환경 계약까지다.
- 실제 다섯 SQS/DLQ, IAM, ECS service, autoscaling, CloudWatch alarm과 production cutover는 별도 인프라 이슈로 분리한다. 이 범위 변경을 #338 계획과 GitHub 댓글에 함께 반영한다.
- 후속 인프라 이슈가 완료되기 전 production의 `AI_DECK_EXECUTION_MODE=sqs`는 활성화하지 않는다.
- 외부 AWS 리소스 생성·배포·GitHub 원격 변경은 별도 사용자 승인 후 수행한다.
- `develop` merge의 personal staging 자동 배포는 팀의 고정 규칙이며 #339 때문에 workflow를 변경·중단하거나 required reviewer를 추가하지 않는다. #339 운영 증거는 자동 배포 성공, 서버의 실제 `git rev-parse HEAD`, 배포 후 읽기 전용 health·queue·DB 확인과 GenerateDeck smoke로 수집하고 workflow trigger SHA와 실제 서버 HEAD를 구분한다. production의 breaking cutover는 별도 승인된 배포 계획에서 ingress, drain, 동시 교체와 cache invalidation을 다룬다.
- #341 완료 전 #339 baseline을 만들지 않고, #339 readiness 완료 전 #338 persistence 작업을 병합하지 않는다.
