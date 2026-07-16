# 김동현 P0 음성 측정·Evidence 구현 계획

> 상태: 구현 검토 준비
> 작성일: 2026-07-13
> 분석 기준: `HEAD@3e0b21de`, `origin/develop@76ebe42b`
> 요구 문서: `docs/Orbit-업무분담.md`, `docs/specs/rehearsal-speech-evidence-dto-contract.md`
> 최종 목표 계약: `docs/specs/rehearsal-speech-evidence-dto-contract.md`
> 현재 전환 대상: `packages/shared`, `docs/contracts.md`, 기존 DB schema와 런타임 DTO

## 1. 목적과 범위

이 문서는 김동현 담당 P0 범위 가운데 현재 코드에 없거나 일부만 구현된 기능을 실제 브랜치와 PR 단위로 구현하기 위한 계획이다. 범위는 Report STT 이후의 TypeScript↔Python DTO, duration·CPM·WPM, STT Quality Gate, 말버릇, pause v1·v2, slide timing 원천값, 음성 `ReportObservation` 원천값, 최대 12초 Evidence Audio Clip 생성·보관·삭제다.

다음은 이 계획에서 제외한다.

- 집중 연습과 Q&A 판정
- 공통 평가기의 통과·부분·실패 판정과 Top 3 정렬
- Owner-only Evidence API와 Player UI
- 보고서 UI와 추세 UI 조립
- P1 언어 구조·낭독·음량·억양·발음 분석, Editor Clip 접근, 30일 보관

## 2. 확정된 전환 결정

이 계획의 최종 계약 원본은 `docs/specs/rehearsal-speech-evidence-dto-contract.md`다. 현재 shared schema, DB schema, worker DTO는 배포 중 호환을 위한 임시 표면으로만 취급하며, 아래 순서로 점진 전환한다.

| 영역              | 확정 결정                                                          | 구현 원칙                                                                                                                           |
| ----------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 실제 녹음 시간    | `recordingDurationSeconds`를 Run meta의 canonical transport로 사용 | audio-complete 전에 저장하고 worker 분석 요청까지 전달한다. 값이 없을 때만 provider/segment fallback을 사용한다.                    |
| Clip 절단         | Worker의 `ffmpeg` runtime 사용                                     | raw audio를 메모리로 읽어 stdin에 전달하고, URL·storage key를 command 인자나 로그에 넣지 않는다.                                    |
| Clip 포맷         | AAC-LC 기반 M4A, MIME `audio/mp4`                                  | stdout pipe가 가능하도록 fragmented MP4 옵션을 고정하고 schema·object metadata·재생 응답을 같은 MIME으로 맞춘다.                    |
| Clip private file | 별도 `private_audio_assets` 테이블과 `fileId` 사용                 | generic file API와 `project_assets`에서 완전히 분리하고 URL을 영속화하지 않는다.                                                    |
| Clip 생성 실패    | Clip row의 `generationState=failed`로 영속화                       | bounded failure reason만 저장하고 `fileId`, retention state, expiry는 `null`로 둔다. 같은 observation 재시도는 같은 row를 갱신한다. |
| 삭제 재시도       | 기존 `storage_deletion_outbox` 재사용                              | `purpose`와 private `fileId`로 대상을 구분한다. Clip ID를 기존 `file_id`에 다른 의미로 넣거나 새 `subject_type`을 만들지 않는다.    |
| 호환 계약         | 새 쓰기는 목표 DTO만 사용하고, 구형 읽기 경로는 한시적으로 유지    | DTO v1 adapter와 legacy Clip column은 drain·backfill 확인 뒤 별도 cleanup PR에서 제거한다.                                          |

`RehearsalEvidenceClipRecord`는 상세 DTO 문서에 정의된 성공 Clip shape를 그대로 사용한다. 생성 실패 상태는 public record를 확장하지 않고 내부 Clip row에서만 관리해 기존 Evidence API reason으로 변환한다.

- row 없음: `not-created`
- 내부 생성 실패 row: `generation-failed`
- 성공 record: `fileId` 필수, `purpose=rehearsal-evidence-audio`, 정확한 14일 만료, retention state는 `retained`, `delete-pending`, `deleted`, `delete-exhausted` 중 하나

## 3. 분석 결론

현재 코드에는 기존 WPM, token/phrase 기반 말버릇 count, segment gap 기반 pause v1, 중간 슬라이드 시간, raw audio 삭제 outbox가 있다. P0 shared schema와 `rehearsal_evidence_clips` 테이블도 선행 계약 PR로 추가돼 있다.

하지만 실제 `/rehearsal/analyze` 경로는 아직 v1 형태이며, 새 schema 대부분이 런타임에서 사용되지 않는다. 특히 `contractVersion: 2`, nullable measurement metadata, CPM, Quality Gate, 말버릇 occurrence, pause v2, 마지막 slide timing, 음성 Observation, Clip 생성·TTL 처리는 구현돼 있지 않다.

현재 계약 충돌은 아래 cutover를 통해 상세 DTO 문서의 의미로 수렴한다.

| 영역              | 현재 런타임                                       | 목표 계약                                                         | 전환 방식                                                                         |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 분석 DTO          | `durationSeconds` 하나인 v1 shape                 | `contractVersion: 2`, recording/provider duration 분리            | Python dual-read → TS v2 new-write → retry Job drain → v1 제거                    |
| confidence 미제공 | 일부 fixture가 `accepted/CONFIDENCE_NOT_PROVIDED` | `unavailable/CONFIDENCE_NOT_PROVIDED`                             | C0-A fixture와 runtime registry를 함께 변경하고 mixed 의미를 허용하지 않는다.     |
| CPM 추세          | `target-range`, 필수 목표 범위                    | `neutral`, `targetRange=null`                                     | additive report reader를 유지하되 새 report는 목표 계약만 쓴다.                   |
| Clip 저장         | Clip row의 inline `storage_key`와 legacy `state`  | `private_audio_assets.fileId`와 분리된 generation/retention state | additive 확장 → legacy backfill → target new-write/dual-read → legacy column 제거 |
| Clip 참조         | 선택적 `evidence-clip` ref 허용                   | `observationId` 기반 Evidence API 조회                            | 기존 report parse만 허용하고 새 report에는 Clip ID/ref를 저장하지 않는다.         |

공통 계약 PR이 위 의미를 확정하기 전에는 앱 내부에 별도 enum이나 임시 DTO를 만들지 않는다. legacy report default는 이미 저장된 보고서를 읽기 위해 유지하지만 신규 생성 결과에는 사용하지 않는다.

## 4. 현재 구현 상태

