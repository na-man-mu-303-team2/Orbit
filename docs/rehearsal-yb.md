# 리허설 문맥 커버리지 판정 (rehearsal-yb)

브랜치: `feature/rehearsal-context-inference-yb`
작성: 2026-07-10

---

## 1. 한 줄 요약

슬라이드별로 "발표자가 꼭 말해야 하는 의미 단위(context item)"를 LLM으로 추출하고, 실시간 STT 발화를 슬라이딩 윈도우에 누적한 뒤 세 가지 매칭 방식(substring → Dice → semantic)으로 커버 여부를 판정하며, 발표자 대본 내 현재 위치를 문자 오프셋으로 실시간 추적한다.

---

## 2. 전체 흐름

```
[슬라이드 본문 + 발표자 대본]
        │
        ▼
  POST /slide-context/extract  (NestJS API)
        │   projectId/deckId 검증 후
        ▼
  POST /slide-context/extract  (Python worker)
        │   슬라이드당 LLM 1호출 (OpenAI Responses API)
        │   JSON 후처리 → ContextItem 목록
        ▼
  slide_context_items 테이블 (upsert: deck 전체 DELETE → INSERT)
        │
        ▼
  GET /slide-context  (NestJS API) → Web 리허설 패널
        │   필수 발화 항목 체크리스트 렌더링
        ▼
  [리허설 진행]
  STT final 이벤트 → contextSlidingWindow (300자 슬라이드별 ring buffer)
        │
        ▼
  contextCoverageMatcher
    1) substring 검사
    2) Dice 계수 + word recall
    3) E5 semantic embedding (browser-side, Xenova/multilingual-e5-small)
        │
        ├─ matched → coveredContextItemIds 에 추가
        │            RehearsalContextCoverageDecision 기록
        └─ 슬라이드 이동 시 미커버 항목 있으면
           exitWarningItemIds 설정 → 1.5 s 후 이동 (soft warning)
        │
        ▼
  리허설 종료 시 contextCoverageDecisions를
  rehearsal_runs.meta_json 에 저장 (PATCH /api/v1/rehearsals/:runId/meta)
```

**추가된 두 병렬 추적 흐름 (최신 커밋)**

```
[STT 모든 결과 (interim + final)]
  │
  ├─ scriptProgressTracker.acceptResult()
  │    발표자 대본과 문자·단어 레벨 fuzzy 매칭
  │    → charOffset / ratio / confidence 업데이트
  │    → SpeechTrackerSnapshot.scriptProgress 에 포함
  │    → RehearsalPanel 헤더: "의미 XX% · 원문 XX%" 표시
  │
  └─ contextPhrases → buildSpeechTrackingBiasPhrases()
       context item의 sentence를 STT 편향 문구로 등록
       (weight: 0.88, source: "context-item")
       → Sherpa/WebSpeech STT가 해당 어구를 우선 인식
```

---

## 3. 아키텍처

### 3-1. 서비스 경계

```
┌──────────────────────────────────────────┐
│  apps/web  (Vite + React)                │
│  · SlideContextChecklist.tsx             │
│  · contextSlidingWindow.ts               │
│  · contextCoverageMatcher.ts             │
│  · contextCoverageMeta.ts                │
│  · e5EmbeddingService.ts  (WASM)         │
│  · slideContextApi.ts  (fetch)           │
│  · scriptProgressTracker.ts  ← NEW       │
│  · speechBiasPhrases.ts  ← NEW          │
└─────────────┬────────────────────────────┘
              │  HTTPS / Cookie 세션
┌─────────────▼────────────────────────────┐
│  apps/api  (NestJS)                      │
│  · SlideContextController                │
│  · SlideContextService                   │
│    - Python worker 위임 (추출)            │
│    - DB 직접 (조회/수정/삭제)             │
└──────┬──────────────────┬────────────────┘
       │ PostgreSQL        │ HTTP
       │                   │
┌──────▼──┐   ┌───────────▼──────────────┐
│  DB     │   │  services/python-worker  │
│ (pgvector│   │  (FastAPI)               │
│ vector)  │   │  · slide_context.py      │
└──────────┘   │    OpenAI Responses API  │
               └──────────────────────────┘
```

### 3-2. packages/shared 계약 위치

