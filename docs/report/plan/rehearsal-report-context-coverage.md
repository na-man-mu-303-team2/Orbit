# 리허설 리포트 문맥 커버리지 확장 설계

리포트를 "키워드 맞췄냐"에서 "청중에게 핵심 메시지가 실제로 전달됐냐"로 발전시키는 1차 설계.

---

## 설계 원칙

1. **런타임 추적 기준 유지** — `deckKeywords`, `missedKeywords`, `keywordCoverage`는 건드리지 않는다.
2. **해석 레이어만 추가** — 문맥 전달 판정은 새 필드(`contextSummary`, `messageCoverage`, `slideContextInsights`)로만 추가한다.
3. **작성 비용 최소화** — `slideContexts`는 optional. 없는 슬라이드는 기존 로직 그대로 처리한다.
4. **저장은 단계적으로** — 1차는 무거운 `messageUnits` 전체를 리포트에 박지 않고 요약된 결과만 저장한다.
5. **하위 호환 유지** — 새 필드가 없으면 기존 소비자(UI, Worker, python-worker)는 그대로 동작한다.

---

## 현재 구조 요약

```
프론트 (meta_json 수집)
  └─ slideTimeline, missedKeywords, adviceEvents
       ↓
Worker (analyzeTranscript 호출)
  └─ POST /rehearsal/analyze → python-worker
       ↓
python-worker (분석)
  └─ keywordCoverage, missedKeywords, coaching, ...
       ↓
Worker (buildRehearsalReport)
  └─ rehearsalReportSchema.parse() → DB report_json
```

변경 진입점:
- `packages/shared/src/rehearsals/rehearsal.schema.ts` (Zod schema)
- `apps/worker/src/rehearsal-stt.processor.ts:397` (analyzeTranscript 요청)
- `apps/worker/src/rehearsal-stt.processor.ts:333` (buildRehearsalReport 조립)
- `services/python-worker/app/main.py:149` (RehearsalAnalyzeRequest 모델)
- `services/python-worker/app/rehearsal.py:227` (generate_rehearsal_coaching 입력 확장)

---

## 1단계: 요청 DTO 확장

선택지 B 채택으로 `slideContexts`는 **외부 주입하지 않는다**. python-worker가 0단계에서 내부적으로 생성한다. 대신 그 재료가 되는 `slideRawInputs`와 `runEvidence`를 optional로 추가한다.

```typescript
// packages/shared 기준 TypeScript 타입 표현
type RehearsalAnalyzeRequest = {
  // 기존 필드 (유지)
  runId: string;
  projectId: string;
  deckId: string;
  transcript: string;
  durationSeconds: number;
  segments: TranscriptSegment[];
  deckKeywords: DeckKeyword[];
  slideTimeline: { slideId: string; enteredSecond: number }[];

  // 신규 optional (B 방식)
  slideRawInputs?: {          // deck contract 변경 없이 slide 재료만 전달
    slideId: string;
    title: string;
    speakerNotes: string;
  }[];
  runEvidence?: {
    adviceEvents?: { type: string; at: string }[];
  };
};
```

`SlideContext` / `MessageUnit` 타입은 python-worker 내부 타입이 된다. DTO에서 제거한다.

**python-worker 모델 (`services/python-worker/app/main.py`)**:

```python
class SlideRawInput(BaseModel):
    slide_id: str = Field(alias="slideId")
    title: str = ""
    speaker_notes: str = Field(default="", alias="speakerNotes")

class RunEvidenceRequest(BaseModel):
    advice_events: list[dict] = Field(default_factory=list, alias="adviceEvents")

class RehearsalAnalyzeRequest(BaseModel):
    # 기존 필드 유지
    run_id: str = Field(alias="runId")
    project_id: str = Field(alias="projectId")
    deck_id: str = Field(alias="deckId")
    transcript: str
    duration_seconds: float = Field(alias="durationSeconds", ge=0)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    deck_keywords: list[DeckKeywordRequest] = Field(default_factory=list, alias="deckKeywords")
    slide_timeline: list[RehearsalSlideTimelineEntryRequest] = Field(default_factory=list, alias="slideTimeline")

    # 신규 optional (B 방식 — SlideContextRequest 없음)
    slide_raw_inputs: list[SlideRawInput] | None = Field(default=None, alias="slideRawInputs")
    run_evidence: RunEvidenceRequest | None = Field(default=None, alias="runEvidence")
```

