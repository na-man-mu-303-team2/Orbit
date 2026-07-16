# 리허설 음성 측정·Evidence DTO 계약

> 상태: **P0 구현 계약 확정**
> 결정일: 2026-07-13
> 담당: 김동현
> 범위: Report STT 이후 TypeScript↔Python 분석 DTO, CPM/WPM, STT Quality Gate, filler, pause v1·v2, slide timing 원천값, Evidence Audio Clip 보관·삭제·권한
> 기준 코드: `origin/develop@1edda998` 및 2026-07-13 로컬 `develop`

이 문서는 `docs/Orbit-업무분담.md`에서 김동현이 결정·작성하도록 지정한 P0 계약을 구현 가능한 수준으로 고정한다. 현재 런타임 계약의 원본은 여전히 `packages/shared`와 `docs/contracts.md`다. 따라서 이 문서의 목표 계약은 선행 공통 계약 PR에서 shared schema, schema test, migration, `docs/contracts.md`, `docs/decision-log.md`에 반영된 뒤 런타임 효력을 갖는다.

## 1. 결정 요약

다음 정책을 P0 기준으로 확정한다.

| 항목 | 확정 내용 |
| --- | --- |
| Python 경계 | `/rehearsal/analyze` 요청·응답에 `contractVersion: 2`를 사용하고, TypeScript Zod와 Python Pydantic이 같은 camelCase JSON을 strict validation한다. |
| 알 수 없는 필드 | TypeScript는 `.strict()`, Python은 `ConfigDict(populate_by_name=True, extra="forbid", strict=True)`를 사용해 HTTP 422로 거부한다. |
| confidence 미제공 | Quality Gate를 `unavailable/CONFIDENCE_NOT_PROVIDED`로 기록하되, 실제 text·timestamp·recording 근거가 있는 지표는 계산한다. confidence를 추측하지 않는다. |
| confidence 임계값 | Provider·model·언어·정규화 방식이 명시된 승인 profile만 사용한다. 공통 임계값 `0.70` 같은 임의 기본값은 두지 않는다. |
| 낮은 confidence | 승인 profile이 있고 `confidence < threshold`이면 `failed/LOW_TRANSCRIPTION_CONFIDENCE`다. STT text·segment에 의존하는 지표는 `unmeasured`로 전달한다. |
| 한국어 CPM | transcript를 NFKC 정규화한 뒤 Unicode Letter·Number만 센다. 공백, 문장부호, 기호는 제외한다. |
| 시간 원본 | `recording → provider → segment-window` 순서다. 어느 근거도 없으면 `durationSeconds=null`이며 0을 측정값으로 사용하지 않는다. |
| WPM 호환 | 기존 token 기반 WPM v1을 계속 계산하되 CPM과 환산하지 않는다. 과거 WPM 결과를 CPM으로 다시 쓰지 않는다. |
| CPM 추세 | 목표 범위를 추정하지 않는다. `direction="neutral"`, `targetRange=null`인 설명형 추세로 최근 변화만 표시한다. |
| pause | 1초 이상 segment gap인 v1을 유지한다. v2는 위치와 의도를 별도 축으로 추가하고, 근거가 없으면 `unknown`이다. |
| Audio Clip | 실패·부분 전달 observation 중 실제 time range가 있는 항목에 최대 1개, 최대 12초의 Clip을 만든다. 프로젝트 Owner만 재생할 수 있다. |
| Clip 보관 | 생성 시각부터 정확히 14일 보관한다. P0 DTO에는 보관기간 변경 입력을 두지 않는다. 30일 연장은 P1 승인 전까지 지원하지 않는다. |
| URL 정책 | DB·Job·report·로그에는 object key, storage URL, Signed URL을 넣지 않는다. Owner 전용 API 응답에서만 15분 만료 Signed URL을 일회성으로 반환한다. |

## 2. 현재 계약과 목표 계약의 차이

| 영역 | 현재 코드 | P0 목표 |
| --- | --- | --- |
| 분석 요청 | `durationSeconds`가 없으면 TS worker가 0을 전송한다. `language`, provider, confidence가 없다. | 실제 녹음시간과 Provider 시간을 분리해 전달하고, 언어·Provider·정규화 confidence를 전달한다. |
| Python validation | `RehearsalAnalyzeRequest`가 알 수 없는 필드를 무시한다. | 모든 중첩 DTO에서 extra field를 거부한다. |
| 속도 | `wordsPerMinute`만 있다. | 한국어는 `charactersPerMinute`가 canonical이고 WPM은 호환 값이다. |
| 시간 상태 | 0이 실제 0인지 자료 없음인지 구분되지 않는다. | 값과 `measurementState`, `reasonCode`, `durationSource`를 함께 전달한다. |
| filler | 표현별 count만 있고 발생 위치가 없다. | count는 유지하고 확인 가능한 occurrence에 segment/word time range와 정밀도를 붙인다. |
| pause | segment gap 1초 이상인 v1 time range만 있다. | v1을 유지하고 위치·의도·근거 source가 있는 v2를 별도로 추가한다. |
| slide timing | 연속 slide 진입 간격만 계산하며 마지막 slide를 생략한다. | 실제 `recordingDurationSeconds`가 있을 때만 마지막 slide 종료를 계산한다. |
| Clip | 파생 Evidence Clip 계약이 없다. | 별도 private purpose, 12초 상한, 14일 TTL, Owner-only, 삭제 재시도 계약을 둔다. |

기존 public `RehearsalReport` 필드의 타입이나 의미를 바꾸지 않는다. Python 내부 DTO의 목표 상태는 `contractVersion: 2` 하나이며, 짧은 배포 호환 창이 끝나면 v1 adapter를 제거한다. public report는 additive field와 default를 사용해 legacy report를 계속 읽는다.