`packages/shared/src/rehearsals/slide-context-item.schema.ts`

Web, API, Python worker 세 레이어가 이 스키마를 공통 기준으로 사용한다.

---

## 4. ERD / 스키마

### 4-1. slide_context_items 테이블

migration: `apps/api/src/database/migrations/2026070901000-CreateSlideContextItems.ts`

```sql
CREATE TABLE slide_context_items (
  item_id     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  text        NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  deck_id     text        NOT NULL,
  slide_id    text        NOT NULL,
  item_order  integer     NOT NULL DEFAULT 0,
  label       text        NOT NULL,          -- 짧은 명사구 (≤ 200자)
  sentence    text        NOT NULL,          -- 비교 기준 문장 (≤ 1000자)
  embedding   vector(384),                   -- multilingual-e5-small dim (현재 NULL)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slide_context_items_project_deck_slide
  ON slide_context_items (project_id, deck_id, slide_id);

CREATE INDEX idx_slide_context_items_project_deck
  ON slide_context_items (project_id, deck_id);
```

**설계 포인트**

| 항목 | 내용 |
|---|---|
| item_order | deck 전체 기준 단조 증가. 슬라이드별 0-reset 없음 |
| embedding | pgvector vector(384) 컬럼 준비됨. 현재 API는 hasEmbedding: false 반환 |
| sentence 수정 | PATCH 시 embedding = NULL 자동 초기화 |
| 추출 교체 | 추출 시 deck 단위 DELETE → INSERT (atomic transaction) |

### 4-2. rehearsal_runs.meta_json (JSONB)

리허설 종료 시 커버리지 판정 결과를 `meta_json.contextCoverageDecisions` 배열에 저장한다.

스키마 위치: `packages/shared/src/rehearsals/rehearsal.schema.ts`

```typescript
// RehearsalContextCoverageDecision
{
  itemId:            string (uuid)
  slideId:           string
  label:             string           // 표시용 레이블
  status:            "covered" | "missed"
  method:            "substring" | "dice" | "semantic" | "none"
  lexicalOverlap:    number [0, 1]    // 단어 다중집합 recall
  semanticSimilarity: number [-1, 1]  // E5 dot product
  strength:          number [0, 1]    // 매칭 강도 (method별 대표값)
  at:                ISO 8601 string
}
```

`meta_json` 전체 구조:

```typescript
{
  slideTimeline:           { slideId, enteredAt }[]
  missedKeywords:          { slideId, keywordId }[]
  adviceEvents:            { type, at }[]
  utteranceOutcomes:       RehearsalUtteranceOutcome[]
  contextCoverageDecisions: RehearsalContextCoverageDecision[]
}
```

---

## 5. API 명세

### NestJS API (apps/api)

| 메서드 | 경로 | 역할 | 권한 |
|---|---|---|---|
| POST | `/api/v1/projects/:projectId/decks/:deckId/slide-context/extract` | 전체 슬라이드 context item 재추출 | write |
| GET  | `/api/v1/projects/:projectId/decks/:deckId/slide-context` | 저장된 항목 조회 | read |
| PATCH | `/api/v1/projects/:projectId/slide-context/:itemId` | label/sentence 수정 | write |
| DELETE | `/api/v1/projects/:projectId/slide-context/:itemId` | 항목 삭제 (204) | write |

**POST extract 요청 바디**

```json
{
  "projectId": "project_abc",
  "deckId": "deck_xyz",
  "slides": [
    {
      "slideId": "slide_1",
      "slideText": "Redis 도입으로 응답 속도 개선",
      "speakerNotes": "기존 방식의 병목 문제와 해결책을 설명"
    }
  ]
}
```

**GET list 응답**

```json
{
  "items": [
    {
      "itemId": "uuid",
      "projectId": "...",
      "deckId": "...",
      "slideId": "slide_1",
      "itemOrder": 0,
      "label": "성능 병목",
      "sentence": "기존 방식은 요청 폭증 시 응답 지연이 발생합니다.",
      "hasEmbedding": false,
      "createdAt": "2026-07-09T00:00:00.000Z",
      "updatedAt": "2026-07-09T00:00:00.000Z"
    }
  ]
}
```

### Python worker (services/python-worker)

