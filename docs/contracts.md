# ORBIT 1차 스프린트 공통 계약

## 목적

1차 스프린트에서는 구현 토론보다 팀 전체가 같은 데이터 모양과 연결 기준으로 개발하는 것이 우선이다. 이 문서는 편집기, AI 생성, 파일 업로드, Job, WebSocket, E2E 흐름에서 공통으로 사용할 계약을 정의한다.

확정 원칙:

- 1차 스프린트에서는 ORBIT-8, ORBIT-9를 제외한다.
- 로그인/회원가입 없이 임시 사용자와 데모 프로젝트로 진행한다.
- 공통 구조가 바뀌면 반드시 전원에게 공유한다.
- API, WebSocket, Job, Deck 구조는 shared schema로 옮길 수 있게 작성한다.

## Deck JSON 구조

덱의 원본 데이터는 Konva 상태가 아니라 deck JSON이다. 편집기, AI 생성, 협업, 발표, 리허설은 모두 이 deck JSON을 기준으로 연결한다.

```json
{
  "deckId": "deck_demo_1",
  "projectId": "project_demo_1",
  "title": "Demo Deck",
  "version": 1,
  "slides": [
    {
      "slideId": "slide_1",
      "order": 1,
      "title": "Opening",
      "thumbnailUrl": "/files/thumbnails/slide_1.png",
      "speakerNotes": "발표자 노트",
      "keywords": [
        {
          "keywordId": "kw_1",
          "text": "ORBIT",
          "synonyms": ["발표 도우미"],
          "abbreviations": []
        }
      ],
      "elements": [
        {
          "elementId": "element_1",
          "type": "text",
          "x": 120,
          "y": 80,
          "width": 480,
          "height": 120,
          "props": {
            "text": "ORBIT",
            "fontSize": 48
          },
          "animations": [
            {
              "animationId": "animation_1",
              "type": "fade-in",
              "order": 1
            }
          ]
        }
      ]
    }
  ]
}
```

결정 사항:

- 슬라이드 식별자는 `slideId`, 객체 식별자는 `elementId`로 통일한다.
- 좌표 단위는 `px` 기준으로 한다.
- AI 생성 결과도 최종적으로 deck JSON으로 변환한다.
- 리허설은 `speakerNotes`, `keywords.text`, `keywords.synonyms`, `keywords.abbreviations`를 기준으로 연결한다.
- 협업/발표 동기화는 `slideId`, `elementId`, `animationId` 기준으로 처리한다.

## 파일 업로드 결과 구조

파일 업로드는 공통 API로 제공하고, 각 기능은 `fileId`와 `purpose`를 기준으로 업로드 결과를 사용한다.

```json
{
  "fileId": "file_1",
  "projectId": "project_demo_1",
  "originalName": "sample.pptx",
  "mimeType": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "size": 1024000,
  "url": "/uploads/file_1",
  "purpose": "pptx-import",
  "createdAt": "2026-06-27T01:00:00+09:00"
}
```

`purpose` 값:

- `pptx-import`
- `reference-material`
- `rehearsal-audio`
- `export-result`
- `report-result`
- `thumbnail`

결정 사항:

- 업로드 후 API 응답은 위 구조로 통일한다.
- PPTX import, 참고자료 추출, 리허설 STT는 모두 `fileId`를 받아 시작한다.
- `url`은 임시로 로컬 경로를 쓰되, 이후 S3 signed URL로 교체할 수 있게 유지한다.

## Job 상태 구조

PPTX import/export, 참고자료 추출, AI 생성, 리허설 STT, 최종 보고서는 모두 동일한 Job 구조를 사용한다.

```json
{
  "jobId": "job_1",
  "projectId": "project_demo_1",
  "type": "pptx-import",
  "status": "queued",
  "progress": 0,
  "message": "작업 대기 중",
  "result": null,
  "error": null,
  "createdAt": "2026-06-27T01:00:00+09:00",
  "updatedAt": "2026-06-27T01:00:00+09:00"
}
```

`status` 값:

- `queued`
- `running`
- `succeeded`
- `failed`

`type` 값:

- `pptx-import`
- `deck-export`
- `reference-extract`
- `ai-deck-generation`
- `rehearsal-stt`
- `final-report-generation`
- `report-pdf-export`

결정 사항:

- 오래 걸리는 작업은 전부 Job으로 처리한다.
- 프론트는 `jobId`로 진행률을 조회한다.
- 성공 결과는 `result`, 실패 이유는 `error`에 넣는다.

## WebSocket 이벤트 구조

실시간 협업과 발표 동기화는 WebSocket 공통 envelope을 사용하고, 이벤트별 `payload`는 shared schema로 검증한다.

```json
{
  "type": "slide-changed",
  "roomId": "project_demo_1",
  "sessionId": "session_demo_1",
  "userId": "user_demo_1",
  "payload": {
    "deckId": "deck_demo_1",
    "slideId": "slide_1",
    "slideIndex": 0
  },
  "sentAt": "2026-06-27T01:00:00+09:00"
}
```

최소 이벤트:

- `project-joined`
- `deck-updated`
- `slide-changed`
- `highlight-changed`
- `presentation-started`
- `audience-joined`
- `question-created`
- `poll-voted`
- `survey-submitted`

결정 사항:

- `roomId`는 `projectId` 기준으로 시작한다.
- 발표 세션은 `sessionId`로 구분한다.
- `slide-changed` payload에는 `deckId`, `slideId`, `slideIndex`를 넣는다.
- `highlight-changed` payload에는 `slideId`, `elementId`, `state`를 넣는다.

## E2E 체크리스트

- [ ] [1번] 프로젝트 생성 가능
- [ ] [1번] PPTX 또는 참고자료 파일 업로드 가능
- [ ] [2번] PPTX 파일을 편집 가능한 덱으로 가져오기 가능
- [ ] [2번] 슬라이드 목록과 캔버스 표시 가능
- [ ] [2번] 텍스트/객체 수정 후 저장/복원 가능
- [ ] [3번] 참고자료 텍스트 추출 가능
- [ ] [3번] 참고자료 기반 AI 덱 생성 가능
- [ ] [3번] AI 제안을 기존 덱에 적용 가능
- [ ] [4번] 다른 브라우저에서 같은 덱 접속 가능
- [ ] [4번] 한쪽 편집 내용이 다른 쪽에 동기화됨
- [ ] [5번] 슬라이드별 발표 키워드 편집 가능
- [ ] [5번] 리허설 녹음/STT 가능
- [ ] [5번] 기본 리허설 보고서 확인 가능
- [ ] [4번] 발표 세션 생성 가능
- [ ] [4번] 청중 입장 가능
- [ ] [4번] 현재 슬라이드가 청중 화면에 동기화됨
- [ ] [4번] 강조/애니메이션 상태가 청중 화면에 반영됨
- [ ] [5번] 청중 질문 등록 가능
- [ ] [5번] 라이브 투표 참여 가능
- [ ] [5번] 질문/투표/세션 로그 기반 최종 보고서 확인 가능
- [ ] [전원] 처음부터 끝까지 한 번의 데모 흐름으로 이어짐

E2E 시작점은 로그인부터가 아니라 임시 사용자 기반 프로젝트 생성부터다.

## 미해결 질문과 담당자

미확정 항목이 생기면 아래 형식으로 기록하고, 결정 시각과 담당자를 반드시 남긴다.

| 항목 | 담당자 | 결정 시각 | 상태 | 결정 내용 |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |
