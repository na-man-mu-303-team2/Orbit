# 리허설 음성 및 전사 데이터 처리 현황

## 1. 문서 목적

이 문서는 현재 `develop`이 반영된 `feature/rehearsal-volume-analysis` 브랜치에서 리허설 원본 음성과 전사 데이터가 어떻게 생성·저장·조회·삭제되는지 정리한다.

확인 기준은 다음과 같다.

- 확인 일자: 2026-07-16
- develop 기준 커밋: `5f1c13e5`
- 기능 브랜치: `feature/rehearsal-volume-analysis`
- 이 문서의 음량 분석 부분은 기능 브랜치의 현재 구현을 반영한다.
- 이 문서는 구현된 코드의 실제 동작을 기준으로 한다.
- `docs/contracts.md` 등 기존 문서의 의도와 실제 코드가 다른 부분은 별도로 표시한다.

## 2. 요약

| 대상 | 현재 처리 | 보관 기간 | 저장 위치 | 외부 조회 |
| --- | --- | --- | --- | --- |
| 정상 완료된 원본 음성 | 분석 후에도 유지 | 명시된 기한 없음 | S3 호환 Object Storage, `project_assets` metadata | 일반 파일 API에서 차단 |
| 분석 실패한 원본 음성 | 삭제 outbox 등록 후 삭제 | 즉시 삭제 시도 | 삭제 전 Object Storage | 조회 불가 |
| 전체 전사 문자열 | 처리 중에만 사용 | 영속 보관 안 함 | Python/TypeScript Worker 메모리 | 조회 불가 |
| 타임스탬프 전사 segment | 의미 평가 재시도용 캐시 | 30분 | 비영속 private-evidence Redis | 내부 Worker만 조회 |
| 리포트의 전사 필드 | 항상 `false/null` | 해당 없음 | `rehearsal_runs.report_json` | API도 `false/null` 반환 |
| 문제 구간 Evidence Clip | schema와 DB 계약만 존재 | 계약상 7일 | `rehearsal_evidence_clips` 예정 | 생성·재생 구현 없음 |

현재 원본 음성과 전사 데이터에는 14일 보관 정책이 구현되어 있지 않다.

## 3. 원본 음성 처리 흐름

### 3.1 녹음과 업로드

Web은 브라우저 `MediaRecorder`를 이용해 음성을 녹음한다. 녹음 chunk를 `Blob`으로 합친 뒤 `File`로 변환한다.

구현 위치:

- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
  - `createRecordingSession`
  - `createRecordingFile`

업로드 흐름은 다음과 같다.

```text
MediaRecorder
→ Blob/File 생성
→ POST /api/v1/rehearsals/:runId/audio/upload-url
→ Object Storage에 PUT
→ POST /api/v1/rehearsals/:runId/audio/complete
→ rehearsal-stt Job 생성
```

API는 업로드 URL을 만들 때 파일 목적을 `rehearsal-audio`로 고정한다.

구현 위치:

- `apps/api/src/rehearsals/rehearsals.service.ts`
  - `createAudioUploadUrl`
  - `completeAudioUpload`
- `apps/api/src/files/files.service.ts`
  - `createUploadUrl`
  - `completeUpload`

### 3.2 저장 위치

원본 음성 binary는 S3 호환 Object Storage에 저장한다.

- 로컬 Docker 환경: MinIO
- 기본 bucket: `orbit-local`
- 운영 환경: 설정된 S3 호환 bucket
- Object key 형식: `projects/{projectId}/assets/{fileId}-{safeFileName}`

PostgreSQL의 `project_assets`에는 다음 metadata가 저장된다.

- `file_id`
- `project_id`
- `storage_key`
- `original_name`
- `mime_type`
- `size`
- `purpose = rehearsal-audio`
- `status`
- `created_at`, `uploaded_at`, `deleted_at`

`rehearsal_runs.audio_file_id`가 `project_assets.file_id`를 가리켜 리허설 실행과 음성 파일을 연결한다.

구현 위치:

- `apps/api/src/files/project-asset.entity.ts`
- `apps/api/src/rehearsals/rehearsal-run.entity.ts`
- `apps/api/src/files/files.service.ts#createStorageKey`

### 3.3 Worker의 원본 음성 접근

TypeScript Worker는 `project_assets`에서 `storage_key`를 조회하고 `StoragePort.getSignedReadUrl()`을 호출한다. 생성되는 signed GET URL은 15분 동안 유효하다.

```text
rehearsal_runs.audio_file_id
→ project_assets.storage_key
→ StoragePort.getSignedReadUrl(storageKey)
→ Python Worker /audio/transcribe
```