| 메서드 | 경로 | 역할 |
|---|---|---|
| POST | `/slide-context/extract` | LLM 추출 → ContextItem 목록 반환 |

응답 상태:
- `succeeded` → 200 + items 배열
- `skipped` → 200 + items: []
- `unavailable` / `failed` → 503

---

## 6. 추출 알고리즘 (Python worker)

### 6-1. LLM 프롬프트 설계

모델: OpenAI (config.openai_model, 기본 `gpt-4.1-mini`)
API: OpenAI Responses API (`client.responses.create`)
응답 형식: JSON Schema structured output (strict: true)

**System instruction 요약**

```
한국어 발표 코치 역할.
슬라이드 본문 + 발표자 대본을 받아
발표자가 반드시 전달해야 하는 의미 단위를 2-4개 추출.

출력 규칙:
- "items" 배열 (JSON)
- label: 짧은 한국어 명사구 (≤ 30자)
- sentence: 발표자가 주장해야 할 핵심 문장 1-2개 (≤ 150자)
- 구조어 ("첫 번째로" 등) 제외, 내용 중심
- 개념 중복 금지
- 내용 없는 슬라이드 → items: []
```

**입력 포맷**

```
[슬라이드 본문]
{slide_text}

[발표자 대본]
{speaker_notes}
```

슬라이드당 LLM 호출 1회. 여러 슬라이드는 순차 반복.

### 6-2. 후처리 파이프라인

```
LLM JSON 응답
  └─ json.loads 실패 → 해당 슬라이드 skip (status는 succeeded 유지)
  └─ items 배열 순회
       ├─ label: compact_meaningful_phrases() → 의미 없는 구조어 제거
       ├─ sentence: 공백 정규화, ≤ 1000자 슬라이싱
       ├─ _has_meaningful_sentence_content() 4자 미만 또는 의미 없음 → skip
       └─ (label.casefold(), sentence.casefold()) 중복 제거 (set)
  └─ item_order: deck 전체 단조 증가 카운터
  └─ item_id: uuid4() 신규 생성
```

### 6-3. 상수

| 상수 | 값 | 위치 |
|---|---|---|
| `E5_EMBEDDING_DIM` | 384 | packages/shared/src/rehearsals/slide-context-item.schema.ts |
| `CONTEXT_MATCH_THRESHOLD` | 0.8 | 위 동일 |
| `CONTEXT_WINDOW_CHARS` | 300 | contextSlidingWindow.ts |

---

## 7. 커버리지 판정 알고리즘 (browser)

### 7-1. STT 슬라이딩 윈도우

파일: `apps/web/src/features/rehearsal/panel/contextSlidingWindow.ts`

- STT의 `final` 이벤트만 처리 (interim 무시)
- 슬라이드 전환 시 버퍼 초기화 (새 슬라이드의 첫 발화부터 시작)
- 버퍼 최대 300자. 초과 시 뒤에서 300자만 유지

```typescript
appendToContextWindow(window, slideId, finalText)
// slideId 바뀌면 → { slideId, buffer: finalText.slice(-300) }
// 같은 슬라이드  → buffer = (prev + " " + finalText).slice(-300)
```

### 7-2. 세 단계 매칭

파일: `apps/web/src/features/rehearsal/panel/contextCoverageMatcher.ts`

**후보 윈도우 생성**

transcript window에서 단어를 하나씩 앞에서 제거해 suffix window들을 최대 12개 생성.
최소 단어 수 4개 미만 suffix는 제외.

```
"A B C D E F" → ["A B C D E F", "B C D E F", "C D E F", ...]
```

각 context item에 대해 아래 순서로 판정:

| 우선순위 | 방법 | 임계값 | 설명 |
|---|---|---|---|
| 1 | **substring** | — | item sentence가 transcript에 문자열로 포함 |
| 2 | **Dice** | score ≥ 0.78 AND word recall ≥ 0.5 | Dice 계수 + 단어 다중집합 recall 복합 조건 |
| 3 | **semantic** | E5 similarity ≥ 0.84 AND word recall ≥ 0.2 | embedding dot product + 최소 어휘 앵커 |

모두 미달 → `method: "none"`, `matched: false`