## 3. 공통 직렬화·검증 규칙

- JSON key는 기존 계약처럼 camelCase를 사용한다.
- Python 내부 attribute만 snake_case를 사용하고 `Field(alias=...)`로 연결한다.
- Pydantic request/response 기반 class는 `ConfigDict(populate_by_name=True, extra="forbid", strict=True)`를 상속한다.
- ID는 trim 후 1자 이상 128자 이하 문자열이다.
- 모든 숫자는 finite number여야 한다. `NaN`, `Infinity`, 숫자 문자열은 허용하지 않는다.
- 내부 음성 분석 DTO의 시간은 기존 Python 경계와 맞춰 `Seconds`를 사용한다.
- shared `ReportObservation.evidenceRefs`와 Clip 계약의 시간은 기존 bounded evidence와 맞춰 정수 `Milliseconds`를 사용한다.
- 날짜·시각은 UTC ISO 8601 문자열이다.
- 알 수 없는 필드는 모든 object level에서 거부한다.
- array 순서는 계약의 일부다. `segments`와 `slideTimeline`은 시간 오름차순, detail 결과는 아래 정렬 규칙을 따른다.
- transcript는 이 내부 요청 한 번과 분석 중 memory에서만 사용한다. DB, Job payload/result, report, 업무 로그, 예외 telemetry에 넣지 않는다.
- Provider raw response와 자유 형식 `unknown` payload는 DTO에 넣지 않는다.

TypeScript와 Python은 다음 공통 기반을 사용한다.

```ts
type MeasurementState = "measured" | "unmeasured";

type SpeechMeasurementReasonCode =
  | "NO_DURATION_EVIDENCE"
  | "EMPTY_TRANSCRIPT"
  | "UNSUPPORTED_CPM_LANGUAGE"
  | "LOW_TRANSCRIPTION_CONFIDENCE"
  | "NO_KEYWORDS"
  | "SEGMENT_TIMESTAMPS_UNAVAILABLE"
  | "SENTENCE_BOUNDARY_UNAVAILABLE"
  | "PAUSE_INTENT_UNAVAILABLE"
  | "LEGACY_MEASUREMENT_STATE_UNKNOWN";

type DurationSource = "recording" | "provider" | "segment-window";
```

## 4. TypeScript → Python 분석 요청 DTO

Endpoint는 기존 `POST /rehearsal/analyze`를 유지한다. 장기적으로 v1과 v2 endpoint를 동시에 운영하지 않는다.

```ts
type NormalizedSttConfidence = {
  value: number; // 0..1
  source:
    | "provider-overall"
    | "provider-segment-aggregate"
    | "provider-word-aggregate";
  normalizationProfileId: string; // 1..128
};

type TranscriptSegmentDto = {
  text: string; // trim 후 1자 이상
  startSeconds: number | null;
  endSeconds: number | null;
  confidence: NormalizedSttConfidence | null;
};

type DeckKeywordDto = {
  keywordId: string;
  slideId: string;
  text: string;
  synonyms: string[];
  abbreviations: string[];
};

type SlideTimelineEntryDto = {
  slideId: string;
  enteredSecond: number; // >= 0
};

type RehearsalAnalyzeRequestV2 = {
  contractVersion: 2;
  runId: string;
  projectId: string;
  deckId: string;

  // private transient field
  transcript: string;

  language: string; // BCP 47 또는 Provider가 반환한 ISO language tag
  provider: string;
  model: string;
  sttConfidence: NormalizedSttConfidence | null;

  // Web recorder가 측정한 실제 전체 경과시간. 없으면 null.
  recordingDurationSeconds: number | null;

  // STT Provider가 반환한 전체 audio duration. 기존 durationSeconds의 의미를 유지한다.
  providerDurationSeconds: number | null;

  segments: TranscriptSegmentDto[];
  deckKeywords: DeckKeywordDto[];
  slideTimeline: SlideTimelineEntryDto[];
};
```

### 4.1 요청 불변식

1. `contractVersion`은 숫자 literal `2`만 허용한다.
2. `recordingDurationSeconds`, `providerDurationSeconds`는 `null` 또는 0보다 큰 finite number다. 새 v2 sender는 0을 보내지 않는다.
3. v1 호환 adapter가 받은 `durationSeconds=0`은 Python 호출 전에 `providerDurationSeconds=null`로 정규화한다.
4. segment time은 둘 다 `null`이거나 둘 다 숫자여야 한다.
5. segment time이 숫자면 `0 <= startSeconds <= endSeconds`여야 한다.
6. timed segment의 `startSeconds`는 배열에서 감소할 수 없다. Provider가 반환한 미세 overlap은 허용한다.
7. `sttConfidence`와 segment `confidence`는 Provider raw score가 아니다. 승인된 normalization profile이 0~1 값으로 정규화한 경우에만 존재한다.
8. `normalizationProfileId`를 알 수 없으면 confidence object 전체를 `null`로 보낸다.
9. `slideTimeline.enteredSecond`는 오름차순이어야 하며 연속 중복 `slideId`를 제거한 뒤 전송한다.
10. `deckKeywords`는 evaluation snapshot 또는 materialized Deck의 공식 keyword만 사용한다.
11. transcript, segment text, audio URL/key/bytes를 Job payload에 넣지 않는다. worker가 DB·private cache에서 읽어 이 HTTP request body에서만 조립한다.

### 4.2 정상 요청 예시

아래 transcript는 실제 사용자 데이터가 아닌 합성 fixture다.