| 기능                      | 상태        | 현재 근거                                                                                              | 남은 작업                                                                                          |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| TypeScript 분석 요청 검증 | 부분 구현   | `rehearsalAnalyzeRequestSchema`가 `.strict()`이며 worker가 전송 전 parse                               | v2 필드, 중첩 불변식, response schema, cutover adapter                                             |
| Python HTTP 422           | 부분 구현   | request model은 root·segment·keyword·timeline에서 extra field를 거부하고 root·segment 회귀 시험이 존재 | keyword·timeline 회귀 시험, 모든 중첩 strict/finite/order 검증, 안전한 422 body, transcript 비노출 |
| duration resolver         | 부분 구현   | provider duration 우선, 없으면 segment window fallback                                                 | recording/provider/source 분리, 0 sentinel 제거, measurement reason                                |
| WPM                       | 부분 구현   | 기존 tokenization과 0 fallback 존재                                                                    | 공식 duration resolver 공유, Decimal `ROUND_HALF_UP`, unmeasured 분리                              |
| CPM                       | 미구현      | shared `speechRate` schema와 fixture만 존재                                                            | NFKC, Unicode Letter·Number count, 한국어 제한, report 저장                                        |
| STT Quality Gate          | 계약만 존재 | `sttQualityGateSchema`와 fixture만 존재                                                                | runtime registry, 결과 전파, 낮은 confidence 차단                                                  |
| 말버릇 count              | 구현        | 단일 token, 늘인 token, phrase, substring 오탐 시험 존재                                               | occurrence, time range, precision, slideId, 측정 상태                                              |
| pause v1                  | 부분 구현   | 1초 이상 segment gap과 detail 생성                                                                     | timestamp 없음과 0회 구분, 정확한 경계 fixture                                                     |
| pause v2                  | 계약만 존재 | `pauseV2DetailSchema`와 fixture만 존재                                                                 | slide transition 위치, unknown intent/source, metric version 2                                     |
| slide timing              | 부분 구현   | 연속 slide 진입 사이의 중간 slide 시간 계산                                                            | recording duration이 있을 때만 마지막 slide 계산, 중복·역전 정규화                                 |
| 음성 Observation          | 미구현      | shared `ReportObservation` 값·time-range 계약만 존재                                                   | CPM/filler/pause/timing 원천값과 실제 evidenceRefs 생성                                            |
| Clip DB/schema            | 기반만 구현 | migration, 최대 12초·14일·Owner-only schema 존재                                                       | raw audio 절단, object 저장, row 생성, observation별 1개 보장                                      |
| Clip TTL·조기 삭제        | 미구현      | generic raw audio deletion outbox/reconciler만 존재                                                    | 만료 스캔, 동일 outbox 등록, clip state 갱신, 5회 재시도·exhausted event                           |
| 민감정보 경계             | 부분 구현   | report transcript는 `null`, raw audio는 성공·실패 뒤 삭제 예약                                         | 422 `input` 제거, provider body를 Job error에 저장하지 않기, Job result의 `audioFileId` 제거       |

현재 상태 확인에 사용한 targeted test는 모두 통과했다.

```text
shared P0 contract: 12 passed
worker 전체 suite: 72 passed
Python rehearsal analyze: 17 passed, deprecation warning 1건
```

## 5. 의존성 그래프와 병합 순서

```text
C0-A 분석 DTO v2 계약
  └─ P1 TypeScript DTO sender/parser
       └─ 이창원 Python Pydantic v2 경계
            └─ P1-B 분석 DTO v1 호환 제거

C0-D Run meta 실제 녹음 시간 계약
  └─ 임재환 Web/API recording duration producer
       ├─ P2 duration·CPM·WPM
       └─ P6 slide timing

C0-B1 public report 측정 계약
  └─ C0-B2 평가 입력·지표 버전 계약
       ├─ P2 duration·CPM·WPM
       ├─ P3 STT Quality Gate
       ├─ P4 말버릇 evidence
       ├─ P5 pause v1·v2
       └─ P6 slide timing
            └─ 최영빈 공통 평가기 인터페이스
                 └─ P7 음성 Observation 연결

C0-C1 Clip public lifecycle 계약
  └─ C0-C2 Clip private 파일·DB 확장 계약
       └─ P8 Clip 생성·저장
            └─ P9 Clip 보관·삭제 재시도
                 └─ C0-C3 Clip legacy 저장 계약 제거

P7 음성 Observation 연결
  └─ P8 Clip 생성·저장
       └─ 임재환 Evidence API·Player·실제 E2E
```

`rehearsal.py`, `rehearsal-stt.processor.ts`가 공통 hot spot이므로 P2~P6는 동시에 작업하지 않고 앞 PR이 병합된 최신 `origin/develop`에서 다음 브랜치를 만든다. P8 Clip 작업은 P7과 공통 평가기 결과가 병합된 뒤 시작한다.

| PR    | 예상 크기 | 예상 파일 수 |
| ----- | --------- | ------------ |
| C0-A  | M         | 5            |
| C0-D  | S         | 4            |
| C0-B1 | M         | 4            |
| C0-B2 | M         | 5            |
| C0-C1 | M         | 4            |
| C0-C2 | M         | 4            |
| C0-C3 | M         | 3~4          |
| P1~P5 | M         | 각각 4       |
| P1-B  | S         | 4            |
| P6    | S         | 2            |
| P7    | M         | 4            |
| P8~P9 | M         | 각각 5       |

## 6. 계약·전환 PR

### C0-A. 분석 DTO v2 계약

- 브랜치: `feature/rehearsal-analysis-dto-contract-v2`
- PR 제목: `feat: 리허설 분석 DTO v2 계약 추가`
- 담당: 김동현 주도, 이창원 Python 경계 검토
- 변경 예상 파일:
  - `packages/shared/src/coaching/rehearsal-analyze.schema.ts`
  - `packages/shared/src/coaching/p0-core-contract.fixtures.json`
  - `packages/shared/src/coaching/p0-core-contract.schema.test.ts`
  - `docs/contracts.md`
  - `docs/decision-log.md`

구현 내용:

- request와 response에 숫자 literal `contractVersion: 2`를 추가한다.
- language/provider/model, normalized confidence, recording/provider duration을 분리한다.
- segment time pair, 시간 오름차순, ID 길이, finite number, confidence 범위를 Zod에서 검증한다.
- response의 measurement, capability, Quality Gate, filler occurrence, pause v2 shape를 strict schema로 고정한다.
- TypeScript와 Python이 같은 합성 JSON fixture를 읽도록 유지한다.
- 기존 v1은 짧은 배포 호환 adapter로만 남기고 신규 fixture와 문서는 v2만 사용한다.

완료 조건:

- root와 모든 nested extra field가 거부된다.
- 정상 request/response fixture가 Zod를 통과한다.
- `durationSeconds=0`, 한쪽만 있는 segment time, 감소하는 timeline, 알 수 없는 normalization profile이 거부된다.
- fixture의 transcript는 실제 사용자 자료가 아닌 합성 문장만 사용하고 URL·storage key·비밀값은 넣지 않는다.

검증:

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
```

커밋 후보:

```text
feat: 리허설 분석 DTO v2 계약 추가

TypeScript와 Python이 공유할 요청·응답 필드와 단위를 strict schema로 고정
구형 duration 0 sentinel을 nullable 측정 상태로 전환할 기반 추가
```

### C0-D. Run meta 실제 녹음 시간 계약

- 브랜치: `feature/rehearsal-recording-duration-contract`
- PR 제목: `feat: 리허설 실제 녹음 시간 계약 추가`
- 담당: 계약은 김동현, Web/API producer는 임재환
- 변경 예상 파일:
  - `packages/shared/src/rehearsals/rehearsal.schema.ts`
  - `packages/shared/src/rehearsals/rehearsal.schema.test.ts`
  - `docs/contracts.md`
  - `docs/decision-log.md`

구현 내용:

- Run meta에 nullable `recordingDurationSeconds`를 additive로 추가한다.
- 값이 있으면 양수 finite number만 허용하고 `0`, 음수, `NaN`, `Infinity`는 거부한다.
- shared audio-complete와 Run meta 계약은 legacy upload와 chunk upload 모두 분석 enqueue 전에 실제 녹음 시간을 저장하도록 명시한다.
- worker는 Run meta 값을 분석 DTO의 같은 필드로 전달하며 provider duration으로 덮어쓰지 않는다.

완료 조건:

- 기존 Run meta는 default `null`로 계속 읽힌다.
- audio-complete request와 저장된 Run meta가 같은 nullable 양수 schema를 사용한다.
- contract fixture는 worker가 같은 값을 v2 분석 요청으로 전달하고 provider duration으로 덮어쓰지 않는 예시를 포함한다.

검증:

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
```

커밋 후보:

```text
feat: 리허설 실제 녹음 시간 계약 추가

Run meta에 실제 녹음 시간을 nullable 양수로 정의
분석과 마지막 슬라이드 계산이 같은 canonical duration을 사용하도록 기반 추가
```

### C0-B1. public report 음성 측정 계약

- 브랜치: `feature/rehearsal-speech-report-contract`
- PR 제목: `feat: 리허설 음성 측정 상태 계약 추가`
- 담당: Phase 0 계약 최종 담당자, 김동현 필드·단위 제공
- 변경 예상 파일:
  - `packages/shared/src/coaching/speech-evidence.schema.ts`
  - `packages/shared/src/rehearsals/rehearsal.schema.ts`
  - `packages/shared/src/rehearsals/rehearsal.schema.test.ts`
  - `docs/contracts.md`

구현 내용:

- legacy 숫자 필드는 유지하고 `measurements`, `sttQualityGate`, `analysisCapabilities`, `pauseV2Details`를 additive/default 방식으로 추가한다.
- `characters-per-minute` trend는 `neutral`과 `targetRange=null`만 허용한다.
- legacy report는 숫자로 측정 여부를 추정하지 않고 bounded legacy reason을 사용한다.

완료 조건:

- 기존 report fixture가 계속 parse된다.
- 새 report는 값과 measurement state 불변식을 함께 만족한다.
- CPM과 WPM, pause v1과 v2가 같은 trend series에 섞이지 않는다.
- 상세 DTO 문서와 `packages/shared`, `docs/contracts.md`의 enum·단위·default가 일치한다.

검증:

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
```

커밋 후보:

```text
feat: 리허설 음성 측정 상태 계약 추가

Legacy report 호환을 유지하면서 측정 상태와 근거 부족 이유 추가
CPM 추세는 임의 목표 범위가 없는 설명형 지표로 고정
```

### C0-B2. 평가 입력·지표 버전 계약

- 브랜치: `feature/rehearsal-speech-evaluation-contract`
- PR 제목: `feat: 음성 평가 지표 버전 계약 추가`
- 담당: Phase 0 계약 최종 담당자, 김동현·최영빈 공동 검토
- 변경 예상 파일:
  - `packages/shared/src/coaching/evaluation-criterion.schema.ts`
  - `packages/shared/src/coaching/evaluator-lens.schema.ts`
  - `packages/shared/src/coaching/p0-core-contract.schema.test.ts`
  - `docs/contracts.md`
  - `docs/decision-log.md`

구현 내용:

- `metricDefinitionVersions`에 `speechRate`, `pauseV2`, `sttQualityGate`를 고정한다.
- `ReportObservation`의 metric version과 CPM value variant를 상세 DTO 문서와 맞춘다.
- `LOW_TRANSCRIPTION_CONFIDENCE`는 unmeasured/not-evaluated 조합에서만 허용한다.
- legacy evaluation snapshot은 default를 통해 읽되 실제 v2 값이 없으면 비교 불가로 남긴다.

완료 조건:

- 기존 evaluation snapshot과 observation fixture가 계속 parse된다.
- pause v1과 v2, WPM과 CPM의 metric version이 명시적으로 구분된다.
- 낮은 confidence가 failed criterion으로 만들어지는 조합은 schema에서 거부된다.

검증:

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
```

커밋 후보:

```text
feat: 음성 평가 지표 버전 계약 추가

말하기 속도·pause v2·STT 품질 게이트의 비교 기준 버전 고정
낮은 confidence는 측정 불가 평가 조합에서만 허용
```

### C0-C1. Clip public lifecycle 계약

- 브랜치: `feature/rehearsal-evidence-clip-contract`
- PR 제목: `feat: 리허설 Evidence Clip lifecycle 계약 추가`
- 담당: Phase 0 계약 최종 담당자, 김동현 보관·삭제 규칙 제공
- 변경 예상 파일:
  - `packages/shared/src/coaching/speech-evidence.schema.ts`
  - `packages/shared/src/files/file.schema.ts`
  - `packages/shared/src/coaching/p0-core-contract.schema.test.ts`
  - `docs/contracts.md`

구현 내용:

- `rehearsal-evidence-audio`를 internal private purpose로 예약하고 generic file API에서 생성·조회하지 못하게 한다.
- observation 기반 조회, 12초 상한, 정확한 14일 만료, Owner-only, Signed URL 15분 이하 응답 계약을 고정한다.
- 성공 Clip record는 상세 DTO 문서의 `RehearsalEvidenceClipRecord` 필드와 retention 불변식을 그대로 따른다.
- 생성 실패는 record schema를 확장하지 않고 `availability=unavailable`, `reason=generation-failed`로만 public API에 노출한다.

완료 조건:

- row 없음은 `not-created`, 실패 row는 `generation-failed`로 API 결과가 구분된다.
- 12,000ms는 허용하고 12,001ms는 거부한다.
- generic upload/list/get/content에서 derived Clip이 노출되지 않는다.
- 신규 report와 observation에는 Clip ID, file ID, `evidence-clip` ref를 저장하지 않는다.

검증:

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
```

커밋 후보:

```text
feat: 리허설 Evidence Clip lifecycle 계약 추가

파생 음성 purpose와 Owner-only 재생 응답을 private 계약으로 고정
최대 12초와 14일 보관 규칙을 schema 경계에서 검증
```

### C0-C2. Clip private 파일·DB 확장 계약

- 브랜치: `feature/rehearsal-evidence-private-file-contract`
- PR 제목: `feat: Evidence Clip private 파일 저장 계약 추가`
- 담당: Phase 0 계약 최종 담당자, 김동현 보관·삭제 규칙 제공
- 변경 예상 파일:
  - 새 TypeORM migration
  - 해당 migration test
  - `docs/contracts.md`
  - `docs/decision-log.md`

구현 내용:

- generic `project_assets`와 분리된 `private_audio_assets` 테이블을 만들고 `fileId`, `projectId`, `purpose`, private `storageKey`, hash, MIME, size, 생성·삭제 시각을 둔다. URL column은 만들지 않는다.
- `private_audio_assets`에 `(project_id, file_id)` unique key를 두고 `rehearsal_evidence_clips(project_id, file_id)`가 이를 참조하는 composite FK로 tenant 정합성을 보장한다.
- `rehearsal_evidence_clips`에 target `file_id`, `generation_state`, bounded failure reason, `retention_state`, `expires_at`를 additive로 추가한다. DB check도 성공·실패 discriminated union과 같은 nullability를 강제한다.
- 현재 non-unique observation index는 `(project_id, run_id, observation_id)` unique constraint로 보강해 observation당 최대 1개를 DB에서도 보장한다.
- 기존 Clip row가 있으면 private asset row와 target state로 backfill한다. 이 PR에서는 legacy `storage_key`·`state` column을 제거하지 않는다.
- 기존 `storage_deletion_outbox`의 `purpose`와 `file_id`를 그대로 재사용한다. 새 `subject_type`을 추가하지 않고, Clip ID가 아니라 private `fileId`를 `file_id`에 저장하도록 계약을 고정한다.

완료 조건:

- 기존 migration 파일을 덮어쓰지 않고 additive migration으로 변경한다.
- 기존 raw audio outbox row가 같은 의미로 읽힌다.
- Clip 삭제 fixture는 `purpose=rehearsal-evidence-audio`와 private `fileId`를 사용하며 Clip ID를 storage identity로 사용하지 않는다.
- legacy Clip row가 private asset과 target lifecycle state로 손실 없이 backfill된다.
- up → down → up에서 unique constraint, private FK, outbox identity가 일관된다.

검증:

```bash
pnpm test:coaching:migrations
```

커밋 후보:

```text
feat: Evidence Clip private 파일 저장 계약 추가

Generic 파일과 분리된 private audio asset 및 tenant-safe fileId 추가
Observation별 Clip 한 개와 additive backfill migration 되돌리기 보장
```

### C0-C3. Clip legacy 저장 계약 제거

- 브랜치: `refactor/rehearsal-evidence-clip-legacy-cleanup`
- PR 제목: `refactor: Evidence Clip legacy 저장 계약 제거`
- 의존성: P8·P9 배포, legacy backfill 완료, pending deletion outbox drain 확인
- 변경 예상 파일:
  - 새 TypeORM cleanup migration
  - 해당 migration test
  - `docs/contracts.md`
  - 필요하면 Clip repository compatibility reader

구현 내용:

- cleanup migration은 target `file_id`와 lifecycle state로 전환되지 않은 legacy row가 하나라도 있으면 중단한다.
- `rehearsal_evidence_clips.storage_key`와 legacy `state` column을 제거하고 private storage identity는 `private_audio_assets`만 소유하게 한다.
- Clip repository의 legacy dual-read와 legacy write path를 제거한다.
- generic raw audio와 기존 project asset deletion outbox 처리는 변경하지 않는다.

완료 조건:

- 미전환 row가 있는 fixture에서는 migration이 안전하게 실패한다.
- backfill 완료 fixture에서 up → down → up이 통과하고 target Clip 조회·삭제가 유지된다.
- 코드 검색에서 Clip row의 legacy `storage_key`·`state` write가 사라진다.

검증:

```bash
pnpm test:coaching:migrations
pnpm test:coaching:integration
```

커밋 후보:

```text
refactor: Evidence Clip legacy 저장 계약 제거

Private audio asset 전환이 끝난 Clip의 inline storage identity 제거
미전환 row를 차단하는 cleanup migration과 회귀 검증 추가
```

## 7. 김동현 구현 PR

### P1. TypeScript DTO sender/parser와 안전한 오류 경계

- 브랜치: `feature/rehearsal-analysis-dto-v2`
- PR 제목: `feat: 리허설 분석 DTO v2 연결`
- 의존성: C0-A, 이창원의 Python Pydantic v2 branch와 fixture 합의
- 변경 예상 파일:
  - `apps/worker/src/python-worker/coaching-analysis.dto.ts` 신규
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`
  - `services/python-worker/tests/test_rehearsal_analyze.py`

소유권 경계:

- 김동현 branch는 shared DTO를 사용하는 sender/parser와 cross-language fixture·시험을 담당한다.
- `services/python-worker/app/main.py`의 Pydantic model과 422 exception handler 수정은 이창원 branch가 담당한다. P1은 해당 branch가 병합되거나 같은 fixture 기준으로 검증된 뒤 완료 처리한다.

구현 내용:

- worker는 shared request schema를 통과한 v2 payload만 전송하고 shared response schema로 body를 parse한다.
- Python endpoint는 전환 기간에 v1/v2를 dual-read하고, v1 retry Job adapter는 `durationSeconds=0`을 `providerDurationSeconds=null`로 바꾼다.
- 신규 enqueue와 worker 재처리는 v2만 쓰며 v1 adapter에 새 필드를 추가하지 않는다.
- Python의 422 body는 `loc`, `msg`, `type`만 반환하고 `input`, transcript, segment text를 제거한다.
- worker는 provider response text 전체를 Job/run error에 저장하지 않고 bounded error code만 기록한다.
- Job result의 불필요한 `audioFileId`와 provider 원문을 제거한다.