---

## 2단계: 응답 DTO 확장

기존 필드를 제거하지 않고, 새 필드를 **optional**로 추가한다.

```typescript
type RehearsalAnalyzeResponse = {
  // 기존 필드 (유지)
  runId: string;
  wordsPerMinute: number;
  fillerWordCount: number;
  pauseCount: number;
  keywordCoverage: number;
  speedSamples: RehearsalSpeedSample[];
  fillerWordDetails: RehearsalFillerWordDetail[];
  pauseDetails: RehearsalPauseDetail[];
  missedKeywords: RehearsalMissedKeyword[];
  slideInsights: RehearsalSlideInsight[];
  aiSummary: RehearsalAiSummary;
  coaching: RehearsalCoaching;

  // 신규 optional (0단계 derive_slide_contexts 성공 시에만 생성)
  contextSummary?: ContextSummary;
  messageCoverage?: MessageCoverageItem[];
  slideContextInsights?: SlideContextInsight[];
};

type ContextSummary = {
  overallStatus: "clear" | "mixed" | "weak";
  headline: string;         // 한 문장 총평
  strengths: string[];
  risks: string[];
};

type MessageCoverageItem = {
  slideId: string;
  messageId: string;
  status: "delivered" | "partial" | "missed" | "unclear" | "misleading";
  confidence: number;       // 0~1
  evidenceSummary: string;  // 판정 근거 요약
  feedback: string;         // 개선 방향
};

type SlideContextInsight = {
  slideId: string;
  deliveryStatus: "clear" | "partial" | "weak";
  actualSpokenSummary: string;   // 실제 발화 내용 요약
  deliveryIssues: string[];      // 구체적 문제점
  recommendedFix: string;        // 다음 연습에서 할 것
};
```

---

## 3단계: 저장 DTO 확장 (RehearsalReport)

`packages/shared/src/rehearsals/rehearsal.schema.ts`의 `rehearsalReportSchema`에 optional 필드만 추가. `.strict()`를 유지하려면 새 Zod 스키마를 추가해야 한다.

```typescript
// Zod schema 초안

export const rehearsalContextSummarySchema = z.object({
  overallStatus: z.enum(["clear", "mixed", "weak"]),
  headline: z.string().trim().min(1),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export const rehearsalMessageCoverageItemSchema = z.object({
  slideId: deckSlideIdSchema,
  messageId: z.string().min(1),
  status: z.enum(["delivered", "partial", "missed", "unclear", "misleading"]),
  confidence: z.number().min(0).max(1),
  evidenceSummary: z.string().default(""),
  feedback: z.string().default(""),
});

export const rehearsalSlideContextInsightSchema = z.object({
  slideId: deckSlideIdSchema,
  deliveryStatus: z.enum(["clear", "partial", "weak"]),
  actualSpokenSummary: z.string().default(""),
  deliveryIssues: z.array(z.string()).default([]),
  recommendedFix: z.string().default(""),
});

// rehearsalReportSchema에 추가할 optional 필드
// contextSummary: rehearsalContextSummarySchema.nullable().optional()
// messageCoverage: z.array(rehearsalMessageCoverageItemSchema).optional()
// slideContextInsights: z.array(rehearsalSlideContextInsightSchema).optional()
```

> **주의**: `rehearsalReportSchema`가 현재 `.strict()`를 사용하므로 새 필드를 schema에 선언하지 않으면 parse 시 에러가 난다. 필드를 추가하면서 기존 테스트가 깨지는지 확인 필요.