```json
{
  "contractVersion": 2,
  "runId": "run_fixture_1",
  "projectId": "project_demo_1",
  "deckId": "deck_demo_1",
  "transcript": "안녕하세요. 오늘은 Orbit 2를 소개합니다.",
  "language": "ko-KR",
  "provider": "openai",
  "model": "whisper-1",
  "sttConfidence": null,
  "recordingDurationSeconds": 12.5,
  "providerDurationSeconds": 12.4,
  "segments": [
    {
      "text": "안녕하세요.",
      "startSeconds": 0.2,
      "endSeconds": 1.4,
      "confidence": null
    },
    {
      "text": "오늘은 Orbit 2를 소개합니다.",
      "startSeconds": 2.7,
      "endSeconds": 6.8,
      "confidence": null
    }
  ],
  "deckKeywords": [
    {
      "keywordId": "keyword_orbit",
      "slideId": "slide_1",
      "text": "Orbit",
      "synonyms": [],
      "abbreviations": []
    }
  ],
  "slideTimeline": [
    { "slideId": "slide_1", "enteredSecond": 0 }
  ]
}
```

## 5. Python → TypeScript 분석 응답 DTO

응답은 현재 필드 이름을 최대한 유지하되, 0 sentinel을 공식 상태로 해석하지 않도록 nullable 값과 측정 상태를 함께 제공한다.

```ts
type SttQualityGate =
  | {
      version: 1;
      state: "passed";
      reasonCode: "CONFIDENCE_ACCEPTED";
      confidence: number;
      threshold: number;
      policyId: string;
    }
  | {
      version: 1;
      state: "failed";
      reasonCode: "LOW_TRANSCRIPTION_CONFIDENCE";
      confidence: number;
      threshold: number;
      policyId: string;
    }
  | {
      version: 1;
      state: "unavailable";
      reasonCode:
        | "CONFIDENCE_NOT_PROVIDED"
        | "QUALITY_POLICY_NOT_CONFIGURED";
      confidence: number | null;
      threshold: null;
      policyId: null;
    };

type MetricMeasurement = {
  measurementState: "measured" | "unmeasured";
  metricDefinitionVersion: number; // positive integer
  reasonCode: SpeechMeasurementReasonCode | null;
};

type AnalysisCapability = {
  state: "available" | "unavailable";
  source: "recording" | "provider" | "segment" | "slide-timeline" | "none";
};

type FillerOccurrence = {
  segmentIndex: number; // request segments의 0-based index
  startMs: number;
  endMs: number;
  precision: "word" | "segment";
  slideId: string | null;
};

type FillerWordDetailV2 = {
  word: string; // canonical 표현
  count: number;
  occurrences: FillerOccurrence[];
};

type PauseV1Detail = {
  startSecond: number;
  endSecond: number;
  durationSeconds: number;
};

type PauseV2Detail = {
  pauseId: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  position:
    | "between-sentences"
    | "within-sentence"
    | "slide-transition"
    | "unknown";
  intent: "intentional" | "hesitation" | "unknown";
  positionSource: "provider" | "slide-timeline" | "none";
  intentSource: "provider" | "none";
  beforeSlideId: string | null;
  afterSlideId: string | null;
  metricDefinitionVersion: 2;
};

type RehearsalAnalyzeResponseV2 = {
  contractVersion: 2;
  runId: string;

  durationSeconds: number | null;
  durationSource: "recording" | "provider" | "segment-window" | null;
  charactersPerMinute: number | null;
  wordsPerMinute: number | null;
  fillerWordCount: number | null;
  pauseCount: number | null; // pause v1 count

  sttQualityGate: SttQualityGate;
  measurements: {
    duration: MetricMeasurement; // version 1
    charactersPerMinute: MetricMeasurement; // version 1
    wordsPerMinute: MetricMeasurement; // version 1
    fillerWordCount: MetricMeasurement; // version 1
    pauseV1: MetricMeasurement; // version 1
    pauseV2: MetricMeasurement; // version 2
    keywordCoverage: MetricMeasurement; // version 1
  };
  capabilities: {
    recordingDuration: AnalysisCapability;
    providerDuration: AnalysisCapability;
    segmentTimestamps: AnalysisCapability;
    sttConfidence: AnalysisCapability;
    sentenceBoundaries: AnalysisCapability;
    pauseIntentClassification: AnalysisCapability;
  };

  speedSamples: Array<{
    startSecond: number;
    endSecond: number;
    wordsPerMinute: number;
  }>;
  fillerWordDetails: FillerWordDetailV2[];
  pauseDetails: PauseV1Detail[];
  pauseV2Details: PauseV2Detail[];

  // 기존 /rehearsal/analyze 결과 중 김동현 비소유 필드는 이름을 유지한다.
  // Quality Gate가 failed이거나 keyword가 없으면 null이다.
  keywordCoverage: number | null;
  missedKeywords: Array<{ slideId: string; keywordId: string; text: string }>;
  slideInsights: Array<{
    slideId: string;
    fillerWordCount: number;
    pauseCount: number;
  }>;
  aiSummary?: { headline: string; paragraphs: string[] };
  coaching?: {
    status: "succeeded";
    summary: string;
    strengths: string[];
    improvements: string[];
    nextPracticeFocus: string;
    message: string;
  };
};
```

### 5.1 응답 불변식

- `measurementState=measured`이면 해당 값은 `null`일 수 없고 `reasonCode=null`이다.
- `measurementState=unmeasured`이면 해당 값은 `null`이며 bounded `reasonCode`가 필요하다.
- `durationSeconds`와 `durationSource`는 둘 다 존재하거나 둘 다 `null`이다.
- `charactersPerMinute`가 measured이면 normalized language primary subtag가 `ko`여야 한다.
- `fillerWordCount`는 measured일 때 `sum(fillerWordDetails[].count)`와 같다.
- `pauseCount`는 measured일 때 `pauseDetails.length`와 같다.
- `pauseDetails`와 `pauseV2Details`는 `(start, end)` 오름차순이다.
- 각 detail은 `end >= start`이고 저장된 duration은 end-start와 1ms 또는 0.01초 허용오차 안에서 같다.
- `pauseV2Details[].intentSource="none"`이면 `intent="unknown"`이어야 한다.
- `pauseV2Details[].positionSource="none"`이면 `position="unknown"`이어야 한다.
- `sttQualityGate.state="failed"`이면 CPM/WPM/filler/pause v1·v2/keyword coverage는 모두 `unmeasured/LOW_TRANSCRIPTION_CONFIDENCE`이고 detail 배열과 `missedKeywords`는 빈 배열이다.
- `sttQualityGate.state="unavailable"`은 그 자체로 지표를 막지 않는다. 각 지표의 실제 근거 유무로 측정 상태를 결정한다.

## 6. 계산 계약

### 6.1 `durationSeconds`

다음 순서로 첫 번째 유효 값을 선택한다.

1. `recordingDurationSeconds > 0`이면 `durationSource="recording"`.
2. 그렇지 않고 `providerDurationSeconds > 0`이면 `durationSource="provider"`.
3. 그렇지 않고 유효 timed segment가 있으면 `max(endSeconds) - min(startSeconds)`를 사용하고 `durationSource="segment-window"`.
4. 결과가 0보다 크지 않으면 `durationSeconds=null`, `unmeasured/NO_DURATION_EVIDENCE`.

`segment-window`는 전체 녹음 시간이 아니라 발화가 확인된 구간의 fallback이다. UI와 trend는 source를 숨기지 않으며 recording duration과 동일한 품질의 값처럼 취급하지 않는다.

마지막 slide의 `actualSeconds`는 `recordingDurationSeconds`가 있을 때만 계산한다. Provider duration이나 segment window로 마지막 slide 종료를 추정하지 않는다.

### 6.2 STT Quality Gate

Quality policy registry key는 다음 네 값을 포함한다.

```ts
type SttQualityPolicyKey = {
  provider: string;
  model: string;
  languagePrimarySubtag: string;
  normalizationProfileId: string;
};
```

normalization profile registry와 Quality policy registry는 구분한다. 전자는 Provider raw score를 0~1 값으로 바꾸는 승인 규칙이고, 후자는 정규화된 값에 적용할 threshold다. 알 수 없는 `normalizationProfileId`는 DTO validation 오류로 422이며, 알려진 normalization profile에 Quality policy만 없는 경우는 200 `unavailable/QUALITY_POLICY_NOT_CONFIGURED`다.

- 현재 `openai/whisper-1`과 저장소의 WhisperX response DTO에는 승인된 normalized confidence가 없다. 초기 P0 registry는 비어 있다.
- `sttConfidence=null`이면 `unavailable/CONFIDENCE_NOT_PROVIDED`다.
- confidence는 있으나 registry key가 없으면 `unavailable/QUALITY_POLICY_NOT_CONFIGURED`다.
- key가 있고 `confidence >= threshold`이면 `passed/CONFIDENCE_ACCEPTED`다. 경계값은 통과다.
- key가 있고 `confidence < threshold`이면 `failed/LOW_TRANSCRIPTION_CONFIDENCE`다.
- Provider raw score를 단순 평균하거나 sigmoid 변환해 confidence를 만들지 않는다.
- threshold와 normalization이 승인되면 코드 registry revision, fixture, `docs/decision-log.md`를 같은 PR에서 추가한다.

P0가 confidence 미제공 Provider에서 동작하는 것은 확정 정책이며 임시 예외가 아니다. 다만 보고서에는 Gate가 검증되지 않았음을 `unavailable`로 남긴다.

### 6.3 한국어 `charactersPerMinute`

언어 primary subtag가 `ko`일 때만 공식 CPM을 만든다.

```text
normalized = NFKC(transcript)
characterCount = normalized에서 Unicode General Category L* 또는 N*인 code point 수
charactersPerMinute = roundHalfUp(characterCount * 60 / durationSeconds, 2)
```

- 공백, 줄바꿈, 문장부호, emoji, 통화·수학 기호는 제외한다.
- 한글 음절, 한글 자모, 영문자, 숫자는 포함한다.
- JavaScript의 UTF-16 code unit 수가 아니라 Unicode code point를 센다.
- `characterCount=0`이면 `unmeasured/EMPTY_TRANSCRIPT`다.
- 언어가 `ko`가 아니면 `charactersPerMinute=null`, `unmeasured/UNSUPPORTED_CPM_LANGUAGE`다.
- duration이 없으면 `unmeasured/NO_DURATION_EVIDENCE`다.
- `roundHalfUp(value, 2)`는 양수 기준 정확히 0.005 경계를 위쪽으로 반올림한다. Python은 `Decimal(...).quantize(..., ROUND_HALF_UP)`, TypeScript fixture helper는 같은 decimal rule을 사용한다. Python `round()`와 JavaScript `Math.round()`를 각자 사용하지 않는다.

예시:

```text
"안녕, Orbit 2!" → NFKC → 문자·숫자 8개(안,녕,O,r,b,i,t,2)
```

### 6.4 호환 `wordsPerMinute`

- 기존 v1 tokenization을 유지한다: `re.findall(r"[\w가-힣']+", transcript.lower())`와 동등한 규칙.
- 공식 duration resolver는 CPM과 동일하게 사용한다.
- 소수 둘째 자리에서 같은 rounding helper를 사용한다.
- CPM에서 WPM을 환산하거나 WPM에서 CPM을 환산하지 않는다.
- P0 한국어 보고서의 canonical speed는 CPM이다. WPM은 legacy report와 기존 화면 호환용이다.
- trend에서 `characters-per-minute`와 `words-per-minute`를 한 series에 섞지 않는다.

