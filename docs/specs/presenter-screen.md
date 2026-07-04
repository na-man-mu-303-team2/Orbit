# Spec: 리허설/실전 발표 화면

**문서 유형:** Implementation Spec (담당 파트 전체 명세, 결정 확정본)
**상태:** Confirmed — 모호점은 질의응답으로 전부 해소됨(§2), 구현 착수 가능
**작성일:** 2026-07-02
**짝 문서:** [마일스톤 Plan](../plans/presenter-screen.md)
**외부 참조(인터페이스 접점만):** [W1 발화 큐](./presentation-flow-w1-speech-cues.md) · [W2 리허설 리포트](./presentation-flow-w2-rehearsal-report.md) · [W3 세션/청중](./presentation-flow-w3-live-session-audience.md) · [Live STT 키워드 컨트롤](./live-stt-keyword-control.md) · `docs/contracts.md`

---

## 1. 개요 — 이 파트가 소유하는 것

발표자가 리허설과 실전 발표에서 사용하는 화면 전체와 그 하부 엔진을 소유한다.

1. **슬라이드쇼 렌더링** — 에디터에서 적용한 애니메이션(나타나기/사라지기)·강조 효과가 최종 슬라이드쇼에서 그대로 재생되는 읽기 전용 렌더러. *(최우선 작업)*
2. **발표 화면 구성** — 노트북(발표자 모드) + HDMI 외부 모니터(슬라이드 전용 창) 분리, 보조 모니터 자동 인식.
3. **통합 STT 추상화** — 온디바이스/클라우드 엔진을 언제든 교체 가능한 인터페이스 + 동일 픽스처 평가 하네스. *(결합도 최소화 필수 영역)*
4. **발화 추적 기능** — 언급 키워드 표시, 누락 키워드 감지, 대본 커버리지 판정, 발화 기반 자동 강조/애니메이션, 대본 완료 인지 시 자동 슬라이드 전환.
5. **리허설 패널 UI** — 남은 시간 타이머, 시작 버튼, 키워드 체크리스트(우상단), 문장별 상태가 표시되는 대본, 실시간 조언(리허설 한정).
6. **녹음·업로드** — FLAC 녹음, 청크 업로드 클라이언트, **서버 수신 API**(수신·조립·저장·분석 Job 트리거까지).

이 문서는 담당 파트만 다룬다. 타 파트와의 연결은 §3의 인터페이스 계약으로만 접촉하며, 그 너머의 구현은 참조하지 않는다.

---

## 2. 확정 결정 (변경 시 이 표를 갱신하고 해당 모듈만 수정)