---

## 분석 파이프라인: 2단계 분리

### 1단계: 슬라이드별 발화 요약

입력: `transcript`, `segments`, `slideTimeline`

```python
ActualMessage:
  slideId: str
  actualSpokenSummary: str
  evidenceSegmentRange?: { startSeconds: float, endSeconds: float }
```

- `slideTimeline` 기반으로 시구간을 잘라 각 슬라이드에 해당하는 `segments`를 추출한다.
- 추출된 segments를 LLM에 넣어 "이 슬라이드에서 실제로 발화한 내용 요약"을 생성한다.
- semantic 판정이 실패해도 이 단계 결과만으로 fallback 가능하다.

### 2단계: 기대 문맥과 실제 발화 비교

입력: `slideContexts[].messageUnits`, `actualMessages`

출력: `messageCoverage`, `slideContextInsights`, `contextSummary`

- `messageUnits`의 `intent` vs `actualSpokenSummary`를 LLM이 비교한다.
- `acceptableMeanings`와 `misleadingCases`는 판정 정확도를 높이는 힌트로 사용한다.
- `supportingTerms`가 발화에 포함됐는지는 1단계 keyword 검사로 확인한다.

**fallback 규칙**: `slideContexts`가 없거나 2단계 실패 시 `contextSummary/messageCoverage/slideContextInsights`는 응답에 포함하지 않는다. 기존 `missedKeywords` 기반 결과만 반환한다.

---

## Worker 변경 포인트

`apps/worker/src/rehearsal-stt.processor.ts`

### analyzeTranscript (line 397)

`slideContexts`는 보내지 않는다. 대신 python-worker 0단계가 사용할 `slideRawInputs`를 추가한다.

```typescript
// 기존
body: JSON.stringify({
  runId: payload.runId,
  // ...
  deckKeywords: deckContext.deckKeywords,
  slideTimeline: buildAnalyzeSlideTimeline(deckContext.deck, runMeta)
})

// 변경 후
body: JSON.stringify({
  runId: payload.runId,
  // ...기존 필드...
  slideRawInputs: deckContext.deck.slides.map((slide) => ({
    slideId: slide.slideId,
    title: slide.title,
    speakerNotes: slide.speakerNotes,
  })),
  runEvidence: { adviceEvents: runMeta.adviceEvents ?? [] }
})
```

#### slideContexts 데이터 출처 계약 — **선택지 B 채택: AI 사전 생성**

현재 `slideSchema`(`packages/shared/src/deck/deck.schema.ts:181`)에는 `slideContext` 관련 필드가 없다. slide가 가진 것은 `title`, `estimatedSeconds`, `speakerNotes`, `keywords`, `aiNotes` 뿐이며, `patch.schema.ts`의 패치 계약도 이 범위 안에 있다. **deck contract와 editor 의존성을 건드리지 않는다.**

**방향**: `slideContexts`는 python-worker 안에서 전사 분석 전에 speakerNotes와 keywords를 읽어 AI가 자동 생성한다. Worker는 `buildSlideContexts()`를 호출하지 않고 deck의 raw 재료만 `/rehearsal/analyze` 요청에 실어 보낸다.

##### 파이프라인 위치

```
Worker → /rehearsal/analyze 요청
           ↓
python-worker: 0단계 — derive_slide_contexts(deck_keywords, slide_raw_inputs)
               입력: slides[].{ slideId, title, speakerNotes, keywords }
               출력: SlideContext[] (messageUnits 포함)
           ↓
python-worker: 1단계 — summarize_slide_speech(segments, slideTimeline)
           ↓
python-worker: 2단계 — evaluate_message_coverage(slideContexts, actualMessages)
```

`derive_slide_contexts()`는 python-worker 내부 함수이므로 DTO에는 노출되지 않는다. 외부에서 `slideContexts`를 주입할 필요가 없어지기 때문에, Worker → python-worker 요청 DTO에서 `slideContexts` 필드는 **삭제**한다.