완료 조건:

- 정상 v2 fixture는 HTTP 200이고 camelCase response가 Zod를 통과한다.
- root/nested extra, 잘못된 time pair, 감소 timeline은 HTTP 422다.
- 422 body, Job error, 로그에 합성 transcript와 segment text가 없다.
- 잘못된 Python response는 report 저장 전에 실패한다.

검증:

```bash
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py
uv run ruff check app tests/test_rehearsal_analyze.py
uv run mypy app
```

커밋 후보:

```text
feat: 리허설 분석 DTO v2 연결

Worker 요청과 Python 응답을 shared strict schema로 검증
검증 오류와 Job 결과에서 transcript 및 raw audio 식별자 노출 제거
```

### P1-B. 분석 DTO v1 호환 경로 제거

- 브랜치: `refactor/rehearsal-analysis-v1-removal`
- PR 제목: `refactor: 리허설 분석 v1 호환 경로 제거`
- 의존성: P1 배포, v1 retry Job drain 확인, 이창원 Python v1 model cleanup
- 변경 예상 파일:
  - `apps/worker/src/python-worker/coaching-analysis.dto.ts`
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`
  - `services/python-worker/tests/test_rehearsal_analyze.py`

구현 내용:

- v1 request adapter와 `durationSeconds=0` sentinel 변환을 제거한다.
- Python endpoint의 v1 request model/dispatch를 제거하고 `contractVersion: 2`만 허용한다.
- queue와 dead-letter/retry 대상에 v1 payload가 남지 않았다는 운영 확인 결과를 PR 본문에 기록한다.

완료 조건:

- v2 fixture와 worker retry가 그대로 통과한다.
- v1 payload는 안전한 bounded 422 응답을 받고 transcript·segment text를 노출하지 않는다.
- 코드 검색에서 v1 duration sentinel과 compatibility adapter가 사라진다.

검증:

```bash
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py
```

커밋 후보:

```text
refactor: 리허설 분석 v1 호환 경로 제거

Retry Job 전환 완료 후 v1 adapter와 duration sentinel 제거
Python 분석 경계를 contractVersion 2 전용으로 단순화
```

### P2. duration·CPM·WPM 말 빠르기 분석

- 브랜치: `feature/rehearsal-speech-rate`
- PR 제목: `feat: 한국어 말하기 속도 측정 추가`
- 의존성: C0-D, 임재환 Web/API recording duration producer, C0-B1, C0-B2, P1
- 변경 예상 파일:
  - `services/python-worker/app/rehearsal.py`
  - `services/python-worker/tests/test_rehearsal_analyze.py`
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`

구현 내용:

- duration을 recording → provider → segment-window 순서로 resolve하고 source와 measurement reason을 반환한다.
- 한국어 transcript를 NFKC 정규화한 뒤 Unicode Letter·Number code point만 세어 CPM을 계산한다.
- 기존 WPM tokenization은 유지하되 CPM과 환산하지 않는다.
- 두 속도 모두 `Decimal(..., ROUND_HALF_UP)` 규칙으로 소수 둘째 자리까지 계산한다.
- public legacy 숫자에는 호환 placeholder를 사용하더라도 새 evaluator와 UI는 measurement metadata가 measured일 때만 읽게 한다.

외부 의존성:

- 임재환 Web/API branch가 C0-D의 `recordingDurationSeconds`를 audio-complete 전에 Run meta에 저장해야 한다. P2는 이 canonical 값을 우선 사용하고 값이 `null`인 legacy run에서만 provider/segment fallback을 사용한다.

완료 조건:

- recording 90/provider 89/segment 80은 90/recording이다.
- 모든 duration 근거가 없으면 null/`NO_DURATION_EVIDENCE`이며 0을 측정값으로 사용하지 않는다.
- `"안녕, Orbit 2!"`의 count는 8이고 NFKC 호환문자는 같은 결과다.
- `ko`, `ko-KR`만 CPM measured이며 WPM과 상호 환산하지 않는다.

검증:

```bash
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py -k "duration or cpm or wpm"
cd ../..
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
```

커밋 후보:

```text
feat: 한국어 말하기 속도 측정 추가

녹음·Provider·segment 순서의 duration 근거와 CPM v1 계산 추가
기존 WPM은 같은 duration을 사용하는 호환 지표로 유지
```

### P3. STT Quality Gate

- 브랜치: `feature/rehearsal-stt-quality-gate`
- PR 제목: `feat: STT 품질 게이트 적용`
- 의존성: P2
- 변경 예상 파일:
  - `services/python-worker/app/rehearsal.py`
  - `services/python-worker/tests/test_rehearsal_analyze.py`
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`

구현 내용:

- normalization profile registry와 Quality policy registry를 분리한다.
- production P0 registry는 승인된 profile이 없으면 비워 두고, 경계 시험은 주입 가능한 fake registry를 사용한다.
- confidence 없음은 추측하지 않고 unavailable, profile은 알지만 policy가 없으면 `QUALITY_POLICY_NOT_CONFIGURED`로 기록한다.
- 승인 threshold 미달이면 CPM/WPM/filler/pause/keyword coverage를 모두 unmeasured로 만들고 detail을 비운다.

완료 조건:

- confidence 없음에도 실제 text/timestamp 근거가 있는 지표는 계산된다.
- `confidence == threshold`는 통과하고 미만은 실패한다.
- raw provider score를 평균하거나 임의 변환하지 않는다.
- 낮은 confidence가 0점이나 실제 측정 실패 문제로 바뀌지 않는다.

검증:

```bash
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py -k "quality or confidence"
cd ../..
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
```

커밋 후보:

```text
feat: STT 품질 게이트 적용

승인된 Provider·model·언어·정규화 profile에만 threshold 적용
낮은 confidence의 음성 파생 지표를 측정 불가로 전달
```

### P4. 말버릇 occurrence와 시간 근거

- 브랜치: `feature/rehearsal-filler-evidence`
- PR 제목: `feat: 말버릇 발생 위치 근거 추가`
- 의존성: P3
- 변경 예상 파일:
  - `services/python-worker/app/rehearsal.py`
  - `services/python-worker/tests/test_rehearsal_analyze.py`
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`

구현 내용:

- 기존 token/phrase/canonical count를 유지한다.
- timed segment에서 확인한 발생에는 segment range와 `precision="segment"`를 붙인다.
- word timestamp provider가 승인되기 전에는 `precision="word"`를 만들지 않는다.
- occurrence midpoint가 명시적 slide window에 들어갈 때만 `slideId`를 붙인다.
- 전체 transcript count와 timestamp occurrence 수가 다를 수 있음을 유지하고 가짜 0..0 range를 만들지 않는다.

완료 조건:

- 단일 filler, phrase filler, 늘인 filler, substring 오탐, phrase/token 중복 방지 시험이 유지된다.
- count 정렬은 count 내림차순·word 오름차순이다.
- timestamp 없는 occurrence는 count에는 포함될 수 있지만 evidence에는 들어가지 않는다.
- Quality Gate 실패 시 count는 null이고 detail은 빈 배열이다.

검증:

```bash
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py -k "filler"
cd ../..
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
```

커밋 후보:

```text
feat: 말버릇 발생 위치 근거 추가

기존 token·phrase 집계를 유지하면서 확인 가능한 segment 시간 범위 연결
위치를 확인할 수 없는 말버릇에는 가짜 timestamp를 생성하지 않음
```

### P5. pause v1 측정 상태와 pause v2

- 브랜치: `feature/rehearsal-pause-v2`
- PR 제목: `feat: 긴 멈춤 v2 분류 추가`
- 의존성: P4
- 변경 예상 파일:
  - `services/python-worker/app/rehearsal.py`
  - `services/python-worker/tests/test_rehearsal_analyze.py`
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`

구현 내용:

- pause v1의 1초 이상 gap 규칙을 보존하고 timestamp 없음은 0회가 아니라 unmeasured로 반환한다.
- 같은 gap에 metric version 2의 위치·의도·source 축을 추가한다.
- pause 안에 slide entry가 있으면 `slide-transition`, 나머지는 승인된 sentence boundary가 없으므로 `unknown`이다.
- 승인된 intent provider가 없으므로 P0에서는 항상 `intent="unknown"`, `intentSource="none"`이다.
- 길이만으로 hesitation을 추정하지 않는다.

완료 조건:

- gap 0.99는 제외, 1.00과 1.01은 포함한다.
- timestamp 없음은 `SEGMENT_TIMESTAMPS_UNAVAILABLE`이다.
- slide entry가 pause range 안에 있을 때만 slide transition이다.
- v1과 v2 detail은 시간 오름차순이며 서로 다른 metric version을 사용한다.

검증:

```bash
cd services/python-worker
uv run pytest tests/test_rehearsal_analyze.py -k "pause"
cd ../..
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
```

커밋 후보:

```text
feat: 긴 멈춤 v2 분류 추가

기존 1초 pause v1을 유지하면서 위치와 Provider 근거 축 추가
분류 근거가 없는 멈춤의 의도와 문장 위치를 unknown으로 보존
```

### P6. 마지막 슬라이드 실제 시간

- 브랜치: `feature/rehearsal-slide-timing`
- PR 제목: `feat: 마지막 슬라이드 실제 시간 계산 추가`
- 의존성: C0-D, 임재환 Web/API recording duration producer, P2
- 변경 예상 파일:
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `apps/worker/src/rehearsal-stt.processor.spec.ts`

구현 내용:

- slide timeline을 서로 다른 연속 slide와 증가하는 시간으로 정규화한다.
- 중간 slide는 다음 entry 차이를 사용한다.
- 마지막 slide는 실제 `recordingDurationSeconds`가 있을 때만 종료 시간을 계산한다.
- provider duration이나 segment window로 마지막 slide 종료를 추정하지 않는다.

완료 조건:

- 녹음 종료시간이 있으면 마지막 slide timing이 생성된다.
- 종료시간이 없거나 음수·역전이면 해당 항목을 생략한다.
- 중복 slide entry와 잘못된 slideId로 0초 timing을 만들지 않는다.

검증:

```bash
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
```

커밋 후보:

```text
feat: 마지막 슬라이드 실제 시간 계산 추가

실제 녹음 전체 시간 근거가 있을 때만 마지막 슬라이드 종료 계산
중복·역전된 이동 기록에는 추정값을 만들지 않도록 정규화
```

### P7. 음성 측정 Observation 원천값 연결

- 브랜치: `feature/rehearsal-speech-observations`
- PR 제목: `feat: 음성 측정 Observation 원천값 추가`
- 의존성: P3~P6, 최영빈 공통 평가기 입력 인터페이스 병합
- 변경 예상 파일:
  - `apps/worker/src/coaching/speech-observation-builder.ts` 신규
  - `apps/worker/src/coaching/speech-observation-builder.spec.ts` 신규
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - 공통 평가기 adapter 1개

구현 내용:

- CPM/WPM, filler count, pause v1·v2, slide duration의 measured source를 공통 평가기에 전달한다.
- 실제 filler occurrence와 pause range만 정수 ms `time-range` evidence로 변환한다.
- 측정 불가 항목에는 observation을 만들지 않거나 shared 계약이 요구하는 `none` 원천값만 사용한다.
- 최종 `CriterionResult`, Top 3, 문구는 만들지 않는다.

완료 조건:

- measured result가 참조하는 observation은 같은 criterion/scope를 사용한다.
- timestamp가 없는 filler와 pause에 `0..0` evidence를 만들지 않는다.
- pause v1은 version 1, pause v2는 version 2다.
- observation에 transcript, excerpt, audio ID/URL/key가 없다.

검증:

```bash
pnpm --filter @orbit/worker test -- speech-observation-builder.spec.ts
pnpm --filter @orbit/shared test
```

커밋 후보:

```text
feat: 음성 측정 Observation 원천값 추가