**selectBestContextItemMatch**: 한 번의 STT final 이벤트에서 여러 item이 동시에 매칭되면 priority(substring > dice > semantic) → strength → lexicalOverlap → itemId 순서로 가장 강한 항목 하나만 선택.

### 7-3. Embedding 서비스

파일: `apps/web/src/features/rehearsal/speech/e5EmbeddingService.ts`

- 모델: `Xenova/multilingual-e5-small` (HuggingFace Transformers.js WASM)
- 차원: 384
- 쿼리 접두사: `"query: "` (transcript window)
- 문서 접두사: `"passage: "` (context sentence)
- 풀링: mean, L2 normalize
- 모델은 singleton으로 lazy-load (첫 사용 시 WASM 다운로드)
- 브라우저 캐시 활성화 (`env.useBrowserCache = true`)

DB의 `embedding` 컬럼은 준비되어 있으나 현재 미활용. Web이 매 세션마다 브라우저에서 직접 계산.

### 7-4. 커버리지 결정 저장

파일: `apps/web/src/features/rehearsal/panel/contextCoverageMeta.ts`

- `appendCoveredContextDecision`: 같은 itemId는 중복 기록 안 함 (첫 covered만 기록)
- `mergeRunMetaWithContextCoverage`: 리허설 종료 시 미커버 항목을 `status: "missed"`로 채워 완성
- 결과는 `rehearsal_runs.meta_json.contextCoverageDecisions`에 저장

---

## 8. 원문 대본 진행 추적기 (scriptProgressTracker)

파일: `apps/web/src/features/rehearsal/speech/scriptProgressTracker.ts`

### 8-1. 역할

발표자 대본(speakerNotes) 전체 텍스트에서 현재 발화가 어느 위치까지 도달했는지 문자 오프셋으로 실시간 추적한다. STT interim/final 결과를 모두 받아 처리한다.

### 8-2. 알고리즘

```
STT result (text, isFinal)
  │
  ├─ normalizeSourceText(result.text) → spoken
  ├─ remainingSource = source[segmentBaseOffset:]
  │
  ├─ characterLevelMatch(remainingSource, spoken)
  │    · 한 글자씩 비교, 최대 3자 skip으로 재동기화
  │    → lastMatchedSourceIndex (문자 수)
  │
  ├─ wordLevelMatch(remainingSource, spoken)
  │    · 단어 단위 fuzzy match
  │    · isFuzzyWordMatch: 접두사 공유 / 편집거리 기반
  │    → 매칭된 누적 문자 수
  │
  ├─ matchedCharacters =
  │    |char - word| ≤ 20 → average
  │    |char - word| > 20 → min(char, word)  (보수적)
  │
  ├─ candidate = segmentBaseOffset + matchedCharacters
  │
  ├─ candidate > committedOffset ?
  │    └─ recentCandidates 최대 3개 유지
  │         hasAgreement (≥2개가 ±10자 이내) OR isSmallStep (≤15자)
  │           → committedOffset = candidate, confidence = "confirmed"
  │           else → confidence = "candidate"
  │
  └─ isFinal → segmentBaseOffset = committedOffset, recentCandidates 초기화
```

### 8-3. 상수

| 상수 | 값 | 의미 |
|---|---|---|
| `MATCH_RESULT_TOLERANCE` | 20 | 문자/단어 매칭 결과 차이 허용치 |
| `AGREEMENT_TOLERANCE` | 10 | 합의 판정 허용 오차 (문자) |
| `SMALL_FORWARD_STEP` | 15 | 소 전진은 즉시 확정하는 임계값 |
| `RECENT_CANDIDATE_LIMIT` | 3 | 합의 판정에 사용하는 최근 후보 수 |

### 8-4. 출력 타입

```typescript
type ScriptProgressSnapshot = {
  charOffset:  number;                         // 현재 확정 위치 (문자 수)
  totalChars:  number;                         // 대본 전체 문자 수
  ratio:       number;                         // charOffset / totalChars [0, 1]
  confidence:  "none" | "candidate" | "confirmed";
};
```

`confidence` 상태:
- `none`: 발화 없음 또는 초기화 직후
- `candidate`: 위치 추정됐으나 합의 미달 (interim 결과 반영 전)
- `confirmed`: 합의 또는 소 전진으로 확정

### 8-5. SpeechTracker 통합

`speechTracker.ts`가 `createScriptProgressTracker`를 내부에 생성하고, `acceptResult` 호출마다 진행 상태를 갱신한다. `snapshot()` 결과의 `scriptProgress` 필드로 노출된다.

슬라이드 전환(`resetForSlideVisit`) 시 `scriptProgressTracker.reset()`도 함께 호출해 새 슬라이드 대본 시작점으로 초기화한다.

---

## 9. STT 편향 문구 통합 (speechBiasPhrases)

파일: `apps/web/src/features/rehearsal/speech/speechBiasPhrases.ts`

### 9-1. 역할

context item의 `sentence`를 STT 엔진(Sherpa / WebSpeech)의 편향 문구 목록에 등록해, 해당 어구를 인식할 때 우선순위를 높인다.

### 9-2. 편향 예산과 우선순위

`buildSpeechTrackingBiasPhrases`가 총 예산(budget) 내에서 아래 순서로 채운다:

| 순위 | source | weight | 설명 |
|---|---|---|---|
| 1 | `control-phrase` | 1.00 | 제어 명령어 ("다음", "이전" 등) |
| 2 | `final-trigger` | 0.98 | 대본 종결 트리거 문구 |
| 3 | `cue-trigger` | 0.96 | 슬라이드 전환 큐 |
| 4 | `keyword` | 0.94 | 발표 키워드 |
| 5 | `synonym` | 0.92 | 키워드 동의어 |
| 6 | `abbreviation` | 0.90 | 키워드 약어 |
| **7** | **`context-item`** | **0.88** | **context item sentence** ← 이번 변경 |
| 8 | `representative-phrase` | 0.75 | 대표 발화 |
| 9 | `legacy` | 0.45 | 슬라이드 제목·본문 텍스트 |

중복 문구는 정규화(`normalizeSpeechText`) 후 set으로 제거.

### 9-3. RehearsalWorkspace 연결

`buildP3SessionSlides`가 슬라이드 객체를 생성할 때 해당 슬라이드의 context item sentence들을 `contextPhrases` 필드로 넘긴다:

```typescript
contextPhrases: contextItems
  .filter((item) => item.slideId === slide.slideId)
  .map((item) => item.sentence)
```

P3 리허설 세션은 이를 `buildBiasPhrasesForSlide`에 전달해 STT 편향 목록을 구성한다.

---

## 10. UI 진행률 표시

리허설 패널 헤더에서 두 지표를 동시에 표시한다.

```
의미 72% · 원문 45%
```

- **의미 %**: `SpeechTrackerSnapshot.effectiveCoverage × 100` (발표자 대본 문장 의미 커버리지)
- **원문 %**: `SpeechTrackerSnapshot.scriptProgress.ratio × 100` (문자 오프셋 기반 진행률)

파일: `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`

---

## 12. UI 상태 모델

파일: `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

| 상태 | 타입 | 의미 |
|---|---|---|
| `contextItems` | `SlideContextItem[]` | 전체 덱의 context item 목록 |
| `contextItemsLoading` | `boolean` | 초기 GET 중 |
| `contextItemsExtracting` | `boolean` | 재추출 진행 중 |
| `coveredContextItemIds` | `Set<string>` | 현재 세션에서 커버된 itemId |
| `exitWarningItemIds` | `Set<string>` | 슬라이드 이동 직전 경고 표시 대상 |
| `contextCoverageDecisions` | `RehearsalContextCoverageDecision[]` | 누적 판정 근거 |

**항목 상태 표시**

| 상태 | CSS 클래스 | 표시 텍스트 |
|---|---|---|
| 커버됨 | `rehearsal-panel-keyword-hit` | 체크 |
| 경고 | `rehearsal-panel-keyword-missing` | 누락 |
| 대기 | (기본) | 대기 |

**슬라이드 이동 흐름**

```
다음 슬라이드 이동 요청
  └─ 현재 슬라이드 미커버 항목 있음?
       ├─ 없음 → 즉시 이동
       └─ 있음 → exitWarningItemIds 설정 (누락 강조)
                 → setTimeout 1500ms 후 이동 (soft warning)