##### Worker에서 보내야 할 추가 입력

python-worker가 0단계를 수행하려면 slide 단위 재료가 필요하다. 현재 `/rehearsal/analyze` 요청에 `deckKeywords`는 있지만 `speakerNotes`와 `title`이 없다. 아래 필드를 요청에 추가한다.

```typescript
// Worker → python-worker 요청 DTO 추가 (선택지 B 전용)
slideRawInputs?: {
  slideId: string;
  title: string;
  speakerNotes: string;
}[];
```

Worker는 `deckContext.deck.slides`에서 이 값을 추출해 보낸다. deck contract는 바뀌지 않는다.

##### python-worker 0단계 구현 스케치

```python
def derive_slide_contexts(
    slide_raw_inputs: list[SlideRawInput],  # slideId, title, speakerNotes
    deck_keywords: list[DeckKeyword],
    client: Any,
    model: str,
) -> list[SlideContext]:
    """speakerNotes와 keywords를 읽어 messageUnits를 AI로 생성한다."""
    keywords_by_slide = group_keywords_by_slide(deck_keywords)
    results = []
    for slide in slide_raw_inputs:
        if not slide.speaker_notes.strip():
            continue  # speakerNotes 없는 슬라이드는 skip
        slide_keywords = keywords_by_slide.get(slide.slide_id, [])
        units = generate_message_units(
            slide_id=slide.slide_id,
            title=slide.title,
            speaker_notes=slide.speaker_notes,
            keywords=slide_keywords,
            client=client,
            model=model,
        )
        results.append(SlideContext(slide_id=slide.slide_id, message_units=units))
    return results or None  # 하나도 생성 안 되면 None → 기존 경로
```

`generate_message_units()`는 speakerNotes를 LLM에 보내 `intent`, `importance`, `acceptableMeanings`, `supportingTerms`를 추출한다. LLM 실패 시 해당 슬라이드는 skip하고 나머지는 계속 진행한다.

##### 실패 격리

0단계 전체 실패(API 오류, 타임아웃 등) 시 `slide_contexts = None`으로 처리하고 1단계·2단계를 건너뛴다. 기존 keyword 기반 분석 결과만 반환한다. 리포트 생성 자체는 막히지 않는다.

### buildRehearsalReport (line 333)

```typescript
// analysis.contextSummary, analysis.messageCoverage, analysis.slideContextInsights가
// 존재할 때만 report에 포함한다.
return rehearsalReportSchema.parse({
  // ...기존 필드...
  contextSummary: analysis.contextSummary ?? undefined,
  messageCoverage: analysis.messageCoverage ?? undefined,
  slideContextInsights: analysis.slideContextInsights ?? undefined,
});
```

---

## python-worker 변경 포인트

`services/python-worker/app/rehearsal.py`

### generate_rehearsal_coaching (line 227)

`slideContexts`가 있을 때 코칭 프롬프트 입력을 확장한다.

```python
# 기존
input=(
    "Transcript:\n"
    f"{text}\n\n"
    "Metrics:\n"
    f"- keywordCoverage: {metrics.keyword_coverage}\n"
    # ...
)

# 변경 후
context_block = ""
if context_summary:
    context_block = (
        "\nContext Analysis:\n"
        f"- overallStatus: {context_summary.overall_status}\n"
        f"- headline: {context_summary.headline}\n"
        f"- risks: {', '.join(context_summary.risks)}\n"
    )

input=(
    "Transcript:\n"
    f"{text}\n\n"
    "Metrics:\n"
    f"- keywordCoverage: {metrics.keyword_coverage}\n"
    # ...기존 지표...
    f"{context_block}"
)
```

### 신규 함수 추가