말 빠르기·말버릇·멈춤·슬라이드 시간 측정값을 공통 평가기 입력으로 변환
확인 가능한 시간 범위만 bounded evidence로 연결
```

### P8. Evidence Audio Clip 생성·저장

- 브랜치: `feature/rehearsal-evidence-clip-generation`
- PR 제목: `feat: 리허설 Evidence 오디오 클립 생성 추가`
- 의존성: C0-C1, C0-C2, P7, 공통 평가 결과에서 failed/partial observation 식별 가능
- 변경 예상 파일:
  - `apps/worker/src/coaching/evidence-audio-clipper.ts` 신규
  - `apps/worker/src/coaching/evidence-audio-clipper.spec.ts` 신규
  - `apps/worker/src/coaching/private-audio-asset.repository.ts` 신규
  - `apps/worker/src/rehearsal-stt.processor.ts`
  - `infra/docker/worker.Dockerfile`

구현 내용:

- failed/partial result가 참조하는 실제 time range의 첫 범위만 후보로 선택한다.
- midpoint 중심으로 0보다 크고 최대 12초인 window를 계산하며 시작·종료 경계에서 반대쪽으로 이동한다.
- worker가 raw audio bytes를 메모리에서 읽어 `ffmpeg` stdin으로 전달한다. Signed URL과 storage key를 command 인자·오류·로그에 넣지 않는다.
- 출력은 AAC-LC M4A로 고정하고 MIME은 `audio/mp4`를 사용한다. stdout pipe에는 fragmented MP4용 `frag_keyframe+empty_moov+default_base_moof` 옵션을 사용한다.
- 성공 시 `rehearsal-evidence-audio` object와 `private_audio_assets` row를 만든 뒤 Clip의 `fileId`를 같은 tenant 범위로 연결한다.
- 실제 range가 없으면 Clip row를 만들지 않아 API가 `not-created`로 응답하게 한다. 유효 후보를 선택한 뒤 절단·저장이 실패한 경우만 `generationState=failed`와 bounded reason으로 같은 observation row에 남긴다. 이 row는 `fileId`, retention state, expiry를 갖지 않는다.
- 부분 성공 후 DB 연결이 실패하면 저장 object를 deletion outbox에 넣어 orphan을 남기지 않는다.
- Clip 실패는 report와 criterion 결과를 실패로 되돌리지 않으며 재시도는 `(projectId, runId, observationId)` unique row를 갱신한다.
- 순서는 평가 완료 → Clip 시도 → report 저장 → raw audio 삭제 예약이다.

완료 조건:

- 12,000ms Clip은 저장되고 12,001ms 결과는 schema에서 거부된다.
- 성공 object는 AAC-LC M4A이며 metadata와 재생 응답 MIME이 모두 `audio/mp4`다.
- 실제 range 없음은 Clip row 없이 report가 저장되고, 절단 실패와 storage 실패는 실패 Clip row와 report가 저장된다.
- 같은 observation 재시도에서 Clip이나 private asset이 중복 생성되지 않는다.
- DB·Job·로그·report에 Signed URL과 storage key가 노출되지 않는다.
- worker Docker image에서 고정된 `ffmpeg` binary로 stdin → M4A stdout 통합 시험이 통과한다.

검증:

```bash
pnpm --filter @orbit/worker test -- evidence-audio-clipper.spec.ts
pnpm --filter @orbit/worker test -- rehearsal-stt.processor.spec.ts
docker compose build worker
```

커밋 후보:

```text
feat: 리허설 Evidence 오디오 클립 생성 추가

실패·부분 전달 Observation의 실제 시간 범위에서 최대 12초 Clip 생성
Clip 실패와 중복 재시도가 공식 보고서 결과를 변경하지 않도록 분리
```

### P9. Clip 만료·조기 삭제·재시도

- 브랜치: `feature/rehearsal-evidence-clip-retention`
- PR 제목: `feat: Evidence 오디오 클립 보관과 삭제 재시도 추가`
- 의존성: P8
- 변경 예상 파일:
  - `apps/worker/src/coaching/audio-clip-retention.ts`
  - `apps/worker/src/coaching/audio-clip-retention.spec.ts`
  - `apps/worker/src/storage-deletion-reconciler.ts`
  - `apps/worker/src/storage-deletion-reconciler.spec.ts`
  - `apps/worker/src/worker.service.ts`

구현 내용:

- `now >= expiresAt`인 `retained` Clip을 동일 `storage_deletion_outbox`에 private `fileId`와 `purpose=rehearsal-evidence-audio`로 idempotent 등록하고 Clip을 `delete-pending`으로 바꾼다.
- Owner 조기 삭제·TTL·run/project 삭제가 같은 enqueue helper를 사용하게 한다.
- object 삭제 성공 시 Clip을 `deleted`로 갱신하고 `private_audio_assets.storage_key`를 null 처리한다.
- 실패는 최대 5회 재시도하고 exhausted 시 Clip을 `delete-exhausted`로 갱신해 bounded business event를 남긴다.
- dispatcher와 reconciler는 outbox `purpose`로 generic project asset과 private audio asset repository를 분기한다.
- event와 로그에는 clipId/projectId/bounded reason만 남기고 URL, key, transcript를 넣지 않는다.

완료 조건:

- 생성일부터 14일 직전은 available, 정확히 14일은 재생 불가·삭제 대상이다.
- 조기 삭제는 이미 없는 Clip에도 멱등이다.
- 4회 실패 후 5회 성공과 5회 모두 실패가 검증된다.
- exhausted 이후에도 report와 수치·시간 evidence는 유지된다.
- 기존 raw audio 삭제 outbox 처리에 회귀가 없다.
- 성공 Clip의 `createdAt`과 `expiresAt` 차이는 정확히 14일이며 실패 Clip에는 expiry가 없다.

검증:

```bash
pnpm --filter @orbit/worker test -- audio-clip-retention.spec.ts storage-deletion-reconciler.spec.ts
pnpm test:coaching:integration
```

커밋 후보:

```text
feat: Evidence 오디오 클립 보관과 삭제 재시도 추가