| # | 항목 | 확정 내용 |
|---|---|---|
| D1 | 플랫폼 | 브라우저 우선. `window.open` 슬라이드 창 + Chrome Window Management API 자동 배치, 미지원 브라우저는 수동 배치 폴백 |
| D2 | 자동 전환 범위 | 리허설·실전 모두 full-auto. 설정에서 모드별 on/off |
| D3 | 전환 조건 | 대본 커버리지 N% 이상(기본 70%, 50~95% 설정) AND 마지막 문장 언급 |
| D4 | 마지막 문장 판정 | 마지막 문장에서 자동 추출한 핵심 구절(2~4어절) 매칭 |
| D5 | 커버리지 측정 | 하이브리드 — 문장 단위(대표 구절 매칭 → 언급 문장 비율) 기본 + 어절 매칭 보조 신호 |
| D6 | 전환 실행 타이밍 | 조건 충족 후 발화 휴지에서만 2초 카운트다운, 발화 재개 시 자동 취소 |
| D7 | STT 추상화 | 통합 인터페이스 — sherpa·moonshine·Chrome Web Speech(온디바이스), WhisperX·Google Cloud STT(클라우드) 전부 스왑 가능, 동일 테스트 데이터로 검증 |
| D8 | 녹음 업로드 | 종료 후 청크 업로드 기본, 인터페이스는 실시간 스트리밍도 수용. 서버 수신 API 포함 |
| D9 | 녹음 포맷 | FLAC 16kHz mono (무손실 — 서버 정밀 분석 보장) |
| D10 | 실시간 조언 | 리허설만: 말 속도(빠름/느림) + 슬라이드 시간 초과. 실전은 타이머·키워드 체크만 |
| D11 | 대본 패널 | 문장별 상태 표시(언급된 문장 체크/흐림). 자동 스크롤 없음 |
| D12 | stepIndex 의미 | `stepIndex = 0` = 슬라이드 진입 직후, 트리거 스텝 실행 전. 스텝 = **distinct `order` 값을 정렬한 시퀀스**(order 값은 연속 비보장), stepIndex = 완료된 스텝 개수(0..S) — order 값 자체가 아님 |
| D13 | 애니메이션 재생 분류 | **하이브리드.** speechCue가 참조하지 않는 애니메이션 = 슬라이드 진입 시 자동 재생(order→delayMs→array index 순). speechCue가 `animationId`로 참조하는 애니메이션만 트리거 스텝. 발표자 최초 mount는 entry autoplay를 재생하고, 복원 전용 소비자는 opt-out할 수 있다. |
| D14 | 동일 order 실행 | 같은 `order` = 같은 스텝 그룹 = **동시 실행**(스키마상 order 중복 허용 확인). 각자의 delayMs/durationMs는 해당 order 그룹 시작 기준 개별 적용, 렌더 tie-break는 배열 인덱스 |
| D15 | presenterSettings scope | **전역 단일**(1차 최소). localStorage key `orbit:presenter:global:v1` — 버전 suffix로 마이그레이션 대비. 덱별 오버라이드는 필요 확인 시 후속(`orbit:presenter:deck:<deckId>:v1` 예약) |
| D16 | 문장 분할·구절 추출 방식 | **결정론적 휴리스틱**(문장부호 분리 + 조사 stopword 목록 + 2~4어절 추출). NLP 라이브러리 미도입. 조건: ① `PhraseExtractor` 인터페이스 격리+config 외부화, ② 대본·전사 **대칭 정규화**, ③ 조사 제거는 어간 2음절 이상 남을 때만 1회, ④ P3 하네스 매칭률 미달 시에만 형태소 분석기 v2 검토(근거 기반 승격) |
| D17 | W1 확정 전 큐 공급 | **Deck `slide.speechCues[]`가 1차 CueProvider 입력.** 슬라이드에 enabled Deck cue가 없을 때만 내부 config fallback을 사용한다. 내부 config 스키마는 W1 제안 `speechCueSchema`의 부분집합을 미러링해 provider 교체 없이 테스트·데모 데이터를 공급한다. Deck/internal cue가 모두 비어 있으면 전부 자동 재생(D13 기본 동작)으로 자연 퇴화한다. |
| D18 | P0 렌더러 구현 경계 | 읽기 전용 렌더링 공용 모듈은 `apps/web/src/features/slides/rendering`에 둔다. P0는 `triggerAnimationIds` 입력 포트만 받고 실제 `CueProvider` 연결은 P5에서 수행한다. `zoom-in`은 최종 표시, `zoom-out`은 최종 숨김, `rotate`는 360도 transient 후 원래 rotation으로 복원된다. |

**결정 대기 항목: 없음.** 구현 중 새 모호점 발생 시 임의 판단하지 않고 D# 추가 질의 후 진행.

---

## 3. 외부 인터페이스 경계

### 3.1 이 파트가 의존하는 것 (입력 계약)

| 계약 | 내용 | 미확정 시 대응 |
|---|---|---|
| Deck JSON | `slides[].elements`, `animations[]`(order/durationMs/delayMs/easing), `keywords[]`(text·synonyms·abbreviations), `speakerNotes` | 기존 계약 — 확정됨 |
| `speechCues[]` (W1) | 강조/애니메이션/전환 큐 | **CueProvider 인터페이스로 격리** — W1 확정 전엔 내부 config 구현체 사용, 확정 시 provider만 교체 |
| `estimatedSeconds` (M9) | 슬라이드별 목표 시간 | 미배포 시 `targetDurationMinutes / 슬라이드 수` 균등 분배 폴백 |
| rehearsal-run 계약 | run 생성·상태 전환 | 기존 계약 — 오디오 청크 부분만 §6.3에서 확장 |

### 3.2 이 파트가 제공하는 것 (출력 계약)

