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
  "metadata": {
    "language": "ko",
    "locale": "ko-KR"
  },
  "canvas": {
    "preset": "wide-16-9",
    "width": 1920,
    "height": 1080,
    "aspectRatio": "16:9"
  },
  "theme": {
    "name": "Default",
    "fontFamily": "Inter",
    "backgroundColor": "#ffffff",
    "textColor": "#111827",
    "accentColor": "#2563eb"
  },
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
          }
        }
      ],
      "animations": [
        {
          "animationId": "animation_1",
          "elementId": "element_1",
          "type": "fade-in",
          "order": 1,
          "durationMs": 400,
          "delayMs": 0,
          "easing": "ease-out"
        }
      ]
    }
  ]
}
```

결정 사항:

- DeckSchema 최상위 필드는 `deckId`, `projectId`, `title`, `version`, `metadata`, `canvas`, `theme`, `slides`로 구성한다.
- `deckId`, `projectId`, `title`, `version`, `canvas`, `slides`는 필수로 검증한다.
- `metadata`, `theme`는 생성 입력에서 생략할 수 있지만, schema parse 후 normalized Deck JSON에는 항상 포함한다.
- `width`, `height`는 top-level에 두지 않고 반드시 `canvas.width`, `canvas.height`로 둔다.
- 지원하는 deck canvas preset은 `wide-16-9`와 `standard-4-3`이다.
- `wide-16-9`는 `1920x1080`, `standard-4-3`은 `1024x768`만 허용한다.
- `aspectRatio`는 preset에 맞는 문자열 literal로 검증한다.
- 모바일 세로형 `1080x1920`은 1차 스프린트 계약에 포함하지 않고, 필요 시 `portrait-9-16` preset으로 추가한다.
- `metadata.language`는 `"ko"`만 허용한다.
- `metadata.locale`은 `"ko-KR"`만 허용한다. STT, 날짜/시간, 지역별 포맷이 필요한 기능은 `locale`을 기준으로 처리한다.
- `metadata.language`와 `metadata.locale`은 생략 시 각각 `"ko"`, `"ko-KR"`로 기본값을 채운다.
- `theme`는 생략 시 `Default`, `Inter`, `#ffffff`, `#111827`, `#2563eb` 기본값으로 채운다.
- `slides`는 최소 1개 이상이어야 한다. 새 덱 생성 시에는 빈 덱 대신 기본 슬라이드 1장을 생성한다.
- SlideSchema 필드는 `slideId`, `order`, `title`, `thumbnailUrl`, `speakerNotes`, `elements`, `keywords`, `animations`를 유지한다.
- `order`는 사용자에게 보이는 슬라이드 번호와 맞춰 `1`부터 시작하는 양의 정수로 관리한다. 배열 index가 필요하면 애플리케이션 내부에서 `order - 1`로 변환한다.
- 1차 스프린트 MVP에서는 슬라이드별 크기 override를 허용하지 않는다. 모든 슬라이드는 deck top-level의 `canvas` 크기와 비율을 따른다.
- SlideSchema에는 `width`, `height`, `canvas`, `aspectRatio` 같은 슬라이드별 크기 필드를 두지 않는다.
- 슬라이드 식별자는 `slideId`, 객체 식별자는 `elementId`로 통일한다.
- 좌표 단위는 `px` 기준으로 한다.
- 지원하는 객체 타입은 `text`, `rect`, `ellipse`, `line`, `arrow`, `polygon`, `star`, `ring`, `image`, `group`, `customShape`, `chart`이다.
- 기존 임시 타입인 `shape`, `video`는 1차 스프린트 deck schema에서 허용하지 않는다.
- 객체 `props`는 object type별 schema로 검증한다. 전체 객체에 대해 `z.record(z.unknown())`를 열어두지 않는다.
- `text.props`는 `text`, `fontFamily`, `fontSize`, `fontWeight`, `color`, `align`, `verticalAlign`, `lineHeight`를 사용한다.
- `image.props`는 `src`, `alt`, `fit`을 사용하고, `fit`은 `contain`, `cover`, `stretch`만 허용한다.
- `chart.props`는 `chart.schema.ts`의 chart schema를 그대로 사용한다.
- `rect`, `ellipse`, `line`, `arrow`, `polygon`, `star`, `ring`은 공통 shape props인 `fill`, `stroke`, `strokeWidth`, `borderRadius`, `shadow`를 사용한다.
- `customShape.props`만 MVP 확장 지점으로 `record unknown`을 허용한다.
- `group.props`는 `childElementIds`만 가진다.
- group은 child element를 직접 중첩하지 않는다. 실제 child element는 `slide.elements` flat list에 그대로 두고, group은 `childElementIds`로 묶음 관계만 표현한다.
- group의 child element 좌표는 group-local 좌표가 아니라 slide canvas 기준 절대 좌표로 유지한다.
- 객체 좌표 `x`, `y`는 `0` 이상이어야 하고, `width`, `height`는 `0`보다 커야 한다.
- 1차 스프린트 MVP에서는 객체 기준점이 음수 좌표가 되는 것까지만 금지한다.
- `x + width > canvas.width`, `y + height > canvas.height`처럼 객체가 오른쪽/아래쪽으로 캔버스 밖에 일부 노출되는 경우는 현재 schema에서 막지 않는다.
- 캔버스 밖 일부 노출을 완전히 금지할지는 PPTX import/export 구현 중 실제 잘림, 누락, 위치 보정 필요성을 확인한 뒤 다시 결정한다.
- 객체 공통 상태 필드는 `rotation`, `opacity`, `zIndex`, `locked`, `visible`을 사용한다.
- `opacity`는 `0`부터 `1`까지만 허용하고, `zIndex`는 `0` 이상의 정수만 허용한다.
- `chart` 객체의 `props`는 `chart.schema.ts`로 검증하며, 지원하지 않는 chart type은 거부한다.
- 지원하는 chart type은 `bar`, `line`, `pie`, `doughnut`, `scatter`이다.
- 모든 chart type은 사용자가 빈 차트에서 직접 데이터를 채울 수 있도록 `data: []`를 허용한다.
- `bar`, `line`의 data는 `{ label, value }[]` 구조를 사용하고, `value`는 음수와 양수를 모두 포함한 finite number만 허용한다.
- `pie`, `doughnut`의 data는 `{ label, value }[]` 구조를 사용하고, `value`는 `0` 이상의 finite number만 허용한다.
- `scatter`의 data는 `{ label?, x, y }[]` 구조를 사용하고, `x`, `y`는 finite number만 허용한다.
- chart 디자인 필드는 `style.colors`, `style.backgroundColor`, `style.textColor`, `style.showLegend`, `style.legendPosition`, `style.showDataLabels`, `style.showGrid`, `style.xAxisTitle`, `style.yAxisTitle`, `style.unit`을 사용한다.
- multi-series chart 구조는 1차 스프린트 MVP 계약에 포함하지 않고, import/export와 편집 UI 구현 중 필요성이 확인되면 별도 확장한다.
- 지원하는 애니메이션 타입은 `appear`, `disappear`, `fade-in`, `fade-out`, `zoom-in`, `zoom-out`, `rotate`이다.
- `slide-in`, `none`은 1차 스프린트 MVP animation type에 포함하지 않는다. animation이 없으면 animation 객체를 만들지 않는다.
- 애니메이션은 element 단위를 기본으로 하고, `slide.animations` flat list에 저장한다.
- `element.animations`에는 저장하지 않는다.
- 각 animation은 `elementId`를 필수로 가지고 대상 객체를 참조한다. slide 단위 animation은 1차 스프린트 MVP에서 제외한다.
- animation `order`는 `1`부터 시작하는 양의 정수로 관리한다.
- `durationMs`, `delayMs`, `easing`은 입력에서 생략할 수 있지만, schema parse 후 normalized Deck JSON에는 각각 `400`, `0`, `"ease-out"` 기본값으로 포함한다.
- `easing`은 `linear`, `ease-in`, `ease-out`, `ease-in-out`만 허용한다.
- 밑줄 애니메이션은 1차 스프린트 MVP가 아니라 폴리싱 범위로 둔다.
- AI 생성 결과도 최종적으로 deck JSON으로 변환한다.
- 리허설은 `speakerNotes`, `keywords.text`, `keywords.synonyms`, `keywords.abbreviations`를 기준으로 연결한다.
- 협업/발표 동기화는 `slideId`, `elementId`, `animationId` 기준으로 처리한다.

구현 위치:

- `packages/shared/src/deck/deck.schema.ts`: deck, slide, keyword schema와 타입
- `packages/shared/src/deck/slide-object.schema.ts`: slide element schema와 element type
- `packages/shared/src/deck/animation.schema.ts`: animation schema와 animation type
- `packages/shared/src/deck/chart.schema.ts`: chart object props에서 사용할 chart schema
- `packages/shared/src/deck/theme.schema.ts`: deck/theme 기본 schema
- `packages/shared/src/index.ts`: shared public export만 담당

ORBIT-14 진행 중에는 위 구현 위치를 기준으로 계약을 변경한다. schema 파일의 의미와 유지보수 규칙은 `packages/shared/src/README.md`를 따른다.

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

구현 위치:

- `packages/shared/src/files/file.schema.ts`

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

구현 위치:

- `packages/shared/src/jobs/job.schema.ts`

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

구현 위치:

- `packages/shared/src/realtime/websocket.schema.ts`

## Shared schema 파일 배치 원칙

`packages/shared`는 프론트엔드, API, worker, realtime, AI 패키지가 함께 사용하는 런타임 계약을 관리한다.

원칙:

- `packages/shared/src/index.ts`에는 구현을 두지 않고 export만 둔다.
- 새 공통 schema는 기능 영역별 폴더에 둔다.
- deck 편집과 직접 관련된 계약은 `packages/shared/src/deck`에 둔다.
- 파일 업로드 계약은 `packages/shared/src/files`에 둔다.
- Job 계약은 `packages/shared/src/jobs`에 둔다.
- WebSocket event 계약은 `packages/shared/src/realtime`에 둔다.
- 발표/리허설/보고서 계약은 `packages/shared/src/presentation`에 둔다.
- schema를 변경하면 이 문서와 `packages/shared/src/README.md`도 함께 갱신한다.

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