14일 만료와 조기 삭제를 기존 storage deletion outbox로 통합
삭제 성공·재시도 소진 상태를 Clip metadata와 bounded event에 반영
```

## 8. Checkpoint

### Checkpoint A — C0-A·C0-D·C0-B1~C0-C2 병합 후

- [ ] 상세 DTO 문서, `packages/shared`, `docs/contracts.md`, decision log가 같은 enum·단위·상태를 사용한다.
- [ ] legacy report가 default를 통해 parse된다.
- [ ] Run meta의 `recordingDurationSeconds`와 분석 DTO가 같은 nullable 양수 계약을 사용한다.
- [ ] `private_audio_assets` 확장·backfill migration의 적용 → 되돌리기 → 재적용이 통과한다.

### Checkpoint B — P1~P6 병합 후

- [ ] TS fixture와 Python fixture가 모두 통과한다.
- [ ] no duration/no confidence/no timestamp가 0 또는 실패로 바뀌지 않는다.
- [ ] CPM·WPM·filler·pause v1·v2·slide timing 경계 시험이 통과한다.
- [ ] report와 Job error에 transcript, segment text, URL, storage key가 없다.
- [ ] 신규 분석 Job은 v2만 생성하고, Python dual-read 기간의 v1 retry 상태를 측정할 수 있다.

### Checkpoint B2 — v1 Job drain과 P1-B 병합 후

- [ ] queue, retry, dead-letter 대상에 v1 분석 payload가 없다.
- [ ] TypeScript adapter와 Python v1 model이 제거됐고 `contractVersion: 2`만 허용된다.

### Checkpoint C — P7~P9 병합 후

- [ ] 실제 time range만 Observation evidence와 Clip 후보가 된다.
- [ ] Clip은 observation당 최대 1개, 최대 12초, AAC-LC M4A이며 성공 Clip만 정확히 14일 보관된다.
- [ ] 성공 Clip은 private `fileId`를, 실패 Clip은 bounded failure reason만 가진다.
- [ ] Clip 생성·삭제 실패가 report를 실패시키지 않는다.
- [ ] 기존 raw audio는 terminal path에서 계속 삭제된다.
- [ ] 임재환 Evidence API·Player가 observation ID로 연결할 수 있다.

### Checkpoint D — C0-C3과 Evidence API·Player 병합 후

- [ ] 미전환 legacy Clip row와 pending legacy deletion row가 없다.
- [ ] Clip inline `storage_key`·legacy `state`와 runtime dual-read가 제거됐다.
- [ ] generic file API가 `private_audio_assets`를 조회·반환하지 않는다.
- [ ] Owner-only Evidence API는 observation ID로만 조회하고 15분 이하 Signed URL을 응답 시점에만 만든다.

## 9. 최종 검증 명령

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/worker test
pnpm build
pnpm lint
pnpm typecheck
pnpm test:coaching:migrations
pnpm test:coaching:integration
pnpm test:coaching:python
node infra/scripts/check-env.mjs
docker compose config
```

실행하지 못한 명령은 PR 본문에 이유와 남은 검증 범위를 적는다. 외부 STT·LLM·storage를 사용하는 수동 시험은 secret 값이 아니라 성공 여부와 bounded ID만 기록한다.

## 10. GitHub Flow와 PR 본문

- 각 브랜치는 선행 PR이 병합된 최신 `origin/develop`에서 만든다.
- 공유 브랜치에 push한 뒤에는 rebase나 force push를 하지 않는다.
- 한 PR에는 위 기능 단위 하나만 포함한다.
- 커밋 제목에는 scope를 쓰지 않고 `<type>: <한국어 결과>` 형식을 사용한다.
- 테스트 보강은 기능 커밋과 분리할 수 있지만, 기능 PR 안에서 함께 병합한다.

PR 본문은 다음 형식을 사용한다.

```markdown
## 무엇을 변경했나요?

이 PR이 추가한 기능과 변경한 계약을 요약합니다.

## 왜 변경했나요?

현재 미구현 상태와 사용자 영향, 선행 계약을 설명합니다.

## 어떻게 구현했나요?

- 사용한 shared schema와 metric version
- 측정 불가·fallback 처리
- 민감정보 비저장 경계

## 테스트

- [ ] 단위 테스트 추가/수정
- [ ] TypeScript↔Python fixture 검증
- [ ] 관련 통합 테스트
- [ ] 수동 테스트 또는 미실행 사유 기록

## 영향 범위

- 변경한 앱·패키지
- legacy report와 mixed-version worker 영향
- 다른 담당자 연결 지점

## 체크리스트

- [ ] 공통 계약과 문서 일치
- [ ] transcript·raw audio·Signed URL·storage key 로그 비노출
- [ ] 자기 리뷰 완료
- [ ] 새로운 경고 없음
- [ ] 로컬 검증 통과
```

## 11. 주요 위험과 대응

| 위험                                                   | 영향                                          | 대응                                                                                              |
| ------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 상세 DTO와 shared 계약이 다른 상태에서 구현 시작       | 앱별 enum과 adapter 재작업                    | C0-A·C0-D·C0-B1~C0-C2를 먼저 병합하고 shared만 import                                             |
| audio-complete 전에 recording duration이 저장되지 않음 | canonical CPM과 마지막 slide timing 품질 저하 | C0-D 계약과 임재환 producer를 P2·P6 선행 조건으로 두고 legacy run에서만 fallback                  |
| 공통 평가기 미병합                                     | Observation과 Clip 대상 결정 불가             | P7·P8을 평가기 병합 뒤 시작하고 임시 Top 3 계산 금지                                              |
| worker image의 `ffmpeg` 또는 codec 불일치              | Clip 생성·재생 불가                           | P8에서 고정 binary, AAC-LC M4A stdin/stdout 통합 시험과 Docker build 검증                         |
| private object 저장 후 DB 연결 실패                    | orphan object와 비용 누적                     | 같은 transaction 경계를 사용하고 실패 object는 즉시 deletion outbox에 등록                        |
| deletion dispatcher가 project asset만 갱신             | Clip이 `delete-pending`에 머묾                | outbox `purpose`와 private `fileId`로 repository를 분기하고 success/exhausted 상태 회귀 시험 추가 |
| legacy Clip column을 너무 일찍 제거                    | 기존 Clip 조회·삭제 실패                      | additive expansion → backfill → target new-write/dual-read → drain guard → C0-C3 순서 준수        |
| FastAPI 기본 422에 `input` 포함                        | transcript·segment text 노출                  | P1에서 전용 validation handler와 비노출 회귀 시험 추가                                            |
| v1/v2 worker 혼재                                      | retry Job 실패                                | Python dual-read → TS v2 sender → drain 확인 → P1-B에서 v1 제거                                   |

## 12. 다른 담당자에게 필요한 handoff

- 이창원: C0-A fixture를 기준으로 `main.py` Pydantic v2 request/response와 안전한 422 handler를 반영하고, v1 retry drain 뒤 P1-B에서 v1 model을 제거한다.
- 최영빈: P2~P6 measured source와 Quality Gate를 받는 공통 평가기 입력 인터페이스를 확정한다.
- 임재환: C0-D에 맞춰 legacy/chunk 경로 모두 audio-complete 전에 Run meta의 `recordingDurationSeconds`를 저장한다. observation 기반 Owner-only Evidence API, Signed URL 15분 이하, M4A Player fallback과 E2E를 연결한다.
- 김동현은 위 담당 영역의 UI·최종 평가를 직접 수정하지 않고 schema를 통과한 fixture와 저장 결과를 전달한다.

## 13. 현재 미결정 사항

현재 구현을 시작하기 위해 남은 제품·아키텍처 결정은 없다. 구현 중 목표 DTO와 충돌하는 새 런타임 제약이 발견되면 임시 계약을 추가하지 않고 질문으로 확정한 뒤 이 문서와 `docs/specs/rehearsal-speech-evidence-dto-contract.md`를 함께 갱신한다.
