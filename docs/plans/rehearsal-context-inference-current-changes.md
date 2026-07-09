# Rehearsal Context Inference 현재 변경 사항 정리

기준 브랜치: `feature/rehearsal-context-inference-yb`  
작성일: `2026-07-09`

## 한 줄 요약

이번 변경은 리허설 화면의 기존 키워드 체크를 넘어서, 슬라이드별로 "발표자가 꼭 말해야 하는 의미 단위"를 추출하고, 실제 STT 발화가 그 의미를 충분히 커버했는지 판단하는 초석을 추가한 작업이다.

핵심은 다음 네 가지다.

1. `slide_context_items` 저장 구조 추가
2. Python worker 기반 컨텍스트 항목 추출 API 추가
3. Web 리허설 화면에 슬라이드별 필수 발화 체크리스트 추가
4. 실시간 리허설 중 STT를 누적해서 컨텍스트 커버 여부를 판정하고, 덜 말한 채 다음 슬라이드로 넘어가려 할 때 경고 표시 추가

## 전체 흐름

```text
Deck slide text + speaker notes
  -> Python worker가 슬라이드별 context item 2~4개 추출
  -> API가 slide_context_items에 저장 / 조회
  -> Web이 현재 슬라이드의 context item 목록 표시
  -> 리허설 중 final STT를 슬라이드별 sliding window로 누적
  -> browser-side embedding으로 context sentence와 유사도 비교
  -> 기준 이상이면 해당 item을 covered 처리
  -> 미커버 상태에서 다음 슬라이드로 이동하면 잠깐 경고 후 이동
```

## 레이어별 변경

### 1. Shared contract

추가 파일:

- `packages/shared/src/rehearsals/slide-context-item.schema.ts`
- `packages/shared/src/index.ts`

추가된 계약:

- `slideContextItemSchema`
- `extractSlideContextItemsRequestSchema`
- `extractSlideContextItemsResponseSchema`
- `listSlideContextItemsResponseSchema`
- `updateSlideContextItemRequestSchema`
- `updateSlideContextItemResponseSchema`

중요 상수:

- `E5_EMBEDDING_DIM = 384`
- `CONTEXT_MATCH_THRESHOLD = 0.8`

의미:

- 슬라이드별 컨텍스트 항목을 shared schema로 고정했다.
- Web, API, Python worker가 같은 item shape를 기준으로 통신하게 됐다.
- 컨텍스트 항목은 `keyword`가 아니라 `label + sentence` 구조다.

항목 shape 요약:

| 필드 | 의미 |
|---|---|
| `itemId` | 항목 UUID |
| `projectId` / `deckId` / `slideId` | 소속 범위 |
| `itemOrder` | 정렬 순서 |
| `label` | 짧은 개념 이름 |
| `sentence` | 발표자가 실제로 전달해야 하는 핵심 문장 |
| `hasEmbedding` | embedding 존재 여부 표현용 필드 |
| `createdAt` / `updatedAt` | 생성/수정 시각 |

### 2. Database / API

추가 및 수정 파일:

- `apps/api/src/database/migrations/2026070901000-CreateSlideContextItems.ts`
- `apps/api/src/database/data-source.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/slide-context/slide-context.module.ts`
- `apps/api/src/slide-context/slide-context.controller.ts`
- `apps/api/src/slide-context/slide-context.service.ts`

새 테이블:

- `slide_context_items`

주요 컬럼:

| 컬럼 | 의미 |
|---|---|
| `item_id` | PK, uuid |
| `project_id` | 프로젝트 기준 scope |
| `deck_id` | 덱 기준 scope |
| `slide_id` | 슬라이드 기준 scope |
| `item_order` | 항목 순서 |
| `label` | 짧은 레이블 |
| `sentence` | 비교 기준 문장 |
| `embedding` | `vector(384)` 컬럼 |
| `created_at` / `updated_at` | 메타데이터 |

노출 API:

| 메서드 | 경로 | 역할 |
|---|---|---|
| `POST` | `/api/v1/projects/:projectId/decks/:deckId/slide-context/extract` | 전체 슬라이드에서 context item 재추출 |
| `GET` | `/api/v1/projects/:projectId/decks/:deckId/slide-context` | 저장된 항목 조회 |
| `PATCH` | `/api/v1/projects/:projectId/slide-context/:itemId` | 레이블/문장 수정 |
| `DELETE` | `/api/v1/projects/:projectId/slide-context/:itemId` | 항목 삭제 |

구조적 포인트:

- 추출은 API가 Python worker로 위임한다.
- 조회/수정/삭제는 현재 Nest API가 DB를 직접 다룬다.
- 수정 시 `sentence`가 바뀌면 DB의 `embedding`은 `NULL`로 초기화한다.

### 3. Python worker

추가 및 수정 파일:

- `services/python-worker/app/slide_context.py`
- `services/python-worker/app/main.py`
- `services/python-worker/tests/test_slide_context.py`

새 역할:

- 슬라이드 본문과 `speaker notes`를 입력으로 받아 슬라이드별 semantic context item을 추출한다.
- 각 슬라이드마다 2~4개의 의미 단위를 JSON으로 받도록 LLM instruction을 정의했다.
- 결과를 `ContextItem` 목록으로 정규화하고, 필요하면 DB에 replace 저장한다.

추출 프롬프트 성격:

- 키워드가 아니라 "발표자가 전달해야 하는 개념/주장" 단위 추출
- `label`: 짧은 명사구
- `sentence`: 발표자가 실제로 말해야 할 핵심 문장
- 구조적 표현보다 내용 위주
- 중복 개념 금지

현재 endpoint:

- `POST /slide-context/extract`
- `PATCH /slide-context/{item_id}`

현재 테스트 범위:

- 입력 텍스트 조립
- API 키 부재 시 `unavailable`
- 빈 slides 시 `skipped`
- 정상 추출
- 여러 슬라이드에서 `item_order` 증가
- 잘못된 JSON 응답 무시
- LLM 예외 시 `failed`
- repository 저장 호출
- label/sentence 길이 제한

### 4. Web 리허설 화면

추가 및 수정 파일:

- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`
- `apps/web/src/features/rehearsal/panel/SlideContextChecklist.tsx`
- `apps/web/src/features/rehearsal/panel/slideContextApi.ts`
- `apps/web/src/features/rehearsal/panel/contextSlidingWindow.ts`
- `apps/web/src/styles.css`

추가된 사용자 기능:

1. 리허설 패널에 `필수 발화 항목` 섹션 추가
2. 항목이 없으면 `항목 추출` 버튼 제공
3. 추출된 항목은 슬라이드별 체크리스트로 표시
4. 각 항목은 수정/삭제 가능
5. 현재 슬라이드에서 몇 개를 커버했는지 `n / total` 표시
6. 다음 슬라이드 이동 시 미커버 항목이 있으면 잠깐 `누락` 강조 후 이동

실시간 판정 방식:

- STT의 `final` 이벤트만 컨텍스트 판정에 사용
- 슬라이드별로 최근 발화를 `300`자 window에 누적
- browser-side semantic embedding으로 window text와 context sentence를 비교
- `dotProduct >= 0.8` 이면 해당 항목을 `covered` 처리

UI 내부 상태 요약:

| 상태 | 의미 |
|---|---|
| `contextItems` | 전체 슬라이드의 context item 목록 |
| `contextItemsLoading` | 초기 조회 중 여부 |
| `contextItemsExtracting` | 재추출 진행 중 여부 |
| `coveredContextItemIds` | 현재 리허설에서 이미 커버된 항목 |
| `exitWarningItemIds` | 다음 슬라이드 이동 직전 누락 경고 표시할 항목 |

## 현재 설계에서 중요한 동작 디테일

### 1. 커버 판정은 슬라이드 단위다

- sliding window는 슬라이드가 바뀌면 초기화된다.
- `coveredContextItemIds`도 리허설 시작 시 초기화된다.
- 현재 슬라이드의 item만 커버 판정 대상이 된다.

### 2. 커버 판정은 "문맥 유사도" 기반이다

- 키워드 hit 여부가 아니라 문장 embedding 유사도를 본다.
- 따라서 대본을 그대로 읽지 않아도 의미가 비슷하면 체크될 수 있다.

### 3. 다음 슬라이드 이동은 완전히 막지 않는다

- 미커버 항목이 있으면 먼저 `누락` 표시를 준다.
- 약 `1.5초` 후 자동으로 이동한다.
- 즉 hard block이 아니라 soft warning이다.

### 4. embedding 컬럼은 준비되어 있지만 아직 완전히 활용되지는 않는다

- DB에는 `embedding vector(384)` 컬럼이 추가됐다.
- 하지만 현재 API의 list 응답은 `hasEmbedding: false`로 내려준다.
- Web은 DB embedding을 쓰지 않고 브라우저에서 context sentence embedding을 직접 계산한다.
- 수정 시 DB embedding은 `NULL`로 비워지지만, 현재 세션에서는 Web이 로컬에서 다시 embedding을 계산해 사용한다.

### 5. item order는 deck 전체 기준으로 증가한다

- 여러 슬라이드를 추출할 때 `item_order`는 슬라이드별로 다시 0부터 시작하지 않는다.
- deck 전체에서 순차 증가한다.
- 화면에서는 `slideId`로 필터링해서 보여주므로 즉시 문제는 없지만, 이 순서를 어떻게 의미화할지는 추후 정리가 필요할 수 있다.

## 지금 변경으로 생긴 사용자 경험

기존:

- "이 슬라이드에서 특정 키워드를 말했는가?" 중심

현재 변경 후:

- "이 슬라이드에서 꼭 전달해야 하는 핵심 의미를 실제로 말했는가?" 중심

즉, 리허설 보조가 단순 단어 체크에서 발표 내용 커버리지 확인으로 한 단계 이동하고 있다.

## 변경 파일 목록

### 수정 파일

- `apps/api/src/app.module.ts`
- `apps/api/src/database/data-source.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`
- `apps/web/src/styles.css`
- `packages/shared/src/index.ts`
- `services/python-worker/app/main.py`

### 신규 파일

- `apps/api/src/database/migrations/2026070901000-CreateSlideContextItems.ts`
- `apps/api/src/slide-context/slide-context.controller.ts`
- `apps/api/src/slide-context/slide-context.module.ts`
- `apps/api/src/slide-context/slide-context.service.ts`
- `apps/web/src/features/rehearsal/panel/SlideContextChecklist.tsx`
- `apps/web/src/features/rehearsal/panel/contextSlidingWindow.ts`
- `apps/web/src/features/rehearsal/panel/slideContextApi.ts`
- `packages/shared/src/rehearsals/slide-context-item.schema.ts`
- `services/python-worker/app/slide_context.py`
- `services/python-worker/tests/test_slide_context.py`

## 빠르게 봐야 할 포인트

이 브랜치를 이어서 작업한다면 우선 확인할 지점은 아래다.

1. 추출 결과의 품질이 실제 발표 피드백에 충분한지
2. `CONTEXT_MATCH_THRESHOLD = 0.8` 이 현업 발표 데이터에서 적절한지
3. DB `embedding` 컬럼을 실제 저장/재사용할지, 아니면 browser-only 계산으로 갈지
4. 수정/삭제 경로를 Python worker와 API 중 어디에 일관되게 둘지
5. exit warning UX를 soft warning으로 유지할지, 명시적 확인으로 바꿀지