| 계약 | 소비자 | 형태 |
|---|---|---|
| PresentationStateBus 이벤트 (`slide-changed`, `highlight-changed`, `animation-step-changed` + 세션 상대 타임스탬프) | W3 청중 방출 게이트웨이, 리허설 로그 | 로컬 이벤트 구독. **네트워크 방출은 소비자 책임** — 이 파트는 이벤트 정확성·순서 보장까지 |
| 슬라이드 전환 로그 (run 메타) | W2 시간 분배 분석 | run 종료 시 `{slideId, enteredAt}[]` 업로드 |
| 조립된 녹음 파일 (fileId + 매니페스트) | 서버 분석 파이프라인(W2/W6) | StoragePort 저장 완료 후 fileId 전달 — 분석과의 계약은 이것뿐 |

### 3.3 타팀 합의 필요 항목 (착수 전 체크포인트)

1. **분석 담당자** — 녹음 포맷 D9(FLAC 16kHz mono) 및 매니페스트 필드 공유·합의.
2. **W3 담당자** — `animation-step-changed` payload 형태 합의(§6.4 제안안 기준).
3. **W1 담당자** — `speechCueSchema` 필드 확정 일정 확인(차단 아님 — CueProvider로 선행).

---

## 4. 아키텍처

```
                    ┌─────────────────────────────────────────────┐
                    │ PresentationStateStore (단일 상태 원천)      │
                    │ {slideId, stepIndex, highlights, mode,      │
                    │  timer, sttStatus, recordingStatus}         │
                    └───▲────────────────▲───────────────▲────────┘
       상태 변경 커맨드  │                │               │ 구독
  ┌─────────────────────┴──┐  ┌──────────┴─────────┐  ┌──┴───────────────────┐
  │ AdvanceController      │  │ CueEngine          │  │ SlideshowRenderer    │
  └───▲────────▲───────────┘  └──────▲─────────────┘  │ (슬라이드 창)         │
      │        │                     │                └──────────────────────┘
      │   ┌────┴─────────────────────┴──┐        ┌──────────────────────────┐
      │   │ SpeechTracker               │◀───────│ SttPort                  │
      │   └─────────────────────────────┘  전사   │ (엔진 어댑터 4종+)        │
  ┌───┴──────────────┐   ┌────────────────────┐  └──────────────────────────┘
  │ PauseDetector    │   │ Recorder→Uploader  │──▶ 서버 수신 API (§6.3)
  └──────────────────┘   └────────────────────┘
  ┌──────────────────┐   ┌────────────────────┐  ┌──────────────────────────┐
  │ DisplayManager   │   │ RehearsalPanel UI  │  │ PresentationStateBus     │
  └──────────────────┘   └────────────────────┘  └──────────────────────────┘
```

**결합도 원칙** (전 모듈 공통, 코드 리뷰 기준):

- 모듈 간 통신은 인터페이스(포트)와 이벤트로만. 구체 클래스 직접 참조 금지.
- **판정·정책·실행 분리:** SpeechTracker(신호) → AdvanceController(정책 D3·D6) → StateStore(실행). 정책 변경이 판정 로직에 무영향.
- **렌더러는 상태의 함수:** SlideshowRenderer는 `(slideId, stepIndex, highlights)`만 구독. 트리거 소스(음성/수동/자동)를 모름.
- **녹음과 인식 분리:** 같은 마이크 스트림을 fork할 뿐 Recorder와 SttPort는 서로의 존재를 모름.
- 판정 파라미터(임계·퍼지 허용치·휴지 길이)는 전부 config 객체로 외부화 — 튜닝에 코드 변경 불필요.

---

## 5. 모듈 상세 설계

### 5.1 SlideshowRenderer — 빌드 스텝 상태 머신 *(최우선)*

**상태 모델 (D12·D13·D14):** 발표 상태 = `(slideId, stepIndex)`.