### 6.5 filler v1

- 현재 `FILLER_WORDS`, `FILLER_PHRASES`, 늘인 token canonicalization을 definition version 1로 유지한다.
- substring 검색을 금지하고 token 또는 phrase 단위로 일치시킨다.
- 여러 단어 phrase는 긴 phrase부터 매칭하고, 이미 phrase로 소비한 token을 다시 단일 filler로 세지 않는다.
- `fillerWordDetails[].word`는 canonical 표현이다.
- 정렬은 `count DESC`, 동률이면 `word ASC`다.
- segment timestamp만 있으면 occurrence range는 해당 segment 전체이고 `precision="segment"`다.
- Provider가 승인된 word timestamp를 제공할 때만 `precision="word"`를 사용한다.
- 확인할 수 없는 위치에는 occurrence를 만들지 않는다. count와 occurrence 수는 같지 않을 수 있다.
- `slideId`는 occurrence midpoint가 명시적 slide timeline 구간 안에 있을 때만 채운다.

### 6.6 pause v1

- 유효한 인접 timed segment 사이의 gap이 `>= 1.0초`이면 긴 멈춤 1회다.
- 정확히 1.0초인 경계는 포함한다.
- segment 내부 silence는 v1에서 추정하지 않는다.
- timestamp가 없으면 `pauseCount=null`, `unmeasured/SEGMENT_TIMESTAMPS_UNAVAILABLE`다.
- public legacy `pauseCount=0`과 측정 불가를 구분하려면 아래 additive measurement metadata를 반드시 함께 사용한다.

### 6.7 pause v2

pause v2는 v1 event를 대체하지 않고 같은 gap에 분류 축을 더한다.

- `metricDefinitionVersion=2`로 고정한다.
- slide entry가 pause range 안에 있으면 `position="slide-transition"`, `positionSource="slide-timeline"`이다.
- sentence boundary는 승인된 Provider sentence-boundary capability가 있을 때만 `between-sentences` 또는 `within-sentence`로 기록한다.
- 현재 OpenAI/WhisperX DTO에는 승인된 sentence-boundary capability가 없으므로 slide transition이 아닌 위치는 `unknown`이다.
- 의도한 멈춤과 말막힘은 승인된 Provider classification이 있을 때만 각각 `intentional`, `hesitation`으로 기록한다.
- 현재 Provider에서는 `intent="unknown"`, `intentSource="none"`이다.
- 단지 pause가 길다는 이유로 `hesitation`으로 분류하지 않는다.
- v1과 v2는 서로 다른 metric definition version이므로 trend/comparison에서 섞지 않는다.

### 6.8 slide timing

공식 `slideTimings`는 기존 architecture boundary대로 TS worker가 Deck snapshot과 run meta에서 만든다. Python 응답이 canonical slide timing을 다시 계산하지 않는다.

- `targetSeconds`: evaluation snapshot의 `estimatedSeconds` 또는 기존 target duration fallback.
- 중간 slide `actualSeconds`: 다음 서로 다른 slide의 `enteredSecond - current enteredSecond`.
- 마지막 slide `actualSeconds`: `recordingDurationSeconds - current enteredSecond`. 실제 recording duration이 없으면 해당 마지막 slide timing을 생략한다.
- 시간이 음수거나 순서가 역전되면 해당 항목을 생략하고 가짜 0을 만들지 않는다.
- 같은 slide의 연속 중복 entry는 한 번으로 정규화한다.

## 7. `ReportObservation`과 Evidence 원천값 매핑

김동현의 DTO는 최종 평가 상태나 Top 3를 결정하지 않는다. 실제 측정 원천값을 제공하고 공통 평가기가 `CriterionResult`와 `ReportObservation`을 만든다.

| 원천 | `ReportObservation.value` | `evidenceRefs` |
| --- | --- | --- |
| 전체 CPM | 선행 shared 확장에서 `{ kind: "characters-per-minute", value }` 추가 | run 전체는 빈 배열 허용 |
| 호환 WPM | 기존 `{ kind: "words-per-minute", value }` | run 전체는 빈 배열 허용 |
| filler 전체/slide | 기존 `{ kind: "count", metric: "filler-word-count", value }` | 실제 occurrence의 `time-range`만 사용 |
| pause v1 전체/slide | 기존 `{ kind: "count", metric: "pause-count", value }` | 실제 pause의 `time-range`만 사용 |
| pause v2 | 기존 `{ kind: "count", metric: "pause-count", value }` + `ReportObservation.metricDefinitionVersion=2` | 실제 pause의 `time-range`만 사용 |
| slide timing | 기존 `{ kind: "duration-seconds", value }` | 실제 slide entry/exit가 있을 때만 `time-range` |

규칙:

- `startMs`와 `endMs`는 실제 timestamp를 반올림한 정수이며 `startMs <= endMs`다.
- timestamp가 없으면 `evidenceRefs=[]`로 두고 가짜 `0..0` 범위를 만들지 않는다.
- `ReportObservation`에는 transcript, 문장 excerpt, audio ID/URL/key를 넣지 않는다.
- `ReportObservation.metricDefinitionVersion`은 positive integer이며 legacy observation은 default 1이다. pause v1은 1, pause v2는 2다.
- `CriterionResult.reasonCode`에는 `LOW_TRANSCRIPTION_CONFIDENCE`를 additive로 추가하고 `measurementState="unmeasured"`, `evaluationStatus="not-evaluated"`, `observationId=null` 조합에서만 허용한다.
- measured result의 `observationId`가 가리키는 observation은 같은 `criterionRef`와 scope를 사용한다.

## 8. Evidence Audio Clip 계약

### 8.1 생성 대상과 자르기 규칙

- `evaluationStatus`가 `failed` 또는 `partial`인 `CriterionResult`가 참조하는 `ReportObservation`만 후보가 된다.
- 실제 `time-range` evidence가 있어야 한다.
- P0에서는 observation 하나당 최대 Clip 1개다.
- 여러 time range가 있으면 `startMs ASC`, `endMs ASC` 첫 범위를 사용한다.
- 선택 범위의 midpoint를 중심으로 최대 12초를 자른다.
- 시작 경계가 0보다 작거나 종료 경계가 실제 recording duration을 넘으면 반대쪽으로 이동해 가능한 문맥을 유지한다.
- 실제 raw audio 길이를 모르면 알려진 범위 밖으로 padding하지 않는다.
- 결과는 항상 `0 < durationMs <= 12000`이어야 한다.
- Clip 생성 실패는 report·criterion 결과를 실패로 되돌리지 않는다.
- 평가 결과와 Clip metadata를 만든 뒤 raw audio를 삭제한다. 순서는 `측정 → 공통 평가 → Clip 생성 시도 → report 저장 → raw audio 삭제/삭제 예약`이다.

### 8.2 storage purpose와 내부 record

파생 Clip에는 새 private purpose `rehearsal-evidence-audio`를 사용한다. `rehearsal-audio` raw purpose를 재사용하지 않는다.

```ts
type RehearsalEvidenceClipRecord = {
  clipId: string;
  projectId: string;
  runId: string;
  observationId: string;

  // 내부 DB reference. public DTO와 Job result에는 넣지 않는다.
  fileId: string;
  purpose: "rehearsal-evidence-audio";

  startMs: number;
  endMs: number;
  durationMs: number; // 1..12000

  retentionState:
    | "retained"
    | "delete-pending"
    | "deleted"
    | "delete-exhausted";
  createdAt: string;
  expiresAt: string; // createdAt + 정확히 14일
  deletedAt: string | null;
};
```

불변식:

- `(projectId, clipId)`와 `(projectId, runId, observationId)`는 unique다.
- `endMs - startMs = durationMs`이고 `durationMs <= 12000`이다.
- `expiresAt = createdAt + 7 * 24시간`이다.
- `retained`이면 `deletedAt=null`이다.
- `deleted`이면 `deletedAt`이 필요하다.
- API는 `now >= expiresAt`인 Clip을 storage 삭제 전이라도 재생 불가로 취급한다.
- DB에는 object key가 필요할 수 있으나 public schema, generic Job payload/result, 업무 로그에는 노출하지 않는다.
- generic file upload/list/get/content API는 `rehearsal-evidence-audio`를 생성하거나 반환할 수 없다.

### 8.3 Owner-only Evidence API 응답 DTO

임재환 담당 Evidence API는 observation ID로 Clip을 조회한다. report에는 `clipId`나 URL을 넣지 않는다.

```text
GET    /api/v1/rehearsals/:runId/evidence/:observationId/audio
DELETE /api/v1/rehearsals/:runId/evidence/:observationId/audio
```

```ts
type RehearsalEvidenceAudioResponse =
  | {
      observationId: string;
      availability: "available";
      clip: {
        clipId: string;
        startMs: number;
        endMs: number;
        durationMs: number;
        expiresAt: string;
      };
      playback: {
        signedUrl: string;
        expiresAt: string; // 발급 시각 + 15분 이하
      };
    }
  | {
      observationId: string;
      availability: "unavailable";
      reason:
        | "not-created"
        | "generation-failed"
        | "expired"
        | "deleted"
        | "storage-unavailable";
    };

type DeleteRehearsalEvidenceAudioResponse = {
  observationId: string;
  deletionState: "deleted" | "pending";
};
```

권한·오류 규칙:

- 프로젝트 Owner만 signed read URL을 받을 수 있다.
- 같은 프로젝트 Editor·Viewer는 HTTP 403이다.
- audience는 HTTP 403이다.
- 다른 프로젝트이거나 존재를 숨겨야 하는 run/observation은 HTTP 404다.
- 인증이 없으면 HTTP 401이다.
- 권한은 Signed URL을 발급하는 매 요청마다 다시 확인한다.
- `playback.signedUrl`과 그 query string을 DB, 로그, telemetry, React Query 장기 cache, localStorage에 저장하지 않는다.
- `expired`, `deleted`, `generation-failed`는 정상적인 unavailable 응답이며 report 전체 오류가 아니다.
- DELETE는 idempotent다. Clip이 없거나 이미 삭제됐으면 HTTP 200과 `deletionState="deleted"`를 반환한다. 즉시 삭제하지 못하고 outbox에 등록했으면 HTTP 202와 `deletionState="pending"`을 반환한다.

### 8.4 조기 삭제·만료·재시도

- Owner 조기 삭제, 14일 만료, project/run 삭제는 같은 삭제 경로를 사용한다.
- 삭제는 기존 `storage_deletion_outbox`와 `storage-deletion-reconciler.ts`를 재사용한다. 두 번째 주기 삭제 loop를 만들지 않는다.
- object 삭제 성공 후 `retentionState="deleted"`, `deletedAt`을 기록한다.
- 실패하면 `delete-pending`으로 두고 최대 5회 idempotent retry한다.
- 5회 소진 시 `delete-exhausted`와 내부 alert를 기록하되 report는 유지한다.
- 재시도 payload와 로그에는 `clipId`, `projectId`, bounded reason만 남긴다. storage key, URL, transcript는 남기지 않는다.
- 최대 30일 연장, 사용자 지정 TTL, Editor 접근은 P0 DTO에 없다.

## 9. public shared 계약의 additive 확장

