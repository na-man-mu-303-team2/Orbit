# 리허설 음성 및 전사 데이터 처리 현황

## 1. 문서 목적

이 문서는 `feature/rehearsal-volume-analysis` 브랜치에서 리허설 원본 음성과 전사 데이터가 어떻게 생성·저장·조회·삭제되는지 정리한다.

- 확인 일자: 2026-07-16
- 원본 음성 보관 정책: 업로드 완료 시점부터 14일
- 전사 원문 정책: 영속 보관하지 않음
- 문제 구간 재생 방식: 별도 Clip 없이 보관 중인 원본 음성을 구간 seek

## 2. 현재 정책 요약

| 대상 | 현재 처리 | 보관 기간 | 저장 위치 | 사용자 조회 |
| --- | --- | --- | --- | --- |
| 정상 완료된 원본 음성 | 업로드 완료 시 deadline 저장 후 만료 삭제 | 14일 | S3 호환 Object Storage, `project_assets` metadata | 전용 playback URL로 구간 재생 |
| 분석·enqueue 실패 원본 음성 | 삭제 outbox 또는 즉시 삭제 요청 | 즉시 삭제 시도 | 삭제 전 Object Storage | 조회 불가 |
| 전체 전사 문자열 | 처리 중에만 사용 | 영속 보관 안 함 | Python/TypeScript Worker 메모리 | 조회 불가 |
| 타임스탬프 전사 segment | 의미 평가 재시도용 캐시 | 30분 | 비영속 private-evidence Redis | 내부 Worker만 조회 |
| 리포트 전사 필드 | `transcriptRetained=false`, `transcript=null` | 해당 없음 | `rehearsal_runs.report_json` | 원문 미제공 |
| 음량 분석 결과 | 수치·문제 시간 범위 저장 | 리포트와 동일 | `rehearsal_runs.report_json.volumeAnalysis` | 상대 문구와 구간 표시 |
| Evidence Clip | 별도 schema·DB 계약만 존재 | 계약상 7일 | `rehearsal_evidence_clips` 예정 | 생성·재생 구현 없음 |

원본 음성 14일 보관과 전사 segment 30분 캐시는 서로 다른 정책이다. 이번 구현은 전사 원문이나 segment의 보관 기간을 14일로 늘리지 않는다.

## 3. 원본 음성 처리 흐름

### 3.1 업로드와 분석

```text
MediaRecorder
→ POST /api/v1/rehearsals/:runId/audio/upload-url
→ Object Storage PUT
→ POST /api/v1/rehearsals/:runId/audio/complete
→ rawAudioDeleteDeadlineAt = 완료 시각 + 14일
→ rehearsal-stt Job
→ STT·음량·침묵 분석
→ report_json 저장
```

원본 binary는 S3 호환 Object Storage에 저장한다. 로컬 Docker 환경은 MinIO를 사용하며 Object key는 `projects/{projectId}/assets/{fileId}-{safeFileName}` 형식이다. PostgreSQL `project_assets`는 `storage_key`, `purpose=rehearsal-audio`, 업로드·삭제 상태 등 metadata만 저장하고, `rehearsal_runs.audio_file_id`가 파일을 참조한다.

### 3.2 단일 로드와 분석 모듈 공유

TypeScript Worker는 `StoragePort.getSignedReadUrl()`로 내부 처리용 signed URL을 만들고 Python Worker의 `/audio/transcribe`에 전달한다. Python Worker는 원본을 한 번 내려받아 `AudioContent`로 만들고, PyAV 디코딩도 한 번 수행한다.

```text
AudioContent
├── STT provider
└── DecodedAudio (mono float32 16kHz)
    ├── volumeAnalysis
    └── silenceAnalysis
```

음량 또는 침묵 분석 실패는 해당 결과만 `unmeasured`로 만들며 STT 성공을 막지 않는다. raw bytes, waveform, 전체 RMS 배열과 signed URL은 저장하거나 로그에 남기지 않는다.

### 3.3 14일 보관과 삭제

- 신규 녹음은 `completeAudioUpload()` 성공 시 `rehearsal_runs.raw_audio_delete_deadline_at`에 `현재 시각+14일`을 저장한다.
- 기존 성공 음성은 migration에서 `project_assets.uploaded_at+14일`로 backfill한다.
- 이미 만료된 기존 음성도 같은 deadline을 가지며 다음 reconciler 실행에서 삭제 대상으로 처리한다.
- Worker의 30초 deletion reconciler는 deadline이 지난 성공 음성을 `storage_deletion_outbox`에 `ON CONFLICT DO NOTHING`으로 먼저 등록한다.
- 기존 outbox 삭제기가 Object를 삭제하고 `project_assets.status=deleted`, `project_assets.deleted_at`, `rehearsal_runs.raw_audio_deleted_at`을 기록한다.
- 실제 Object 삭제가 늦어져도 deadline 이후 playback API는 만료로 응답한다.
- 분석 실패는 기존처럼 outbox에 즉시 등록하고, Job enqueue 실패는 API에서 즉시 삭제를 시도한다.