- **애니메이션 분류(D13):** 슬라이드 진입 시 `speechCues[]`가 참조하는 animationId 집합을 계산 → **큐 미참조 애니메이션은 진입 시 자동 재생**(order→delayMs→array index 순, 1회), **큐 참조 애니메이션만 트리거 스텝**을 구성. 최초 발표자 mount는 entry autoplay를 재생하고, 복원 전용 렌더링은 이를 opt-out할 수 있다.
- **스텝 시퀀스(D12):** 트리거 대상 애니메이션들의 distinct `order` 값을 오름차순 정렬한 것. `stepIndex = 0` = 진입 직후(자동 재생은 완료 또는 진행 중, 트리거 스텝은 미실행), `stepIndex = k` = k번째 스텝까지 완료. order 값은 연속 비보장이므로 stepIndex는 개수 기준.
- **동일 order(D14):** 같은 스텝 그룹으로 동시 실행. 그룹 내 각 애니메이션의 delayMs/durationMs는 해당 order 그룹 시작 기준 개별 적용(시차 연출 가능), 렌더 tie-break는 배열 인덱스.
- **결정론 복원 요건:** 임의 시점에 `(slideId, k)`를 받아도 최종 화면을 전이 없이 즉시 구성할 수 있어야 한다(창 재열기·크래시 복구 대비). 구현: 각 요소의 "스텝 k에서의 가시성/속성"을 순수 함수로 계산 → 전이는 그 위의 장식. **복원 시 자동 재생 애니메이션은 항상 완료 상태로 취급**(재생 반복 없음).
- **전이:** `appear`, `fade-in`, `zoom-in`, `disappear`, `fade-out`, `zoom-out`, `rotate`를 지원한다. `durationMs`와 `delayMs`를 존중하되 유효 전이는 500ms로 캡한다. 스텝 이벤트가 몰리면 중간 전이를 접고 최종 상태로 점프한다.
- **스텝 전진 커맨드 통합:** 수동 키(Space/→/클리커) · CueEngine(음성) · `delayMs` 자동 타이머 — 전부 동일한 `next-step` 커맨드. 마지막 스텝에서 `next-step` = 다음 슬라이드 요청이며, 마지막 슬라이드의 마지막 스텝에서는 현재 상태를 유지한다.
- **강조:** `highlights: {elementId, active}[]` 상태 → 요소 오버레이(에디터 정의 강조 스타일 존중, 기본: 스케일+글로우). active 상태는 inactive 이벤트가 들어올 때까지 유지되며, group 내부 child element도 highlight 대상이다.
- **렌더 기반:** 기존 편집기 Konva 요소 매핑을 `apps/web/src/features/slides/rendering`의 공용 읽기 전용 뷰어 모드로 추출한다. 발표 렌더러는 편집 상호작용 컴포넌트(`EditableElementNode`, `Transformer`, inline text editor, canvas hooks)를 import하지 않는다.
- **thumbnail fallback:** `elements`가 비어 있고 `thumbnailUrl`만 있는 imported/image-only slide는 발표자 main preview에서 thumbnail을 표시한다.
- **수동 입력:** P0 기준 Space/ArrowRight/PageDown/Enter는 `next-step`, ArrowLeft/PageUp은 이전 슬라이드 복원(`stepIndex=0`)으로 매핑한다. 입력 필드, 버튼, 링크, summary, role 기반 interactive control, contenteditable에 포커스가 있을 때는 발표 키 입력을 무시한다.

### 5.2 DisplayManager — 창/보조 모니터 (D1)

- 슬라이드 창: `window.open("/present/:deckId")` + Fullscreen API. 발표자 창과 **BroadcastChannel**로 StateStore 동기(슬라이드 창은 수신·렌더 전용).
- 보조 모니터: `window.getScreenDetails()`(Window Management API) 지원+권한 허용 시 외부 모니터 좌표로 창 이동 후 전체화면. 거부/미지원(Safari·Firefox): 창만 열고 "발표 모니터로 옮긴 뒤 F11" 인라인 가이드.
- 모니터 연결/해제 이벤트 구독 → 발표자 뷰 경고 + 원클릭 재열기(§5.1 상태 점프로 복원).
- 단일 화면 폴백: 보조 모니터 없음 → "슬라이드 전체화면 + 미니 오버레이(타이머만)" 모드.

### 5.3 SttPort — 통합 STT 추상화 (D7)