Python Worker는 signed URL에서 음성을 내려받아 `AudioContent.data: bytes`로 메모리에 올리고 STT provider에 전달한다.

구현 위치:

- `apps/worker/src/rehearsal-stt.processor.ts`
  - `loadAudioAsset`
  - `processRehearsalSttJob`
- `packages/storage/src/index.ts#getSignedReadUrl`
- `services/python-worker/app/audio/transcribe.py`
  - `read_audio_content`
  - `transcribe_rehearsal_audio`

### 3.4 정상 완료 시 보관

현재 정상 완료 경로에서는 원본 음성 삭제 호출이 주석 처리되어 있다.

```ts
// Temporary: retain successful rehearsal recordings for follow-up audio analysis.
// await scheduleRawAudioDeletion(dataSource, asset);
```

따라서 정상 완료된 원본 음성은 다음 상태로 남는다.

- Object Storage object 유지
- `project_assets.status = uploaded` 유지
- `rehearsal_runs.raw_audio_deleted_at = null` 유지
- 별도의 만료 시각 없음
- 14일 후 삭제 예약 없음
- 저장소 코드에 S3 lifecycle 설정 없음

이는 14일 보관 정책이 아니라 보관 종료 시점이 정해지지 않은 임시 상태다.

구현 위치:

- `apps/worker/src/rehearsal-stt.processor.ts`
  - `processRehearsalSttJob` 성공 경로 마지막 부분

### 3.5 실패 시 삭제

STT, 지표 분석 또는 리포트 생성이 실패하면 `storage_deletion_outbox`에 삭제 요청을 등록한다. 삭제 reconciler가 실제 Object를 삭제한 후 다음 상태를 갱신한다.

- `project_assets.status = deleted`
- `project_assets.deleted_at` 기록
- `rehearsal_runs.raw_audio_deleted_at` 기록
- `storage_deletion_outbox.status = deleted`

삭제 실패는 지수 backoff 방식으로 최대 5회 재시도한 뒤 `exhausted` 상태가 된다.

구현 위치:

- `apps/worker/src/rehearsal-stt.processor.ts`
  - `failAndScheduleRawAudioDeletion`
  - `scheduleRawAudioDeletion`
- `apps/worker/src/storage-deletion-reconciler.ts`

Job enqueue 자체가 실패한 경우에는 API가 `FilesService.deleteUploadedAsset()`을 호출해 즉시 삭제를 시도한다.

구현 위치:

- `apps/api/src/rehearsals/rehearsals.service.ts#cleanupAfterEnqueueFailure`

### 3.6 일반 API 접근 제한

`rehearsal-audio`는 private audio purpose다. 일반 asset 목록과 content API에서는 private audio를 반환하지 않는다.

- 일반 asset list: private audio row 필터링
- 일반 asset content: private purpose이면 `404`
- 내부 Worker: repository와 `StoragePort`를 통해 접근

따라서 현재 사용자용 원본 음성 재생·다운로드 API는 없다.

구현 위치:

- `packages/shared/src/files/file.schema.ts`
- `apps/api/src/files/files.service.ts`

## 4. 전사 데이터 처리 흐름

### 4.1 Python Worker의 STT 결과

Python Worker의 `/audio/transcribe`는 다음 데이터를 반환한다.

- `transcript`: 전체 전사 문자열
- `segments`: 구간별 `text`, `startSeconds`, `endSeconds`
- `language`
- `provider`
- `model`
- `durationSeconds`

이 응답은 TypeScript Worker가 리허설 지표 분석과 리포트 생성에 사용한다.

구현 위치:

- `services/python-worker/app/audio/transcribe.py#AudioTranscribeResponse`
- `apps/worker/src/rehearsal-stt.processor.ts`

### 4.2 전체 전사 문자열

전체 전사 문자열은 처리 중에는 Worker 메모리에 존재하지만 영속 저장하지 않는다.

- `rehearsal_runs`에 전사 원문 column 없음
- `report_json.transcript = null`
- `report_json.transcriptRetained = false`
- Job result에 전사 원문 없음
- 별도의 `.txt`, `.json`, `.docx` 파일을 서버에서 생성하지 않음

리포트 생성 시 다음 값을 명시적으로 저장한다.

```json
{
  "transcriptRetained": false,
  "transcript": null
}
```

API의 `GET /api/v1/rehearsals/:runId/report`도 DB 값과 관계없이 응답을 다시 `false/null`로 고정한다.

구현 위치:

- `apps/worker/src/rehearsal-stt.processor.ts#buildRehearsalReport`
- `apps/api/src/rehearsals/rehearsals.service.ts#getReport`
- `packages/shared/src/rehearsals/rehearsal.schema.ts#rehearsalReportSchema`

### 4.3 전사 segment Redis 캐시

전체 전사 문자열 대신 타임스탬프가 있는 segment를 private-evidence Redis에 저장한다.

저장 구조:

```json
{
  "segments": [
    {
      "startMs": 0,
      "endMs": 1800,
      "text": "발화 내용"
    }
  ]
}
```

정책:

- Redis key: `rehearsal:semantic-evidence:{runId}`
- TTL: 30분
- Redis는 일반 Redis와 분리된 비영속 인스턴스 사용
- 저장 실패가 리포트 생성을 실패시키지는 않음
- 의미 평가 재시도 Worker만 segment 원문을 조회함

구현 위치:

- `apps/worker/src/rehearsal-transcript-cache.ts`
- `apps/api/src/rehearsals/rehearsal-transcript-cache.ts`
- `packages/shared/src/rehearsals/rehearsal-semantic-evidence.schema.ts`
- `apps/worker/src/rehearsal-semantic-evaluation.processor.ts`

30분이 지나면 의미 평가 재시도는 `REHEARSAL_SEMANTIC_EVIDENCE_EXPIRED`로 거부된다.

### 4.4 전사본 DOCX UI

Web에는 `report.transcriptRetained === true`이고 `report.transcript !== null`일 때 전사본을 보여주고 브라우저에서 DOCX를 생성하는 코드가 있다.

구현 위치:

- `apps/web/src/features/rehearsal/RehearsalReportDocument.tsx`
- `apps/web/src/features/rehearsal/rehearsalTranscriptExport.ts`

하지만 현재 Worker와 API가 항상 `transcriptRetained=false`, `transcript=null`을 반환하므로 실제 정상 흐름에서는 이 UI가 활성화될 수 없다.

## 5. 보관 정책 현황

### 5.1 구현된 정책

| 데이터 | 성공 시 | 실패 시 | 만료 기준 |
| --- | --- | --- | --- |
| 원본 리허설 음성 | 유지 | 즉시 삭제 요청 | 없음 |
| 전체 전사 문자열 | 저장하지 않음 | 저장하지 않음 | 처리 종료 시 소멸 |
| 전사 segment | Redis 저장 | 처리 단계에 따라 미저장 가능 | 30분 |
| 리포트 수치·분석 결과 | PostgreSQL 저장 | 실패 정보 저장 | 별도 만료 없음 |
| Evidence Clip | 실제 생성 안 됨 | 해당 없음 | 계약상 7일 |

### 5.2 구현되지 않은 14일 정책

현재 코드에는 다음 요소가 없다.

- 원본 음성 `expires_at`
- 원본 음성 `retention_days = 14`
- 성공 완료 시점부터 14일 뒤를 계산하는 로직
- 14일 뒤 `storage_deletion_outbox`에 등록하는 scheduler
- S3 또는 MinIO lifecycle 14일 규칙
- 전사 전체 또는 segment의 14일 저장소
- 14일 동안 사용할 수 있는 owner-only 조회 API

## 6. 코드와 문서 사이의 불일치

### 6.1 원본 음성 삭제 정책

`docs/contracts.md`는 분석 완료 직후 원본 음성을 삭제한다고 규정한다.

실제 코드는 정상 완료된 원본 음성을 삭제하지 않는다.

영향:

- 개인정보 보관 정책과 실제 데이터 수명이 다르다.
- 운영 저장소 용량이 계속 증가할 수 있다.
- 사용자에게 정확한 삭제 시점을 안내할 수 없다.

### 6.2 전사본 API 정책

`docs/rehearsal-report/backend.md`는 Redis TTL이 살아 있으면 리포트 API가 전사본을 반환한다고 설명한다.

실제 `getReport()`는 항상 다음 값을 반환한다.

```json
{
  "transcriptRetained": false,
  "transcript": null
}
```

영향:

- 문서만 보고 구현한 Web과 API의 기대가 어긋난다.
- 전사본 UI 및 DOCX 다운로드 코드가 정상 API 흐름에서 실행되지 않는다.

### 6.3 업로드 취소와 미완료 파일 정리

리허설이 `created` 또는 `uploading` 상태일 때 `cancelRun()`을 호출할 수 있지만, 이 경로는 연결된 `rehearsal-audio` 삭제를 호출하지 않는다.

영향:

- 업로드된 object 또는 `pending/uploaded` metadata가 남을 수 있다.
- `complete`가 호출되지 않은 pending asset 정리 정책도 아직 후속 과제로 남아 있다.

### 6.4 Evidence Clip 계약과 구현

문제 구간 Evidence Clip은 shared schema와 migration에서 7일 보관으로 정의돼 있다. 하지만 현재 API와 Worker에는 실제 clip 생성, 만료 처리, playback endpoint 구현이 없다.

따라서 현재 `rehearsal_evidence_clips` 계약을 원본 음성 재생 기능으로 사용할 수 없다.

## 7. 음량 분석 구현에 미치는 영향

리허설 `/audio/transcribe`는 원본 음성을 `load_audio_content()`로 한 번 읽고, 같은 `AudioContent`를 STT와 음량 분석 모듈에 전달한다. 오케스트레이션은 `process_rehearsal_audio()`가 담당한다.

```python
audio_content = load_audio_content(payload.audio)

provider_transcription = transcribe_audio_content(audio_content, provider)
volume_analysis = analyze_volume_safely(audio_content)

return RehearsalAudioProcessingResponse(
    **build_audio_transcribe_response(
        payload,
        provider_transcription,
    ).model_dump(),
    volumeAnalysis=volume_analysis,
)
```

이 방식의 장점은 다음과 같다.

- Object Storage 다운로드 1회
- STT와 음량 분석이 같은 원본 바이트 사용
- signed URL 재발급 불필요
- 별도 raw audio 복제 불필요
- 음량 분석 실패가 STT 성공을 막지 않음
- `/audio/transcribe-private`는 기존 STT 전용 동작 유지

다만 음량 분석 구현 전에 다음 정책을 확정해야 한다.

1. 정상 완료된 원본 음성을 정확히 14일 보관할지
2. 전사 segment도 14일 보관할지, 30분을 유지할지
3. 14일 안에 재분석할 때 기존 결과를 사용할지 원본부터 다시 분석할지
4. 사용자에게 원본 전체를 재생할지 문제 구간 Clip만 재생할지
5. 프로젝트 삭제 시 Object Storage까지 확실히 삭제할지
6. 업로드 취소 및 미완료 asset을 언제 정리할지

## 8. 권장 정리 순서

### 1단계: 계약 확정

- 원본 음성 보관 기간을 `14일` 또는 `분석 직후 삭제` 중 하나로 확정한다.
- 전사 데이터는 `전체 원문`, `segment`, `문제 구간 텍스트` 중 무엇을 보관할지 구분한다.
- 원본 음성과 파생 Evidence Clip의 보관 정책을 분리한다.

### 2단계: 원본 음성 retention 구현

- `expires_at` 또는 `raw_audio_delete_deadline_at` 추가
- 성공 시 `완료 시각 + 14일` 저장
- 만료된 asset을 outbox에 등록하는 reconciler 추가
- 취소·미완료 upload cleanup 추가
- project 삭제와 object 삭제 정합성 검증

### 3단계: 전사 계약 정리

- 30분 Redis cache를 유지할지 결정
- API가 전사본을 제공하지 않을 경우 Web의 전사 UI와 DOCX 기능 제거
- API가 제공할 경우 owner-only 접근, TTL, 응답 schema를 명확히 추가
- `docs/rehearsal-report/backend.md`와 실제 `getReport()` 동기화

### 4단계: 음량 분석 연결

- `/audio/transcribe`에서 내려받은 `AudioContent`를 STT와 음량 분석이 재사용한다.
- 음량 분석 실패는 `unmeasured`로 변환해 STT 성공을 막지 않는다.
- `report_json.volumeAnalysis`는 shared schema로 검증한다.
- 원본 음성 URL이나 바이트, waveform, 프레임별 RMS는 report와 로그에 저장하지 않는다.

## 9. 결론

현재 구현은 후속 음성 분석을 위해 정상 완료된 원본 음성을 임시로 남겨둔 상태다. 그러나 보관 만료와 삭제 책임이 정의되어 있지 않아 14일 보관 정책으로 볼 수 없다.

전사 데이터는 별도 파일로 저장하지 않는다. 전체 전사는 처리 중 메모리에서만 사용하고, 타임스탬프가 포함된 segment만 비영속 Redis에 30분 보관한다. 리포트와 리포트 API에서는 전사 원문을 제공하지 않는다.

음량 분석은 현재 남아 있는 원본 음성을 한 번 로드해 STT와 공유하는 구조로 연결됐다. 다만 원본 음성 보관 기간, 전사 segment 수명, 문제 구간 재생 정책은 여전히 별도 계약과 구현이 필요하다.