```python
def summarize_slide_speech(
    segments: list[TranscriptSegment],
    slide_timeline: list[SlideTimelineEntry],
    client: Any,
    model: str,
) -> list[ActualMessage]:
    """슬라이드별 발화 내용을 LLM으로 요약한다 (1단계)."""
    ...

def evaluate_message_coverage(
    actual_messages: list[ActualMessage],
    slide_contexts: list[SlideContextRequest],
    client: Any,
    model: str,
) -> tuple[list[MessageCoverage], list[SlideContextInsight], ContextSummary]:
    """기대 메시지와 실제 발화를 비교해 커버리지를 판정한다 (2단계)."""
    ...
```

---

## UI 변경 우선순위

> 1차는 `contextSummary`와 `slideContextInsights`만 사용. `messageCoverage`는 2차.

### AI 총평 카드

```
contextSummary.headline 있으면 → 우선 사용
없으면 → 기존 aiSummary.headline
```

overallStatus에 따라 카드 색상 구분: `clear` → 초록, `mixed` → 노랑, `weak` → 빨강.

### 이번 발표 요약 섹션

- `keywordCoverage`는 제거하지 말고 **보조 지표**로 내린다.
- 핵심 메시지 전달 카드 추가: "명확 / 혼합 / 약함" 3단계 배지.

### 슬라이드 분석 카드

`slideContextInsights`가 있는 슬라이드:
- `actualSpokenSummary` → "실제 발화 요약" 섹션
- `deliveryIssues` → 개선 포인트 목록
- `recommendedFix` → 다음 연습 제안
- `missedKeywords` → 보조 태그로만 표시

`slideContextInsights`가 없는 슬라이드:
- 기존 `missedKeywords` 기반 카드 그대로 유지

---

## 단계별 롤아웃

| 순서 | 작업 | 비고 |
|------|------|------|
| 1 | Zod schema에 optional 필드 추가 | `.strict()` 때문에 반드시 선언 필요 |
| 2 | python-worker `RehearsalAnalyzeRequest` 모델 확장 | 없어도 기존 동작 유지 |
| 3 | python-worker 분석 함수 추가 (2단계 파이프라인) | `slideContexts` 없으면 skip |
| 4 | Worker `analyzeTranscript` 호출에 `slideContexts` 추가 | deck에서 추출 가능한 범위 먼저 |
| 5 | Worker `buildRehearsalReport`에 새 필드 조립 | optional 이므로 안전 |
| 6 | UI에 `contextSummary`/`slideContextInsights` 카드 추가 | feature flag 없이 필드 유무로 분기 |
| 7 | 품질 검증 후 `messageCoverage`를 주요 지표로 승격 | 2차 |
| 8 | `keywordCoverage`를 보조 지표로 강등 | 2차 |

---

## 1차 구현 경계

**포함:**
- `slideContexts?` optional 추가 (DTO + schema)
- `contextSummary?` 저장 및 UI 렌더링
- `slideContextInsights?` 저장 및 UI 렌더링
- 코칭 프롬프트에 `contextSummary` 컨텍스트 추가

**제외 (2차):**
- `messageUnits`를 전 슬라이드 필수 입력으로 강제
- `messageCoverage`를 주요 지표로 승격
- `keywordCoverage` 제거
- `slidePurpose` / `expectedAudienceTakeaway` 편집 UI

---

## 수정 파일 체크리스트

```
packages/shared/src/rehearsals/rehearsal.schema.ts
  └─ rehearsalContextSummarySchema, rehearsalMessageCoverageItemSchema,
     rehearsalSlideContextInsightSchema 추가
  └─ rehearsalReportSchema에 3개 optional 필드 추가

services/python-worker/app/main.py
  └─ SlideMessageUnit, SlideContextRequest, RunEvidenceRequest 모델 추가
  └─ RehearsalAnalyzeRequest에 slide_contexts, run_evidence 추가
  └─ 응답 모델에 context_summary, message_coverage, slide_context_insights 추가

services/python-worker/app/rehearsal.py
  └─ summarize_slide_speech() 추가 (1단계)
  └─ evaluate_message_coverage() 추가 (2단계)
  └─ generate_rehearsal_coaching() 입력 확장

apps/worker/src/rehearsal-stt.processor.ts
  └─ analyzeTranscript(): slideContexts, runEvidence 추가
  └─ buildRehearsalReport(): contextSummary, messageCoverage, slideContextInsights 조립

apps/web/src/features/rehearsal/RehearsalReportDocument.tsx
  └─ contextSummary 있을 때 AI 총평 카드 변경
  └─ slideContextInsights 있을 때 슬라이드 분석 카드 변경
  └─ 핵심 메시지 전달 배지 추가
```