```

---

## 13. 테스트 전략

### 13-1. Python worker 유닛 테스트

파일: `services/python-worker/tests/test_slide_context.py`

pytest 기반. LLM 클라이언트를 `MagicMock`으로 주입.

| 테스트 케이스 | 검증 내용 |
|---|---|
| `test_no_api_key_returns_unavailable` | API 키 없으면 status=unavailable |
| `test_empty_slides_returns_skipped` | 빈 slides 배열 → status=skipped |
| `test_successful_extraction` | 정상 추출, label/slide_id/item_order 확인 |
| `test_item_order_spans_multiple_slides` | 여러 슬라이드에서 item_order 단조 증가 |
| `test_invalid_llm_json_is_skipped` | JSON 파싱 실패 → 해당 슬라이드 skip, succeeded 유지 |
| `test_llm_exception_returns_failed` | LLM 예외 → status=failed |
| `test_items_trimmed_to_length_limits` | label ≤ 200자, sentence ≤ 1000자 |
| `test_generic_or_duplicate_items_are_filtered` | 구조어 제목("슬라이드 3") 필터, 중복 제거 |
| `test_items_without_meaningful_sentence_content_are_skipped` | 의미 없는 짧은 sentence 제거 |

### 13-2. NestJS API 유닛 테스트

파일: `apps/api/src/slide-context/slide-context.service.spec.ts`

Vitest 기반. `fetch`를 `vi.stubGlobal`으로 mock, TypeORM `DataSource`는 직접 stub.

| 테스트 케이스 | 검증 내용 |
|---|---|
| `maps python-worker extract items to shared slide context items` | worker 응답 → DB INSERT → shared schema 변환 확인 |

### 13-3. Web 유닛 테스트

**contextCoverageMatcher.test.ts**

| 테스트 | 검증 내용 |
|---|---|
| 후보 윈도우 생성 | suffix window가 포함되는지 |
| 도입 구 선행 시 coverage | "들어보신 적 있으신가요 레이스 컨디션은..." → 매칭됨 |
| 의미 낮으면 미커버 | semantic 0.42 → false |
| 의미 + 어휘 앵커 있으면 커버 | semantic 0.86 + 공유 어절 → true |
| semantic만으로는 부족 | semantic 0.89 but 어휘 앵커 부족 → false |
| 복수 후보 중 최강 선택 | substring > dice > semantic 우선순위 |

**contextCoverageMeta.test.ts**

| 테스트 | 검증 내용 |
|---|---|
| 첫 covered 기록 | decision 배열에 추가 |
| 중복 covered 방지 | 두 번째 기록 안 함 |
| 미커버 항목 missed 처리 | mergeRunMetaWithContextCoverage 결과 |
| base meta 보존 | slideTimeline 등 기존 필드 유지 |
| 비어있으면 null 반환 | 내용 없는 meta는 null |

### 13-4. 성능 테스트 포인트

현재 자동화된 성능 테스트는 없고, 아래 항목이 수동 또는 추후 측정 대상이다.

| 항목 | 측정 방법 | 목표 기준 |
|---|---|---|
| LLM 추출 레이턴시 (슬라이드 10장) | Python worker 로그 타임스탬프 | — |
| E5 모델 WASM 초기 로드 | browser DevTools Network / Performance | 5 s 이내 |
| E5 embedding 계산 (sentence 배치) | console.time 또는 Performance API | 30 ms 이내 |
| contextCoverageMatcher per final event | vitest bench (추가 예정) | — |
| `CONTEXT_MATCH_THRESHOLD = 0.8` 적정성 | 실제 발표 데이터 F1 측정 | — |
| `CONTEXT_DICE_MATCH_THRESHOLD = 0.78` | 위 동일 | — |
| scriptProgressTracker 정확도 | 실제 발화 녹음 재생 후 charOffset/ratio 비교 | — |
| STT 편향(contextPhrases) 효과 | 편향 전후 키워드 인식률 비교 | — |

---

## 14. 오픈 이슈 / 다음 작업

| # | 항목 | 현황 |
|---|---|---|
| 1 | DB `embedding` 컬럼 실제 사용 여부 | 컬럼만 있고 저장/조회 미구현. 브라우저-only로 갈지 결정 필요 |
| 2 | `CONTEXT_MATCH_THRESHOLD` 튜닝 | 실제 발표 데이터로 임계값 검증 필요 |
| 3 | 추출 품질 평가 | LLM이 뽑는 sentence가 발표 피드백에 실제로 유용한지 미검증 |
| 4 | `item_order` 의미화 | 현재 deck 전체 단조 증가. slideId 기준 재정렬 고려 가능 |
| 5 | 수정/삭제 경로 일관성 | 현재 PATCH/DELETE는 NestJS API 직접. Python worker 경유 여부 결정 필요 |
| 6 | exit warning UX | 현재 1.5 s soft warning. 명시적 확인(모달)으로 바꿀지 결정 필요 |
| 7 | 성능 테스트 자동화 | vitest bench / k6 등으로 매처 속도와 LLM 레이턴시 측정 추가 |

---

## 15. 주요 파일 인덱스

### 신규 파일

| 파일 | 역할 |
|---|---|
| `packages/shared/src/rehearsals/slide-context-item.schema.ts` | 공통 Zod 스키마·타입 |
| `apps/api/src/database/migrations/2026070901000-CreateSlideContextItems.ts` | DB 마이그레이션 |
| `apps/api/src/slide-context/slide-context.controller.ts` | REST 컨트롤러 |
| `apps/api/src/slide-context/slide-context.module.ts` | NestJS 모듈 |
| `apps/api/src/slide-context/slide-context.service.ts` | 비즈니스 로직 |
| `apps/api/src/slide-context/slide-context.service.spec.ts` | 서비스 유닛 테스트 |
| `services/python-worker/app/slide_context.py` | LLM 추출 핵심 로직 |
| `services/python-worker/tests/test_slide_context.py` | Python 유닛 테스트 |
| `apps/web/src/features/rehearsal/panel/SlideContextChecklist.tsx` | 체크리스트 UI |
| `apps/web/src/features/rehearsal/panel/slideContextApi.ts` | Web → API fetch 헬퍼 |
| `apps/web/src/features/rehearsal/panel/contextSlidingWindow.ts` | STT 슬라이딩 윈도우 |
| `apps/web/src/features/rehearsal/panel/contextCoverageMatcher.ts` | 3단계 매칭 판정기 |
| `apps/web/src/features/rehearsal/panel/contextCoverageMatcher.test.ts` | 매처 유닛 테스트 |
| `apps/web/src/features/rehearsal/panel/contextCoverageMeta.ts` | 판정 결과 직렬화 |
| `apps/web/src/features/rehearsal/panel/contextCoverageMeta.test.ts` | 메타 유닛 테스트 |
| `apps/web/src/features/rehearsal/speech/scriptProgressTracker.ts` | 원문 대본 진행 추적기 |
| `apps/web/src/features/rehearsal/speech/scriptProgressTracker.test.ts` | 진행 추적기 유닛 테스트 |

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `packages/shared/src/index.ts` | slide-context-item 스키마 re-export 추가 |
| `packages/shared/src/rehearsals/rehearsal.schema.ts` | `contextCoverageDecisions` 필드 추가 |
| `apps/api/src/app.module.ts` | SlideContextModule 등록 |
| `apps/api/src/database/data-source.ts` | 마이그레이션 등록 |
| `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx` | context 상태·판정 로직 통합, contextPhrases 연결 |
| `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx` | SlideContextChecklist 삽입, "의미 XX% · 원문 XX%" 표시 |
| `apps/web/src/features/rehearsal/speech/speechBiasPhrases.ts` | context-item source 추가 (weight 0.88) |
| `apps/web/src/features/rehearsal/speech/speechTracker.ts` | scriptProgressTracker 내장 |
| `apps/web/src/features/rehearsal/speech/speechTrackingEvents.ts` | ScriptProgressSnapshot 타입 추가 |
| `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts` | contextPhrases 필드 추가 |
| `apps/web/src/features/rehearsal/stt/liveSttPort.ts` | contextPhrases 관련 변경 |
| `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.ts` | contextPhrases 관련 변경 |
| `apps/web/src/styles.css` | 체크리스트 및 진행률 CSS 추가 |
| `services/python-worker/app/main.py` | `/slide-context/extract` 엔드포인트 추가 |