선행 계약 PR에서 최소 다음 변경이 필요하다.

1. `packages/shared/src/rehearsals/rehearsal.schema.ts`
   - `RehearsalReport.metrics.charactersPerMinute: number | null`을 default `null`로 추가한다.
   - `RehearsalReport.metrics.measurements`에 duration/speechRate/filler/pause v1·v2/keyword coverage의 `measurementState`, reason, metric version을 담는 strict object를 추가한다.
   - `RehearsalReport.metrics.sttQualityGate`와 `RehearsalReport.metrics.analysisCapabilities`를 strict object로 추가한다. public report의 unavailable reason에는 legacy default용 `LEGACY_QUALITY_GATE_UNKNOWN`을 추가한다.
   - `pauseV2Details`를 default `[]`로 추가한다.
   - 기존 `keywordCoverageMeasurement.reason`에 `low-transcription-confidence`를 additive로 추가한다.
   - `TrendMetric`에 `characters-per-minute`, unit `characters-per-minute`, direction `neutral`, `targetRange=null`을 추가한다.
   - `TrendSeries.direction`에 `neutral`을 추가하고 `neutral`은 `targetRange=null`만 허용한다.
2. `packages/shared/src/coaching/evaluator-lens.schema.ts`
   - 새 snapshot의 `metricDefinitionVersions`를 `{ timing: 1, speechRate: 1, filler: 1, pause: 1, pauseV2: 2, sttQualityGate: 1, semantic: 1 }`로 고정한다.
   - legacy snapshot에는 `speechRate: 1`, `pauseV2: 2`, `sttQualityGate: 1`을 schema default로 보완하되 실제 v2 측정값이 없으면 비교 불가다.
   - 기존 `pause: 1`은 pause v1 호환용으로 유지한다.
3. `packages/shared/src/coaching/evaluation-criterion.schema.ts`
   - `ReportObservation.value`에 `characters-per-minute` variant가 필요하다.
   - `ReportObservation.metricDefinitionVersion`을 positive integer, legacy default 1로 추가한다.
   - `CriterionResult.reasonCode`에 `LOW_TRANSCRIPTION_CONFIDENCE`를 추가하고 `not-evaluated` reason matrix에만 넣는다.
4. `packages/shared/src/files/file.schema.ts`
   - `rehearsal-evidence-audio`를 private purpose에 추가하고 generic file API에서 예약한다.
5. Clip metadata·Evidence API response 전용 strict schema를 `packages/shared/src/coaching` 또는 `packages/shared/src/rehearsals`에 추가한다.

legacy 처리:

- 기존 report에는 `charactersPerMinute`, measurement metadata, `pauseV2Details`가 없다.
- schema default로 `charactersPerMinute=null`, `pauseV2Details=[]`를 읽는다.
- legacy report의 Gate는 `unavailable/LEGACY_QUALITY_GATE_UNKNOWN`, capability는 모두 `unavailable/none`으로 읽는다.
- legacy 숫자만 보고 measured로 추정하지 않는다. measurement metadata가 없으면 `LEGACY_MEASUREMENT_STATE_UNKNOWN`으로 비교 불가 처리한다.
- v2 Python DTO가 null을 반환해도 기존 public 숫자 필드는 타입을 바꾸지 않는다. adapter는 호환 placeholder 0을 저장하되 additive metadata를 반드시 `unmeasured`로 저장하고, 새 API/UI/evaluator는 metadata가 `measured`일 때만 숫자를 사용한다.
- 새 CPM trend와 legacy WPM trend는 별도 series다. 하나의 line에서 단위를 섞지 않는다.
- 새 CPM trend는 `neutral` 설명형이며 pass/fail, 적정 범위, 색상 평가를 만들지 않는다.
- 기존 `wordsPerMinute`, `fillerWordCount`, `pauseCount`, `pauseDetails`, `speedSamples` 필드는 제거하거나 타입을 바꾸지 않는다.

## 10. HTTP 200·422 계약

### 10.1 HTTP 200

- 정상 v2 request는 HTTP 200과 strict `RehearsalAnalyzeResponseV2`를 반환한다.
- TypeScript worker는 `response.ok`만 보지 않고 shared 또는 전용 Zod schema로 response body를 parse한다.
- Python이 알 수 없는 response field를 보내거나 required field를 누락하면 TS worker는 해당 분석을 invalid provider response로 처리한다.

### 10.2 HTTP 422

다음 요청은 HTTP 422다.

- `contractVersion` 누락 또는 2가 아님
- root 또는 nested extra field
- 빈 ID 또는 128자 초과 ID
- 음수·무한대·숫자 문자열 duration/timestamp/confidence
- confidence가 0..1 밖임
- segment의 start/end 중 하나만 존재함
- `endSeconds < startSeconds`
- segment 또는 slide timeline 시간이 감소함
- 빈 segment text
- 알 수 없는 `normalizationProfileId`를 confidence object와 함께 보냄

422 body는 FastAPI validation detail의 안전한 subset만 사용한다.

```json
{
  "detail": [
    {
      "loc": ["body", "segments", 0, "endSeconds"],
      "msg": "endSeconds must be greater than or equal to startSeconds",
      "type": "value_error"
    }
  ]
}
```

`input`, transcript value, segment text, request body 전체는 422 응답과 로그에서 제거한다.

## 11. 필수 fixture와 경계 시험

### 11.1 TypeScript↔Python DTO

- 같은 합성 JSON fixture가 Zod request schema와 Pydantic request model을 모두 통과한다.
- Python response fixture가 Pydantic response model과 Zod response schema를 모두 통과한다.
- root extra field와 nested extra field가 각각 422다.
- 정상 fixture는 HTTP 200이고 response가 camelCase다.
- 422 body와 server log에 transcript/segment text가 없다.