```ts
interface SttPort {
  readonly capabilities: {
    onDevice: boolean;        // 클라우드 엔진 사용 시 동의 게이트 발동
    streaming: boolean;       // partial 결과 지원
    keywordBiasing: boolean;  // hotword 지원
    languages: string[];
  };
  start(config: SttSessionConfig): Promise<void>;
  stop(): Promise<void>;
  onResult(cb: (r: SttResult) => void): Unsubscribe;
  onError(cb: (e: SttError) => void): Unsubscribe;
}
interface SttSessionConfig {
  language: "ko";
  biasPhrases?: string[];       // 키워드·대표 구절·큐 트리거 (미지원 엔진 무시)
  audioSource: MediaStreamTrack;
}
interface SttResult {
  text: string;
  isFinal: boolean;
  timestampMs: [number, number]; // 세션 상대
  confidence?: number;
}
```

- **어댑터:** SherpaAdapter·MoonshineAdapter(기존 어댑터 래핑 — 로직 재사용, 시그니처 정렬), WebSpeechAdapter, CloudAdapter(WhisperX/Google — 스트리밍 프로토콜별 구현). 위치: 1차 `apps/web/src/features/stt`, 안정화 후 packages 승격 검토.
- **엔진 선택:** 설정 UI, 기본 온디바이스. `onDevice: false` 선택 시 고지+동의 필수, **클라우드 엔진도 인식 용도로만 사용하고 전사·오디오를 서버 로그에 남기지 않는다**(기존 로깅 규칙 준수).
- **능력 폴백:** `keywordBiasing: false` → SpeechTracker의 클라이언트측 퍼지 매칭만으로 동작(판정 인터페이스 동일). `streaming: false` → 유사-스트리밍(짧은 세그먼트 반복 인식) 래퍼.
- **평가 하네스:** 픽스처 오디오(기존 `live-stt-ko-audio` 확장) 주입 → 엔진별 동일 시나리오 실행 → 구절 인식률·키워드 히트율·지연 리포트. **새 엔진 추가 = 어댑터 1개 + 하네스 통과.** 온디바이스 엔진은 CI 회귀에 포함.

### 5.4 SpeechTracker — 발화 추적·판정 (D3·D4·D5)

**전처리(슬라이드 진입 시 1회, D16):**
- `PhraseExtractor`(인터페이스 격리): speakerNotes 문장 분할(문장부호 기준 + 소수점·말줄임·무부호 꼬리 가드) → 문장별 **대표 구절**(2~4어절, 조사 stopword 제거 — 어간 2음절 이상 남을 때만 1회) 자동 추출. 마지막 문장의 구절은 종결 트리거 겸용(D4). 정규화 규칙은 전사 측 매칭에도 **대칭 적용**(오차 상쇄). 규칙·목록은 config 외부화 — 형태소 분석기 교체 시 SpeechTracker 무변경.
- 대표 구절 + 슬라이드 키워드(text·synonyms·abbreviations) + 큐 트리거를 `biasPhrases`로 SttPort에 전달.

**런타임 판정:**
- 문장 매칭(기본): 전사에서 대표 구절 퍼지 매칭(공백·조사 변형 허용) → 문장 "언급됨". 커버리지 = 언급 문장 / 전체 문장.
- 어절 보조(하이브리드): 전사↔대본 어절 매칭 비율 병렬 계산. **문장 커버리지가 임계 ±10%p 구간일 때만** 보조 신호로 가감(대표 구절을 놓쳤으나 내용은 말한 경우 보정).
- 키워드: `keyword-hit(keywordId)` 발생, 슬라이드 이탈 시 미히트 키워드를 `keyword-missing`으로 확정(체크리스트·리허설 로그용).

**출력 이벤트:** `sentence-covered` / `coverage-updated(ratio)` / `last-sentence-spoken` / `keyword-hit` / `keyword-missing`. 소비자는 AdvanceController·CueEngine·RehearsalPanel.

### 5.5 PauseDetector

- 오디오 레벨(RMS)+전사 무갱신 결합으로 발화 휴지 판정(기본 700ms, config). Recorder와 무관하게 마이크 fork 스트림에서 동작.
- 출력: `pause-started` / `speech-resumed`.

### 5.6 AdvanceController — 자동 전환 (D2·D3·D6)

상태 머신:

| 상태 | 전이 조건 | 다음 |
|---|---|---|
| `tracking` | `coverage ≥ N` AND `last-sentence-spoken` | `ready` |
| `ready` | `pause-started` | `countdown` (2초 UI — 발표자 뷰 표시, 슬라이드 창 미표시) |
| `countdown` | `speech-resumed` | `ready`로 복귀(취소) |
| `countdown` | 2초 경과 | `advance` 커맨드 발행 → 다음 슬라이드 `tracking` |
| 모든 상태 | 수동 전환(키/클리커/음성 명령) | 즉시 통과(오버라이드) |

- `advancePolicy` 설정: `{rehearsal: on/off, live: on/off, threshold: 0.5~0.95(기본 0.7), pauseMs, countdownMs}` — 1차 로컬 설정, 덱/프로젝트 승격은 후속.
- "이전 슬라이드" 복귀 시 해당 슬라이드 tracker 리셋(재추적). 마지막 슬라이드에서는 전환 대신 "발표 종료" 제안.
- 커버리지 미달로 전환이 장기간 안 되는 경우: 자동 강행 금지, 발표자 뷰에 "수동 전환 안내" 배지만.

### 5.7 CueEngine — 발화 기반 강조/애니메이션

- `CueProvider` 인터페이스로 큐 소스 격리(D17): 현재 구현은 Deck `slide.speechCues[]`를 우선 사용하고, 해당 슬라이드에 enabled Deck cue가 없을 때만 내부 config fallback을 사용한다. config 빈 덱은 D13에 의해 전부 자동 재생으로 자연 퇴화(별도 모드 불필요). P0는 `getCues(slideId)`에서 파생한 트리거 animationId 집합만 사용, phrases는 P5에서 사용.
- 트리거 매칭(SpeechTracker 구절 매칭 재사용) 시: `highlight` → StateStore 강조 토글, `animation` → `next-step` 커맨드, `advance-slide` → AdvanceController ready 조건과 AND(단독 전환 금지 — 기존 원칙 승계).

### 5.8 RehearsalPanel — 발표자 뷰 우측 패널 (D10·D11)

- **타이머:** 전체 남은 시간 카운트다운(`targetDurationMinutes`) + 현재 슬라이드 경과/목표(`estimatedSeconds` 또는 균등 폴백). 목표 초과 시 색상 경고.
- **키워드 체크리스트(우상단):** 현재 슬라이드 키워드, `keyword-hit` 시 체크 표시.
- **대본:** 문장 단위 렌더, `sentence-covered` 시 체크/흐림. 자동 스크롤 없음(D11).
- **실시간 조언(리허설 모드에서만 렌더):** 말 속도 배지(직전 30초 이동 평균 WPM, 빠름/느림 임계 config) + 슬라이드 시간 초과 배지. 실전 모드는 이 컴포넌트 자체를 마운트하지 않음.
- 시작/정지 버튼: SttPort 세션 + Recorder + 타이머 + run 생성을 원자적으로 제어. 부분 실패 시(예: 마이크 거부) 명확한 에러 상태로 전체 롤백.

### 5.9 Recorder → ChunkUploader → 서버 수신 API (D8·D9)

**클라이언트:**
- Recorder: 마이크 fork → AudioWorklet PCM 캡처 → WASM FLAC 인코딩(16kHz mono, 백그라운드) → 30초 청크를 IndexedDB에 버퍼(탭 크래시 대비).
- 업로드 포트:

```ts
interface RecordingUploadPort {
  begin(runId: string, meta: { codec: "flac"; sampleRate: 16000; channels: 1 }): Promise<void>;
  uploadChunk(runId: string, chunkIndex: number, blob: Blob, sha256: string): Promise<void>; // 멱등
  complete(runId: string, manifest: { chunkCount: number; totalDurationMs: number }): Promise<void>;
}
```

  기본 구현 = 종료 후 순차 업로드(재시도·재개). 실시간 스트리밍 구현체도 같은 포트로 추가 가능(호출 시점 정책만 차이).

**서버 (내 구현):**
- `POST /rehearsal-runs/:id/audio-chunks/:index` — 해시 검증, 중복 수신 멱등 처리, 임시 저장.
- `POST /rehearsal-runs/:id/audio-complete` — 매니페스트 검증(청크 수·총 길이) → 청크 조립 → StoragePort(MinIO/S3) 저장 → run 상태 `processing` 전환 → 기존 `rehearsal-stt` Job 트리거.
- 불일치/누락 시 409 + 누락 인덱스 목록 반환(클라이언트 재개용). raw audio는 분석 직후 삭제 — 기존 규칙 무변경.