업로드 취소와 `complete`가 호출되지 않은 pending asset 정리는 이번 변경에 포함되지 않은 후속 과제다.

## 4. 문제 구간 재생

`GET /api/v1/rehearsals/:runId/audio/playback-url`은 다음 조건을 모두 확인한다.

- signed session 사용자와 프로젝트 read 권한
- `succeeded` run
- run에 연결된 `rehearsal-audio` purpose asset
- `uploaded` 상태이고 아직 삭제되지 않은 asset
- `rawAudioDeleteDeadlineAt`이 현재보다 뒤인 상태

응답은 `playbackUrl`, `expiresAt`, `retentionExpiresAt`을 포함한다. URL은 최대 15분 동안 유효하고 14일 retention deadline 이후까지 발급하지 않는다.

- 처리 중: HTTP 409 `REHEARSAL_AUDIO_NOT_READY`
- 만료·삭제·deadline 없음: HTTP 410 `REHEARSAL_AUDIO_EXPIRED`

Web은 URL을 필요할 때만 요청하고 만료 30초 전까지만 메모리에 캐시한다. 하나의 `Audio` 인스턴스로 문제 구간의 `startSeconds`로 이동한 뒤 `endSeconds`에서 정지한다. 다른 구간을 선택하면 기존 재생을 중단한다.

일반 asset 목록·content API에서는 계속 `rehearsal-audio`를 차단한다. playback URL, storage key, 파일명과 음성 데이터는 DB·리포트·로그에 저장하지 않는다.

## 5. 전사 데이터 처리

### 5.1 전체 전사 문자열

`/audio/transcribe`의 전체 전사 문자열은 Worker가 리포트 생성 중에만 사용하고 영속 저장하지 않는다.

- `report_json.transcriptRetained=false`
- `report_json.transcript=null`
- Job result에 전사 원문 없음
- 별도 텍스트·문서 파일 생성 없음

따라서 현재 Web의 전사본 표시·DOCX 생성 조건은 정상 리허설 흐름에서 충족되지 않는다.

### 5.2 timestamp segment 캐시

타임스탬프 segment는 의미 평가 재시도를 위해 비영속 Redis에 30분 저장한다.

- key: `rehearsal:semantic-evidence:{runId}`
- 사용 주체: 내부 semantic evaluation Worker
- 저장 실패는 기본 리포트 생성을 실패시키지 않음
- TTL 이후 재시도는 `REHEARSAL_SEMANTIC_EVIDENCE_EXPIRED`

이 캐시는 사용자 재생에 사용하지 않는다. 문제 구간 재생은 리포트에 저장된 음량 구간의 시간 범위와 원본 음성을 사용한다.

## 6. 음량 리포트와 보관 정책의 연결

`report_json.volumeAnalysis.issueSegments`는 `quiet/loud`, 시작·종료·지속 시간과 내부 분석 수치를 저장한다. 사용자 리포트에는 다음만 노출한다.

- 전체 발화보다 작게 말한 구간 수
- 전체 발화보다 크게 말한 구간 수
- 녹음 타임라인상의 위치
- 시작 시각과 지속 시간
- `이 구간 들어보기`

dBFS, RMS, 평균 음량 숫자는 표시하지 않는다. 절대적인 `적정·작음·큼` 판정도 하지 않는다. 구간 재생은 원본 파일을 새 Clip으로 잘라 저장하지 않으므로 추가 음성 사본이 생기지 않는다.

## 7. 남은 과제

- 업로드 취소와 미완료 pending asset cleanup
- 프로젝트 삭제 시 Object Storage 삭제 정합성 검증
- 실제 MinIO/S3 환경의 HTTP Range와 browser seek smoke test
- Web의 비활성 전사본 UI와 DOCX 코드 유지 여부 결정
- Evidence Clip 계약을 실제 구현할지, 원본 구간 재생으로 대체할지 결정

## 8. 결론

정상 완료된 원본 음성은 업로드 완료 시점부터 14일 동안만 보관한다. 만료 대상은 기존 삭제 outbox 경계를 통해 제거하며, deadline 이후에는 Object가 남아 있더라도 재생할 수 없다.

전사 원문은 여전히 영속 보관하지 않고 timestamp segment만 내부 재시도를 위해 30분 캐시한다. 사용자는 리포트의 상대 음량 문제 구간을 선택해 보관 중인 원본 음성의 해당 시간 범위만 들을 수 있다.