### 11.2 duration·CPM·WPM

- recording 90, provider 89, segment 80이면 90/`recording`.
- recording 없음, provider 89, segment 80이면 89/`provider`.
- recording/provider 없음, segment 5..85이면 80/`segment-window`.
- 모든 시간 근거가 없으면 null/`NO_DURATION_EVIDENCE`이며 0으로 표시하지 않는다.
- `"안녕, Orbit 2!"`의 character count는 8이다.
- NFKC 전후 호환문자 fixture가 같은 count를 만든다.
- 구두점만 다른 transcript가 같은 CPM을 만든다.
- CPM과 WPM을 서로 환산하지 않는다.
- `ko`, `ko-KR`은 CPM 대상이고 `en`, 빈 language는 CPM 측정 불가다.

### 11.3 Quality Gate

- confidence 없음 → `unavailable/CONFIDENCE_NOT_PROVIDED`, 근거 있는 CPM/filler/pause는 측정 가능.
- confidence 있음 + policy 없음 → `unavailable/QUALITY_POLICY_NOT_CONFIGURED`.
- `confidence == threshold` → passed.
- `confidence < threshold` → failed, STT 파생 지표 null·detail 빈 배열.
- raw Provider score를 임의 normalized confidence로 받아들이지 않는다.

### 11.4 filler·pause

- 기존 단일 filler와 phrase filler fixture를 유지한다.
- substring 오탐이 없다.
- phrase와 단일 token이 중복 집계되지 않는다.
- filler 1회/2회 경계가 있다.
- timed occurrence와 위치 없는 count를 구분한다.
- gap 0.99초는 pause 아님, 1.00초와 1.01초는 pause다.
- timestamp 없음은 pause 0회가 아니라 unmeasured다.
- pause 안의 slide entry는 `slide-transition`이다.
- sentence/intent capability 없음은 `unknown`이다.
- pause v1과 v2를 같은 trend series에 넣지 않는다.

### 11.5 Clip·권한·삭제

- 12,000ms는 허용하고 12,001ms는 거부한다.
- observation당 Clip 최대 1개다.
- time range 없음, generation 실패, storage 실패에서 report는 유지된다.
- 생성일부터 14일 직전은 available, 정확히 14일은 expired다.
- Owner 200, Editor 403, Viewer 403, audience 403, cross-project 404다.
- Signed URL 만료는 15분 이하다.
- 조기 DELETE는 이미 없는 Clip에도 200/deleted로 멱등 동작한다.
- 조기 삭제와 TTL 삭제가 같은 outbox를 사용한다.
- 삭제 4회 실패 후 5회 성공 fixture가 있다.
- 5회 모두 실패하면 `delete-exhausted`와 alert가 남고 report는 유지된다.
- DB/Job/log/public report에 object key, raw audio ID, URL, transcript가 없다.

## 12. 구현 소유권과 순서

| 작업 | 최종 담당 | 계약상 입력·출력 |
| --- | --- | --- |
| TS 요청/응답 Zod DTO | 김동현 | 이 문서의 v2 DTO |
| Python Pydantic 경계 반영 | 이창원 | 김동현이 제공한 field·unit·fixture |
| CPM/WPM·filler·pause 계산 | 김동현 | strict v2 response |
| 공통 CriterionResult·Observation 평가 | 최영빈 | 김동현의 measured source와 Quality Gate |
| Clip retention worker | 김동현 | private Clip record와 outbox |
| Owner-only Evidence API·Player | 임재환 | 이 문서의 Evidence API response |
| 공통 schema 선행 PR | Phase 0 최종 담당자 + 네 명 검토 | `packages/shared`, migration, docs, decision log |

구현 순서:

1. 이 문서와 제품 P0 범위를 승인한다.
2. shared schema·migration·`docs/contracts.md`·`docs/decision-log.md` 선행 PR을 병합한다.
3. TypeScript DTO와 합성 fixture를 먼저 추가한다.
4. Python strict Pydantic model과 HTTP 422 시험을 연결한다.
5. duration/Quality Gate/CPM/WPM/filler/pause 계산과 cross-language fixture를 통과시킨다.
6. 공통 evaluator가 observation과 result를 만든다.
7. Clip 생성·보관·삭제를 raw audio 삭제 전에 연결한다.
8. Owner-only Evidence API·Player와 실제 E2E를 연결한다.

배포 cutover는 mixed-version 실패를 막기 위해 짧은 호환 창을 사용한다.

1. Python worker가 v1과 v2 request를 임시로 구분해 받고, v2 request에는 v2 response를 반환한다.
2. TS worker를 v2 sender/parser로 배포한다.
3. 실행 중인 구버전 worker와 재시도 Job이 모두 drain된 것을 확인한다.
4. 다음 배포에서 Python v1 adapter와 v1 fixture를 제거한다.

v1/v2 동시 지원은 배포 전환 수단일 뿐 제품 계약이 아니다. 신규 코드와 문서는 v2만 사용한다.

## 13. P0에서 명시적으로 제외하는 항목

- 공통 confidence 임계값 또는 승인되지 않은 Provider score normalization
- confidence 숫자 추정
- pause intent를 길이만으로 분류하는 heuristic
- 음량, 억양, 떨림, 발음 confidence
- transcript·raw audio·장기 Signed URL 보관
- 사용자 지정 Clip TTL
- 30일 Clip 보관 연장
- Editor의 Clip 접근
- 전체 transcript 다운로드 또는 audience 노출
- CPM/WPM 과거 데이터 환산·backfill

이 제외 항목은 P1 제품·개인정보·Provider 계약과 별도 decision log가 승인된 뒤 additive 계약으로만 확장한다.