---

## Zod Schema 초안

`packages/shared/src/rehearsals/rehearsal.schema.ts`에 추가할 내용 전체를 기존 파일 패턴 그대로 작성한 초안이다.

### 신규 leaf 스키마 3개

기존 파일의 `rehearsalReportCoachingSchema` 바로 뒤에 추가한다.

```typescript
// rehearsal.schema.ts — rehearsalReportCoachingSchema 다음에 삽입

export const rehearsalContextSummarySchema = z
  .object({
    overallStatus: z.enum(["clear", "mixed", "weak"]),
    headline: z.string().trim().min(1),
    strengths: z.array(z.string().trim().min(1)).default([]),
    risks: z.array(z.string().trim().min(1)).default([])
  })
  .strict();

export const rehearsalMessageCoverageItemSchema = z
  .object({
    slideId: deckSlideIdSchema,
    messageId: z.string().trim().min(1),
    status: z.enum(["delivered", "partial", "missed", "unclear", "misleading"]),
    confidence: z.number().min(0).max(1),
    evidenceSummary: z.string().default(""),
    feedback: z.string().default("")
  })
  .strict();

export const rehearsalSlideContextInsightSchema = z
  .object({
    slideId: deckSlideIdSchema,
    deliveryStatus: z.enum(["clear", "partial", "weak"]),
    actualSpokenSummary: z.string().default(""),
    deliveryIssues: z.array(z.string().trim().min(1)).default([]),
    recommendedFix: z.string().default("")
  })
  .strict();
```

**패턴 근거**:
- `.strict()` — 기존 모든 leaf 스키마와 동일 (`rehearsalReportPauseDetailSchema` 등)
- `z.string().trim().min(1)` — 빈 문자열 차단. 배열 원소에도 동일하게 적용
- `.default("")` / `.default([])` — `rehearsalReportCoachingSchema`의 패턴 그대로 (Worker가 명시적으로 안 보내도 parse 통과)
- `deckSlideIdSchema` — 기존 slide 참조 필드와 동일

### rehearsalReportSchema 수정

기존 `.object({...})` 블록 안에 optional 필드 3개를 추가한다. `.strict()`와 `.superRefine()`은 건드리지 않는다.

```typescript
// 기존
export const rehearsalReportSchema = z
  .object({
    // ...기존 필드들...
    aiSummary: rehearsalReportAiSummarySchema.nullable().optional(),
    coaching: rehearsalReportCoachingSchema.nullable(),
    generatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine(...);

// 변경 후 — generatedAt 바로 위에 3개 추가
export const rehearsalReportSchema = z
  .object({
    // ...기존 필드들 (변경 없음)...
    aiSummary: rehearsalReportAiSummarySchema.nullable().optional(),
    coaching: rehearsalReportCoachingSchema.nullable(),
    // 신규 optional 필드
    contextSummary: rehearsalContextSummarySchema.nullable().optional(),
    messageCoverage: z.array(rehearsalMessageCoverageItemSchema).optional(),
    slideContextInsights: z.array(rehearsalSlideContextInsightSchema).optional(),
    generatedAt: isoDateTimeSchema
  })
  .strict()
  .superRefine((report, context) => {
    if (!report.transcriptRetained && report.transcript !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "transcript must be null when transcriptRetained is false.",
        path: ["transcript"]
      });
    }
  });
```

**nullable vs optional 선택 근거**:

| 필드 | 타입 | 이유 |
|------|------|------|
| `contextSummary` | `.nullable().optional()` | `aiSummary`와 동일. DB에 null로 명시 저장하는 경우도 허용 |
| `messageCoverage` | `.optional()` | 생성 안 됐을 때 필드 자체가 없는 게 자연스럽다. null 배열은 의미 없음 |
| `slideContextInsights` | `.optional()` | 동일 |

### 내보낼 타입 3개

파일 하단 `export type` 블록에 추가한다.

```typescript
// 기존 타입 export 목록 끝에 추가
export type RehearsalContextSummary = z.infer<typeof rehearsalContextSummarySchema>;
export type RehearsalMessageCoverageItem = z.infer<typeof rehearsalMessageCoverageItemSchema>;
export type RehearsalSlideContextInsight = z.infer<typeof rehearsalSlideContextInsightSchema>;
```

### 변경 후 `RehearsalReport` 타입 추론 결과

```typescript
type RehearsalReport = {
  // 기존 (변경 없음)
  reportId: string;
  runId: string;
  projectId: string;
  deckId: string;
  transcriptRetained: boolean;
  transcript: string | null;
  metrics: RehearsalReportMetrics;
  speedSamples: { startSecond: number; endSecond: number; wordsPerMinute: number }[];
  fillerWordDetails: { word: string; count: number }[];
  pauseDetails: { startSecond: number; endSecond: number; durationSeconds: number }[];
  missedKeywords: { slideId: string; keywordId: string; text: string }[];
  slideTimings: { slideId: string; targetSeconds: number; actualSeconds: number }[];
  slideInsights: { slideId: string; fillerWordCount: number; pauseCount: number }[];
  qnaSummary: RehearsalReportQnaSummary;
  aiSummary?: { headline: string; paragraphs: string[] } | null;
  coaching: RehearsalReportCoaching | null;
  generatedAt: string;
  // 신규 (추가됨)
  contextSummary?: {
    overallStatus: "clear" | "mixed" | "weak";
    headline: string;
    strengths: string[];
    risks: string[];
  } | null;
  messageCoverage?: {
    slideId: string;
    messageId: string;
    status: "delivered" | "partial" | "missed" | "unclear" | "misleading";
    confidence: number;
    evidenceSummary: string;
    feedback: string;
  }[];
  slideContextInsights?: {
    slideId: string;
    deliveryStatus: "clear" | "partial" | "weak";
    actualSpokenSummary: string;
    deliveryIssues: string[];
    recommendedFix: string;
  }[];
};
```

### 주의사항

**`.strict()` 때문에 선언 순서가 중요하다.** `rehearsalReportSchema`에 새 필드를 추가하지 않은 채 Worker가 새 필드를 포함한 객체를 `rehearsalReportSchema.parse()`에 넘기면 Zod가 에러를 던진다. schema 변경과 Worker 변경은 **반드시 함께 배포**해야 한다.

배포 순서:
1. `packages/shared` 스키마 변경 → 빌드
2. `apps/worker` 변경 (새 필드 조립) — 같은 배포
3. `services/python-worker` 변경 (새 필드 생성) — 같은 배포 또는 직전
4. `apps/web` UI 변경 — 언제든 가능 (필드가 없어도 기존 UI 그대로 동작)

---

## 관련 문서

- `docs/report/README.md` — 전체 파이프라인 흐름
- `docs/report/backend.md` — Worker, Python Worker 책임 상세
- `docs/report/frontend.md` — 화면, 라우트, 리포트 조회 흐름
- `packages/shared/src/rehearsals/rehearsal.schema.ts` — 현재 Zod schema
- `packages/shared/src/deck/deck.schema.ts` — slide contract (slideContext 확장 시 여기를 건드림)
- `packages/shared/src/deck/patch.schema.ts` — 패치 계약 (deck contract 확장 시 같이 변경)
- `apps/worker/src/rehearsal-stt.processor.ts` — Worker 핵심 로직
- `services/python-worker/app/rehearsal.py` — 분석/코칭 로직