---

## 6. 데이터·계약 정의

### 6.1 설정 (`presenterSettings`, D15 — 전역 단일)

`{ sttEngine, advancePolicy{...}, paceAdvice{fastWpm, slowWpm}, recording{enabled} }`

- 저장: localStorage `orbit:presenter:global:v1` (스키마 변경 시 v2 마이그레이션). 덱별 오버라이드는 1차 범위 외 — key namespace만 예약(`orbit:presenter:deck:<deckId>:v1`).

### 6.2 리허설 로그 (run 메타 — W2 입력)

`{ slideTimeline: {slideId, enteredAt}[], missedKeywords: {slideId, keywordId}[], adviceEvents: {type, at}[] }` — run 종료 시 업로드. W2 담당자와 스키마 공유(§3.3).

### 6.3 오디오 청크 REST

§5.9 서버 항목 참조. `docs/contracts.md`의 리허설 Run 섹션에 추가 기술(구현 시 동반 갱신).

### 6.4 `animation-step-changed` (제안 — W3 합의 대상)

`{ deckId, slideId, stepIndex, occurredAt }` — 기존 `slide-changed` payload 스타일 준수. 합의 전까지 StateBus 내부 이벤트로만 사용.

---

## 7. 비기능 요구

- **성능:** 슬라이드 전이 60fps 목표(전이 500ms 캡·동시 tween 상한), FLAC 인코딩은 Worklet/Worker에서만(메인 스레드 차단 금지), 저사양에서 인코딩 지연 시 청크 길이 자동 확대.
- **프라이버시:** 전사·raw audio 서버 로그 금지(기존 규칙), 클라우드 STT는 명시 동의 후에만, 녹음은 시작 버튼 = 동의 UI 통합.
- **복원력:** 슬라이드 창·발표자 창 어느 쪽이 죽어도 재열기+상태 점프로 복구, 업로드는 청크 멱등으로 재개.
- **접근성:** 슬라이드 창 전이는 `prefers-reduced-motion` 시 즉시 상태 전환.

## 8. 테스트 전략

| 대상 | 방법 |
|---|---|
| SttPort 어댑터 | 픽스처 오디오 하네스 — 엔진별 동일 시나리오, 통과가 머지 조건. 온디바이스 엔진 CI 회귀 |
| SpeechTracker | 전사 시퀀스 픽스처(정타/오인식/부분 발화) 스냅샷, 하이브리드 경계(±10%p) 케이스 |
| AdvanceController | 상태 머신 전 경로 단위 테스트(ready→countdown→cancel/advance, 오버라이드 우선) |
| SlideshowRenderer | `(slideId, step)` 점프 복원 결정론 테스트, order 준수, reduced-motion |
| DisplayManager | Playwright 멀티 컨텍스트 — 창 동기·폴백 가이드 경로 |
| 업로드 | 청크 누락/중복/재시도 멱등, 매니페스트 불일치 409, IndexedDB 재개 |
| 통합 E2E | 픽스처 오디오 재생 → 문장 체크 → 70%+종결 구절 → 휴지 → 카운트다운 → 자동 전환 → 애니메이션 스텝 실행 (1 시나리오, CI) |

## 9. 리스크

| 리스크 | 완화 |
|---|---|
| 한국어 인식률로 문장 매칭 저조 → 전환 불발 | 하이브리드 보조(D5), 자동 강행 금지+수동 안내 배지, 퍼지 임계 config 튜닝 |
| full-auto 실전 오전환 | 휴지+카운트다운(D6), 발화 재개 취소, "이전 슬라이드" 복구, 첫 사용 전 리허설 권장 안내 |
| FLAC 인코딩 부하 | Worklet/WASM 백그라운드, 청크 확대, 최악 폴백 PCM 업로드(수신 API codec 필드로 구분) |
| Window Management 권한 거부 | 수동 배치 가이드 — 기능 차단 아님 |
| W1/W3/M9 계약 지연 | CueProvider·StateBus·균등 분배 폴백으로 전부 선행 가능 — 외부 확정은 교체만 |
