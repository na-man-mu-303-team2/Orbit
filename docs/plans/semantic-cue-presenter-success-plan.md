# Semantic Cue 기반 발표 성공 루프 개선 계획

**상태:** Implementation-ready draft  
**작성일:** 2026-07-10  
**범위:** 발표 준비, 리허설, 리포트, 회차 비교, 실전 발표 보조  
**최상위 목적:** 발표자가 발표를 더 잘 준비하고, 실제 발표를 더 잘할 수 있게 한다.  
**구현 시작 순서:** `S00 → S01 → S02 → S03`  

## 1. 문서의 역할

이 문서는 현재 구현된 `slide.semanticCues`, semantic sentence matching, 선택적 browser NLI, rehearsal report 흐름을 사용자 성과 중심으로 재정렬하는 실행 계획이다.

기존 문서를 폐기하거나 덮어쓰지 않는다.

- `docs/plans/semantic-cue-nli-runtime-plan.md`는 Semantic Cue/NLI 런타임을 도입한 배경과 기술 구조를 설명하는 참조 문서로 유지한다.
- `docs/plans/semantic-sentence-presenter-matching.md`와 `docs/plans/semantic-utterance-outcome-classification.md`는 문장 단위 의미 매칭의 설계 근거로 사용한다.
- `docs/spikes/e5-prefix-mode-calibration.md`와 `docs/spikes/semantic-cue-browser-nli-poc.md`는 모델 선택과 성능 검증의 근거로 사용한다.
- 이 문서는 현재 코드와 샘플 덱을 다시 점검한 결과를 기준으로, 위 문서들의 **제품 출시 순서, 품질 기준, 리포트 구조**를 보완하고 우선순위를 재정의한다.

| 문서 | 이 계획과의 관계 |
|---|---|
| `semantic-sentence-presenter-matching.md` | 구현된 대본 문장 진행·presenter-only 경계를 기반으로 사용하며 재구현하지 않는다. 남은 real-browser E2E는 검증 의존성으로 둔다. |
| `semantic-utterance-outcome-classification.md` | 기존 script sentence의 `covered/paraphrased/ad-lib/missed`를 유지한다. 이 계획은 cue-level outcome 의미만 새로 정의한다. |
| `semantic-cue-nli-runtime-plan.md` | 부분 구현된 historical plan으로 유지한다. `slide.semanticCues`, provider/worker, feature flag, action safety는 보존한다. browser-first NLI, content slide당 3~7개 필수 cue, debug evidence 중심 report 우선순위는 이 계획이 대체한다. |
| `semantic-cue-browser-nli-poc.md` | 약 428MB artifact와 timeout 결과를 유효한 부정적 근거로 유지한다. 이 계획이 결과를 무효화하지 않는다. |
| `e5-prefix-mode-calibration.md` | script sentence matching의 출발점으로 유지한다. cue-level 품질 gate로 그대로 재사용하지 않는다. |
| `docs/contracts.md` | 이 계획보다 우선하는 canonical 계약이다. 구현 전에 Phase 0에서 현재 코드와 정합화하며, 이 문서가 계약을 직접 대체하지 않는다. |

## 2. 결론

Semantic Cue 방향 자체는 ORBIT의 목적에 적합하다. ORBIT은 범용 말하기 점수 서비스가 아니라, **발표자료를 이해하고 이 장표에서 전달해야 할 내용을 도와주는 발표 코치**가 되어야 한다.

다만 현재 상태에서 NLI 정확도, 객체 태그, 자동 액션을 먼저 고도화하면 목적에서 빗나갈 수 있다. 현재 가장 큰 사용자 문제는 다음 세 가지다.

1. 준비 단계에서 무엇을 반드시 말해야 하는지 믿을 수 있게 정리되지 않는다.
2. 리허설 후 무엇을 말했고 무엇을 놓쳤는지 사용자 언어로 알려주지 못한다.
3. 다음 회차와 실전에서 이전 실수를 줄이도록 연결되지 않는다.

따라서 첫 제품 단위는 `NLI 기능`이 아니라 다음의 닫힌 루프다.

```text
발표 준비
  → AI가 원자적 핵심 메시지 후보를 제안
  → 발표자가 필수/보조/제외를 확인
  → 리허설에서 의미 전달 여부를 수집
  → 발표 후 서버에서 최종 판정
  → 다음 연습 목표 3개 제안
  → 다음 회차 시작 전 및 해당 슬라이드 진입 시 반복 실수만 상기
```

NLI, 임베딩, 키워드, alias는 이 루프를 구현하기 위한 수단이다. 사용자가 보게 될 최종 결과는 모델 점수가 아니라 다음과 같은 행동 지침이어야 한다.

> “6번 슬라이드에서 RSP의 의미는 설명했지만, 공간 확보 전에 쓰면 Out Of Bound가 생긴다는 원인은 빠졌습니다. 다음 연습에서는 ‘공간 확보 후 복사’ 순서를 먼저 한 문장으로 말하세요.”

## 3. 현재 기준선과 확인된 문제

### 3.1 샘플 덱 결과

`deck_semantic_cue.json`을 기준으로 확인한 현재 결과는 다음과 같다.

| 항목 | 현재 상태 | 사용자 영향 |
|---|---:|---|
| 전체 슬라이드 | 30장 | - |
| 전체 Semantic Cue | 28개 | 콘텐츠 밀도에 비해 적음 |
| cue가 있는 슬라이드의 cue 수 | 모두 1개 | 일부만 말해도 슬라이드 전체를 설명한 것으로 오인 가능 |
| `required` | 28개 모두 `true` | 실제 시간 안에 우선순위를 정할 수 없음 |
| `priority` | 28개 모두 `1` | 핵심과 보조 설명을 구분할 수 없음 |
| `aliases` | 모두 비어 있음 | 한국어 STT에서 영문·약어·함수명 인식이 취약함 |
| `negativeHints` | 23개 cue에서 비어 있음 | 관련 단어만 말한 경우와 실제 설명을 구분하기 어려움 |
| slide keywords | 없음 | 현재 keyword coverage는 사실상 측정 불가 |
| speaker notes가 있는 cue 슬라이드 | 7장 | 나머지 cue는 시각 요소만으로 추론되어 신뢰도 표시가 필요함 |
| action | 없음 | `triggerActionIds`는 현재 제품 가치에 기여하지 않음 |

특히 복합 기술 슬라이드가 한 개 cue로 요약되어 있다. 예를 들어 `memcpy` 인자, `NULL` 역참조, 포인터 크기 하드코딩은 서로 독립적으로 평가해야 하지만 현재는 하나의 의미에 묶여 있다. 이런 구조에서는 좋은 NLI 모델을 붙여도 “어느 부분을 놓쳤는지”를 정확히 리포트할 수 없다.

### 3.2 생성·저장 흐름

- LLM prompt에는 atomic cue, speaker-centric hypothesis, technical alias 규칙이 추가되고 있으나 prompt만으로 품질을 보장하지 못한다.
- cue ID가 슬라이드와 순번을 기반으로 생성되어 재생성 시 안정성이 약하다. 지난 회차 비교가 다른 의미의 cue를 같은 것으로 보거나, 같은 cue를 새 것으로 볼 수 있다.
- extraction job은 시작 시점의 deck revision을 고정하지 않고 완료 시 덱을 갱신할 수 있어, 분석 중 사용자가 편집하면 변경을 덮어쓸 위험이 있다.
- 응답에서 특정 슬라이드가 빠지면 기존 cue를 빈 배열로 교체할 가능성이 있다.
- `force` 입력이 계약에는 있으나 실제 재생성 정책으로 완전히 연결되지 않았다.
- element/action 삭제와 speaker note·텍스트 수정 시 연결된 cue를 삭제하거나 `stale`로 만드는 lifecycle이 없다.
- TypeScript shared schema와 Python model의 제약이 장기적으로 어긋날 수 있고, `docs/contracts.md`에는 아직 Semantic Cue 계약이 정리되어 있지 않다.

### 3.3 리허설 실시간 흐름

- Semantic Cue runtime은 기존 semantic sentence matcher의 결과 뒤에 종속되어 있다. speaker notes와 keywords가 없는 슬라이드에서는 cue가 있어도 NLI 후보 선정까지 도달하기 어렵다.
- candidate selector에 `retrievalScoresByCueId` 자리는 있으나 cue 자체의 embedding retrieval 결과가 실제 runtime으로 전달되지 않는다.
- cue의 `candidateKeywords`와 `aliases`가 live STT bias phrase에 충분히 연결되지 않는다.
- alias를 모두 독립 용어로 펼쳐 분모에 넣으면 alias가 많을수록 coverage가 낮아지는 역효과가 생길 수 있다. alias는 같은 개념의 `any-of` 그룹으로 평가해야 한다.
- exact phrase나 keyword로 명확히 인식된 경우 NLI를 건너뛰는 것은 맞지만, 그 결과가 최종 cue coverage evidence로 일관되게 남지 않는다.
- 한 final STT segment를 stable window처럼 사용하고 있어 3~8초에 걸친 의미를 여러 발화에 나누어 설명한 경우를 놓칠 수 있다.
- slide 전환·stop 시 pending semantic 작업이 폐기될 수 있어 마지막 발화의 evidence가 사라질 수 있다.
- 현재 browser provider는 zero-shot score를 entailment처럼 사용하고, neutral/contradiction은 실제 3-way logits가 아니다. 이 값을 사용자 리포트의 확정 사실로 쓰면 안 된다.
- 기존 browser NLI PoC는 약 428MB 모델 초기화가 제한 시간 안에 완료되지 않았다. 실전 발표에서 cold load하는 경로는 현재 출시 조건을 충족하지 않는다.
- `RehearsalPanel`은 모드별 UI를 받을 수 있지만 현재 workspace 연결은 리허설 중심이고, 실전 aid 정책이 독립된 제품 경로로 완성되지 않았다.
- auto advance 기본 정책과 Semantic Cue aid의 관계가 사용자 안전 관점에서 정리되지 않았다. 실전에서는 수동 진행을 기본으로 두고 명시적으로 켠 경우에만 기존 다중 gate를 사용해야 한다.

### 3.4 리포트와 다음 회차

- 현재 report의 Semantic Cue 영역은 `cueId`, provider, score, reason code 중심의 개발자 evidence에 가깝다.
- NLI가 실행된 decision만 저장되므로, 명확한 lexical match와 아예 관찰되지 않은 cue를 포함한 전체 coverage 분모가 없다.
- `missed`와 `unmeasured`를 구분하지 않으면 시스템이 측정하지 못한 내용을 발표자의 실수로 잘못 보고할 수 있다.
- slide keywords가 없는 덱에서 keyword coverage `0%`를 보여주면 발표가 부족했다는 잘못된 인상을 준다. 이 경우 `측정 안 됨`으로 표시해야 한다.
- 최종 AI coaching 입력은 transcript와 일반 전달 지표 중심이며, 승인된 Semantic Cue와 최종 cue outcome을 사용하지 않는다.
- 안정적인 cue revision과 snapshot이 없어 회차 비교에서 “같은 의미 단위의 반복 실수”를 신뢰성 있게 추적하기 어렵다.
- 현재 rehearsal run은 live session 시작이 아니라 upload flow에서 생성되어 live runtime과 post-run worker가 같은 immutable cue snapshot을 공유하지 못한다.
- run meta update 실패를 빈 `catch`로 무시하는 경로가 있어 서버 연결 실패가 사용자에게 보이지 않고 slide timeline/evidence가 조용히 유실될 수 있다.

## 4. 제품 원칙

### 4.1 사람에게 도움이 되는 결과를 모델 점수보다 우선한다

- 사용자에게 provider, raw logits, reason code를 기본 노출하지 않는다.
- 모든 피드백은 `무엇을 전달했는가`, `무엇이 부족했는가`, `다음에 어떻게 말할 것인가`로 번역한다.
- 전체 점수보다 위험 슬라이드와 다음 행동을 먼저 보여준다.

### 4.2 AI가 제안하고 발표자가 확정한다

- 시각 요소와 speaker notes에서 생성한 cue는 기본적으로 `suggested`이다.
- 발표자가 `core`, `supporting`, `excluded`를 검토한 뒤 승인한 cue만 필수 누락 판정과 회차 비교의 기준으로 사용한다.
- AI가 추론한 cue를 사용자 확인 없이 “발표자가 반드시 말해야 했던 내용”으로 단정하지 않는다.

### 4.3 cue는 원자적이되, 화면에는 적게 보인다

- 하나의 cue는 3~8초 발화 창에서 독립적으로 판정 가능한 하나의 주장을 가진다.
- 준비 단계에서는 콘텐츠 밀도에 맞게 여러 후보를 만들 수 있다.
- 실제 발표 시간에 맞춰 슬라이드당 승인된 `core` cue는 보통 1~3개로 제한한다.
- 리허설 화면에는 체크리스트를 제공하되, 실전 화면에는 현재 핵심 메시지 또는 이전 반복 실수 한 개만 보여준다.

### 4.4 실시간 판정과 최종 리포트 판정을 분리한다

- 실시간은 빠르고 보수적인 힌트 제공에 집중한다.
- 발표 후에는 전체 timestamped transcript와 정확한 cue revision을 사용해 서버에서 최종 판정한다.
- 실시간 decision은 잠정 관찰이고, 리포트의 canonical outcome은 아니다.

### 4.5 불확실하면 발표자를 방해하지 않는다

- 실전 발표에서 애매한 판정은 UI 경고나 자동 액션을 만들지 않는다.
- 애매한 **cue 결과**는 단정하지 않되, 기능 비활성·provider 장애·timeout·측정 불가 같은 **시스템 상태**는 숨기지 않는다.
- fallback은 발표를 계속하기 위한 실행 안전장치일 뿐 성공 판정이나 정상 상태로 위장하지 않는다.
- NLI 단독 판정으로 다음 슬라이드 전환을 허용하지 않는다.
- 발표 도중 모델 다운로드, cold start, 클라우드 LLM 호출을 요구하지 않는다.

### 4.6 측정 불가를 실패로 취급하지 않는다

- `missed`, `partial`, `unmeasured`, `excluded`를 명확히 구분한다.
- 근거가 부족한 이미지-only cue와 변경 후 stale cue는 승인 전 `suggested/stale`로 유지하고, 불완전한 transcript는 `unmeasured`로 처리한다.

### 4.7 대본 충실도와 의미 전달률을 분리한다

- 기존 sentence matcher의 결과는 `scriptAdherence` 축으로 유지한다.
- 발표자가 승인한 Semantic Cue의 결과는 `approvedCueCoverage` 축으로 계산한다.
- 대본과 다르게 말했지만 핵심 의미를 전달한 경우 `scriptAdherence`는 낮고 `approvedCueCoverage`는 높을 수 있다.
- 대본 문장을 읽었더라도 핵심 주장 일부가 빠지면 두 축을 억지로 같은 점수로 합치지 않는다.
- 기존 `utteranceOutcomes.missed`와 새 cue outcome의 `missed`는 분모가 다르므로 schema와 UI에서 구분한다.

### 4.8 현재 비목표

- cue 순서·분기 요구가 검증되기 전에 별도 `Cue Graph`를 도입하지 않는다.
- 모든 slide object 위에 자동 태그를 겹쳐 실전 화면을 채우지 않는다. object 연결은 준비·리허설의 근거 탐색부터 검증한다.
- 발표 중 cloud LLM 호출을 의미 판정의 필수 경로로 만들지 않는다.
- browser NLI 모델 탑재 자체를 성공 기준으로 삼지 않는다.
- Semantic Cue 결과만으로 animation, reveal, next slide를 자동 실행하지 않는다.
- 이 계획에서 시선·제스처·카메라 기반 코칭까지 범위를 넓히지 않는다.

## 5. 목표 사용자 경험

### 5.1 발표 준비

1. 덱을 가져오거나 편집한다.
2. ORBIT이 슬라이드마다 원자적 cue 후보와 기술 용어 alias를 제안한다.
3. 각 cue에는 근거 출처와 신뢰 상태가 표시된다.
4. 발표자는 cue를 `핵심`, `보조`, `제외`로 검토하고 문구를 수정한다.
5. 목표 발표 시간을 초과하는 핵심 cue 수에는 정리 권고가 표시된다.

준비 완료 조건은 “AI 분석이 끝남”이 아니라 **발표자가 무엇을 꼭 말할지 확인함**이다.

### 5.2 리허설

- 현재 슬라이드의 승인된 core cue를 체크리스트로 본다.
- 표현이 달라도 의미가 전달되면 체크된다.
- confidence가 낮은 판정은 확정 체크 대신 “검토 필요”로 남긴다.
- 슬라이드를 넘길 때 놓친 core cue를 짧게 보여주되 발표 흐름을 막지 않는다.
- STT, semantic runtime, NLI, 서버 평가 중 비활성·실패·degraded 상태가 있으면 리허설 화면에 기능명과 원인을 명시한다.
- fallback으로 기본 matcher만 사용한 결과는 `기본 의미 체크`로 표시하고 정밀 판정 결과처럼 보이지 않게 한다.
- 디버깅 정보는 feature flag를 켠 개발·QA 모드에서만 본다.

### 5.3 리포트

리포트의 첫 화면은 다음 순서를 따른다.

1. 이번 발표에서 잘 전달한 핵심 메시지
2. 가장 먼저 고칠 위험 슬라이드 최대 3개
3. 다음 리허설 목표 최대 3개
4. 슬라이드별 `covered / partial / missed / unmeasured`
5. 대본과 달랐지만 의미상 인정된 좋은 애드리브
6. 시간, 속도, 휴지, 필러 등 전달 지표

각 제안은 승인된 cue, 판정 상태, 근거 발화, 시간 지표 중 하나 이상에 추적 가능해야 한다.

### 5.4 다음 회차와 실전

- 시작 전 브리핑에서 반복된 핵심 누락과 시간 문제만 최대 3개 보여준다.
- 해당 슬라이드 진입 시 이전 반복 실수를 한 줄로 한 번만 보여준다.
- 실전 발표 모드에서는 transcript와 상세 점수를 숨긴다.
- 실전 기본 UI는 현재 core cue 한 개 또는 이전 반복 issue 한 개를 넘지 않는다.
- 실시간 의미 판정이 실패해도 기본 슬라이드 진행과 수동 조작은 유지하되, 발표자 전용의 작은 상태 표시로 `의미 체크 오프라인`, `정밀 판정 비활성` 같은 degraded 상태를 알린다.
- 상태 표시는 청중 화면으로 전송하지 않고, 큰 toast나 반복 알림으로 발표를 방해하지 않는다.

## 6. 목표 아키텍처와 책임 분리

```text
Deck Preparation
  ├─ source snapshot / deck revision
  ├─ cue extraction
  ├─ deterministic quality validation
  ├─ provenance + stale detection
  └─ presenter approval
                │
                ▼
Rehearsal Runtime
  ├─ STT + slide-specific bias
  ├─ lexical / alias any-of matching
  ├─ cue-local E5 retrieval
  ├─ optional NLI for ambiguous top-k only
  ├─ evidence window aggregation
  ├─ capability/fallback state events
  └─ provisional decision log
                │
                ▼
Post-run Analysis
  ├─ transcript/slide alignment
  ├─ authoritative semantic re-evaluation
  ├─ canonical cue outcomes
  ├─ evaluation completeness/fallback reasons
  ├─ delivery/timing analysis
  └─ actionable report
                │
                ▼
Next Run / Live
  ├─ repeated-issue comparison
  ├─ preflight briefing
  └─ minimal slide-entry reminder
```

### 6.1 그대로 유지할 경계

- Deck 원본은 `packages/shared`의 schema를 따른다.
- Semantic Cue는 당분간 `slide.semanticCues`에 둔다. 실제 순서 의존성과 분기 요구가 생기기 전에는 별도의 `Cue Graph`를 만들지 않는다.
- cue 생성은 준비 단계의 Job으로 실행한다.
- live STT와 OCR/LLM은 provider interface 뒤에 둔다.
- action/advance controller는 Semantic Cue runtime과 분리한다.
- 청중용 slide snapshot에는 `speakerNotes`, `keywords`, `semanticCues`, semantic evidence를 포함하지 않는다.
- transcript, speaker script, raw audio를 서버 로그에 남기지 않는다.

### 6.2 새로 분리할 개념

`SemanticCueDecision`과 `SemanticCueOutcome`을 분리한다.

- `Decision`: 실시간 matcher 또는 NLI가 특정 시점에 낸 잠정 관찰. 디버깅·튜닝용이다.
- `Outcome`: 발표 종료 후 승인된 cue 전체를 분모로 계산한 사용자 리포트용 최종 상태다.

최종 상태는 다음을 사용한다.

| 상태 | 의미 |
|---|---|
| `covered` | 필수 의미가 충분히 전달됨 |
| `partial` | 관련 설명은 있으나 필수 개념 일부가 부족함 |
| `missed` | 충분한 transcript가 있으나 의미 전달 근거가 없음 |
| `unmeasured` | transcript/모델/cue freshness 문제로 평가할 수 없음 |
| `excluded` | 발표자가 평가 대상에서 제외함 |

서로 충돌하는 근거 또는 낮은 신뢰 판정은 별도 최종 상태로 늘리지 않고 `unmeasured`와 내부 reason `needs_confirmation`으로 표현한다. 사용자 UI에는 “확인 필요”로 보여줄 수 있다.

## 7. 계약 방향

아래는 구현 시 확정할 최소 계약 방향이다. 구체 필드명과 제한값은 `packages/shared`, Python Pydantic model, `docs/contracts.md`에서 함께 확정한다.

### 7.1 Semantic Cue lifecycle

기존 필드는 호환성을 유지하면서 다음 개념을 추가한다.

| 개념 | 목적 |
|---|---|
| `reportLabel` | 리포트에서 읽기 쉬운 짧은 이름 |
| `presenterTag` | 리허설/실전에서 한눈에 보는 매우 짧은 문구 |
| `cueType` | definition, cause, solution, result 등 피드백 맥락 |
| `importance` | `core`, `supporting`, `optional` |
| `reviewStatus` | 사용자 결정인 `suggested`, `approved`, `excluded` |
| `freshness` | 원본과의 정합 상태인 `current`, `stale` |
| `origin` | `ai`, `manual`, `imported` |
| `revision` | cue 의미 변경 추적 |
| `sourceDeckVersion` | 생성 기준 deck version |
| `sourceFingerprint` | notes/elements 등 근거 변경 감지 |
| `sourceRefs` | cue를 만든 element/note 근거 |

`reviewStatus`와 `freshness`는 직교한다. 예를 들어 사용자가 승인한 cue의 근거가 바뀌면 `approved + stale`가 되어 승인 이력을 보존하면서 재검토를 요구한다.

`required`와 `priority`는 기존 덱 호환을 위해 유지할 수 있으나, 사용자 승인 이후의 `importance/reviewStatus`에서 파생되도록 단일 의미를 정해야 한다. 기존 덱의 cue는 안전한 기본값인 `suggested + current`로 읽고, 발표자가 승인하기 전에는 coverage 분모에 넣지 않는다.

### 7.2 alias와 concept

- canonical term 하나와 여러 alias는 같은 개념 그룹이다.
- 그룹 내 하나라도 인식되면 그 concept는 충족된 것으로 계산한다.
- 여러 독립 주장을 하나 cue에 넣지 않는다.
- runtime용 concept 구조를 도입하더라도 자연어 phrase 대량 생성을 요구하지 않는다.

### 7.3 최종 outcome

`RehearsalSemanticCueOutcome`은 최소한 다음 정보를 가진다.

- `runId`, `deckId`, `deckVersion`, `slideId`
- `cueId`, `cueRevision`, `cueMeaningSnapshot`, `reportLabelSnapshot`
- `status`, `confidence`, `matchedBy`
- best evidence의 제한된 시간 구간과 정규화된 짧은 excerpt
- covered/missing concept 또는 판정 불가 사유
- 사용자용 feedback과 내부용 reason code의 분리

`matchedBy`는 `lexical`, `alias`, `embedding`, `nli`, `post_run_semantic`, `manual`을 구분하되 사용자 기본 UI에는 노출하지 않는다.

### 7.4 privacy와 보존

- run meta에는 전체 transcript를 중복 저장하지 않는다.
- evidence excerpt는 리포트에 필요한 최소 길이와 개수만 저장한다.
- 로그에는 premise, hypothesis, excerpt 원문을 남기지 않는다.
- 보존 기간과 삭제 정책이 확정되기 전에는 raw decision timeline의 영구 저장을 확대하지 않는다.

### 7.5 Visible fallback and observability policy

fallback의 목적은 발표를 멈추지 않게 하는 것이지, 실패한 기능을 정상처럼 보이게 하는 것이 아니다. **silent fallback은 허용하지 않는다.**

#### 상태 계약

STT, semantic matching, NLI, post-run server evaluation은 공통 capability 상태를 제공한다.

| 필드 | 의미 |
|---|---|
| `capability` | `stt`, `semantic_runtime`, `embedding`, `nli`, `server_evaluation`, `cue_freshness`, `transcript_evidence` |
| `state` | `available`, `degraded`, `unavailable` |
| `reason` | 비활성·실패·측정 불가의 기계 판독 가능한 원인 |
| `measurementMode` | `full`, `basic`, `none` |
| `retryable` | 현재 세션 또는 발표 후 재시도 가능 여부 |
| `startedAt`, `recoveredAt` | degraded 구간과 복구 시점 |
| `affectedSlideIds`, `affectedCueIds` | 결과에 영향을 받은 범위 |

최소 reason enum은 다음을 포함한다.

```text
user_disabled
permission_denied
stt_unavailable
network_error
provider_unavailable
model_not_ready
model_load_failed
timeout
runtime_error
server_evaluation_failed
stale_cue
transcript_incomplete
no_transcript
insufficient_evidence
slide_not_visited
evaluation_not_run
evaluation_snapshot_mismatch
queue_dropped
```

`SemanticCueDecision`과 `RehearsalSemanticCueOutcome`에는 필요할 때 다음 정보를 남긴다.

- `measurementMode: full | basic | none`
- `fallbackUsed: boolean`
- `fallbackReason` 또는 `unmeasuredReason`
- 실제 사용한 provider/path와 생략한 provider/path
- timeout latency, retry 가능 여부, 영향을 받은 action gate

`measurementMode=basic`은 lexical/alias/E5처럼 사용 가능한 기본 matcher만으로 판단했다는 뜻이다. 정밀 NLI가 없더라도 강한 deterministic evidence로 `covered`가 될 수 있지만, 리허설·리포트에는 정밀 판정이 생략되었다는 상태가 함께 보여야 한다. ambiguous cue처럼 정밀 판정이 필요하지만 수행하지 못한 항목은 `unmeasured`로 처리한다.

#### 상황별 정책

| 상황 | 리허설 UI | 실전 발표자 UI | outcome/report | action gate |
|---|---|---|---|---|
| STT 미사용·권한 거부·provider 불가 | `음성 인식 꺼짐` 또는 구체 원인과 해결 동작 표시 | 작은 `음성 체크 꺼짐` 상태 chip | 영향을 받은 cue는 `unmeasured`; `missed` 금지 | 모든 음성·의미 기반 auto action 차단 |
| 서버 연결·post-run 평가 실패 | `서버 평가 불가, 리허설은 계속 가능`과 재시도 상태 표시 | live 진행에는 영향 없음; 서버 의존 기능이면 작은 offline 표시 | 서버 평가가 필요한 outcome은 `unmeasured`; local provisional을 최종 AI 판정으로 승격 금지 | 서버 결과 의존 action 없음; report 재평가만 재시도 |
| NLI timeout·provider unavailable | `정밀 의미 판정 생략, 기본 의미 체크만 사용` | 작은 `정밀 판정 비활성` chip | deterministic evidence는 `basic`, ambiguous cue는 `unmeasured` | semantic 기반 auto advance/reveal/animation 차단 |
| semantic runtime 장애 | cue checklist에 `의미 체크 오프라인` 상태 표시; 수동 체크/진행 유지 | 작은 `의미 체크 오프라인` chip | 장애 구간 cue는 `unmeasured`; 마지막 정상 상태를 재사용 금지 | semantic 기반 action 전부 차단, 수동 조작 유지 |
| stale cue | `슬라이드 변경 후 재검토 필요`와 검토 화면 이동 제공 | 해당 cue 힌트 미노출, 작은 `Cue 재검토 필요` 상태 | `unmeasured(reason=stale_cue)`; `missed` 금지 | stale cue가 근거인 action 차단 |
| transcript 불완전·누락 | `근거 부족`과 영향 구간 표시 | 반복 경고 없이 작은 degraded 표시 | `unmeasured(reason=transcript_incomplete/no_transcript)` | 영향 구간의 의미 기반 action 차단 |
| fallback에서 고정 문구만 제공 가능 | `시스템 상태 안내`로 명시 | 작은 상태 chip만 표시 | AI coaching/evidence로 저장 금지 | 판정 근거로 사용 금지 |

#### 표시 원칙

- fallback 상태 문구는 cue 결과나 AI 코칭 카드가 아니라 별도의 `시스템 상태` 영역에 표시한다.
- 리허설에서는 capability, 원인, 영향, 재시도 가능 여부를 사용자가 이해할 수 있게 보여준다.
- 실전에서는 발표자 전용 작은 상태 chip과 안정된 아이콘을 사용한다. 큰 modal, 반복 toast, 소리, 깜빡임을 사용하지 않는다.
- 장애가 복구되면 같은 상태 영역에서 `복구됨`으로 전환하고, 이미 `unmeasured`가 된 과거 구간을 소급해 정상 판정으로 바꾸지 않는다. post-run 재평가가 성공한 경우에만 새 outcome으로 갱신한다.
- 기능이 feature flag, 장비 성능, 사용자 설정 때문에 의도적으로 꺼진 경우에도 사용자 기대에 영향을 주는 capability라면 `비활성` 상태를 표시한다.
- 기존 고정 coaching 문구는 제거하거나 `AI 분석 결과가 아닌 일반 안내`로 명시한다. evidence가 없는 고정 문구를 `AI 개선 제안`처럼 렌더링하지 않는다.

#### Debug, QA, report 추적

- 모든 fallback 진입·복구는 `SemanticCapabilityEvent`로 남긴다.
- `SemanticCueDebugEvent`에는 `fallbackReason`, `nliSkippedReason`, provider capability, timeout, selected fallback path, action blocked reason을 포함한다.
- debug panel은 최신 event만이 아니라 fallback timeline과 영향을 받은 slide/cue를 볼 수 있어야 한다.
- report에는 사용자용 원인과 영향을 표시하고, 내부 debug detail에는 raw reason code와 provider 상태를 남긴다.
- event log와 report evidence는 transcript 원문을 서버 로그에 남기지 않는 기존 privacy 규칙을 유지한다.

#### 액션 안전 규칙

- capability가 `degraded` 또는 `unavailable`이고 해당 capability가 action 판단 근거라면 auto advance, reveal, animation을 차단한다.
- `measurementMode=basic`인 Semantic Cue 결과는 체크리스트 표시에는 사용할 수 있지만 자동 action의 단독 근거로 사용하지 않는다.
- fallback 직전의 마지막 `covered` 상태를 현재 slide/action에 재사용하지 않는다.
- 수동 slide 이동, 수동 reveal, 수동 animation과 비의미 기반 기본 발표 기능은 유지한다.
- action 차단은 UI 오류처럼 보이지 않게 처리하되 debug event와 action gate의 `blockedReasons`에는 반드시 남긴다.
- 최소 `blockedReasons`는 `capability-unavailable`, `fallback-basic-only`, `stale-cue`, `transcript-incomplete`, `provider-timeout`을 포함한다.

## 8. 의존성 그래프

```text
T1 평가 기준선 ───────────────────────────────┐
                                                ▼
T2 공통 계약 ──┬─> T3 extraction 동시성 ──> T6 안정 ID/병합
               ├─> T4 editor lifecycle ───────┘
               ├─> T2A run 평가 snapshot ─────> T12
               ├─> T7 cue 검토 UI
               └─> T12 최종 outcome 계약

T1 ─> T5 생성 품질 ─> T6 ─> T7 ───────────────┐
                                                ▼
T2 ─> T8 alias/STT bias ─> T9 cue E5 retrieval ─> T10 evidence runtime
                                                    │
                                                    ├─> T11 모드별 UI
                                                    └─> T12 서버 최종 판정 <─ T2A
                                                          │
                                                          ├─> T13 사용자 리포트
                                                          └─> T14 회차 비교/브리핑

T1 + T9 + T10 + 실제 로그 ─> T15 true NLI 검증 및 shadow rollout
```

## 9. 단계별 구현 계획

각 task는 가능한 한 한 PR에서 검토 가능한 크기로 제한한다. 공통 계약을 먼저 병합하고, 그 위에서 Python worker, Web runtime, Report 작업을 병렬화한다.

| 단계 | 핵심 산출물 | 사용자에게 생기는 가치 | 다음 단계 진입 조건 |
|---|---|---|---|
| Phase 0 | 평가 fixture, lifecycle/outcome 계약, immutable run snapshot, CAS/stale 안전성 | 잘못된 0점·과거 평가 오염·데이터 유실을 막음 | 기존 덱 호환, `unmeasured` 구분, run 기준 고정, extraction 충돌 안전 |
| Phase 1 | atomic cue 품질, 안정 ID, 검토·승인 UI | 무엇을 꼭 말할지 스스로 확정함 | imported deck에서 core/supporting/excluded 저장 가능 |
| Phase 2 | alias/STT bias, cue E5, evidence runtime, visible fallback, 모드별 UI | 대본과 달라도 핵심 의미와 현재 측정 상태를 확인함 | NLI off에서도 상태가 보이는 `basic/unmeasured` 동작, conservative action gate, 실전 compact status |
| Phase 3 | post-run outcome, 측정 상태가 보이는 행동 리포트, 회차 비교 | 무엇을 고칠지와 무엇을 측정하지 못했는지 알고 다음 회차를 준비함 | 승인→리허설→상태/Top 3 목표→재연습의 E2E 완료 |
| Phase 4 | true NLI PoC와 shadow rollout | 애매한 애드리브 인정 정확도를 선택적으로 높임 | precision/latency/device gate 통과 시에만 opt-in |

### Phase 0. 측정 기준과 데이터 안전성

#### T1. 한국어 Semantic Cue golden fixture와 평가 harness

**목적**  
prompt와 threshold를 느낌으로 조정하지 않고, 실제 발표 발화에서 개선 여부를 반복 측정한다.

**작업**

- 8~12개 대표 슬라이드 유형을 선정한다: 개념, 원인, 해결책, 코드, 표, 그래프, 이미지-only, 전환/마무리.
- 각 cue마다 `covered`, `partial`, `related but insufficient`, `missed`, ASR 오류가 섞인 한국어 발화 예시를 만든다.
- STT off, NLI timeout, provider unavailable, runtime error, stale cue, transcript incomplete의 fallback fixture를 추가한다.
- extraction 품질은 atomicity, source grounding, importance diversity, alias coverage로 평가한다.
- runtime 품질은 cue top-k recall, false covered, false missed, latency로 평가한다.
- report 품질은 `unmeasured` 오분류, fallback reason 추적, 고정 문구의 AI 결과 오인 가능성을 평가한다.

**완료 조건**

- 같은 fixture로 Python extraction과 Web matcher를 재현 가능하게 평가할 수 있다.
- threshold 또는 prompt 변경 PR에는 before/after 결과가 포함된다.
- synthetic 문장만이 아니라 실제 STT 형태의 띄어쓰기·영문 음역·오인식 사례가 포함된다.
- 각 fallback fixture가 예상 capability state, measurement mode, outcome, UI status, action gate를 함께 검증한다.

**검증**

- Python fixture test
- Web matcher unit test
- 고정 seed 또는 고정 expected artifact를 사용한 회귀 비교

**예상 파일**

- `services/python-worker/tests/fixtures/semantic_cues/`
- `services/python-worker/tests/test_semantic_cue_quality.py`
- `apps/web/src/features/rehearsal/speech/__fixtures__/semanticCueKoreanCases.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueEvaluation.test.ts`

**규모/의존성:** M / 없음

#### T2. Cue lifecycle과 최종 outcome 공통 계약

**목적**  
생성, 검토, 리허설, 리포트, 회차 비교가 같은 의미의 cue와 상태를 사용하게 한다.

**작업**

- 기존 덱을 깨지 않는 optional/default 기반 lifecycle 필드를 정의한다.
- `Decision`과 `Outcome` schema를 분리한다.
- `missed`, `unmeasured`, `excluded`와 `unmeasured.reason=needs_confirmation`의 판정 조건을 문서화한다.
- `SemanticCapabilityStatus/Event`, `measurementMode`, fallback/unmeasured reason enum을 공통 계약으로 정의한다.
- TypeScript Zod와 Python Pydantic 제약을 맞춘다.
- `docs/contracts.md`에 Semantic Cue와 report outcome 계약을 추가한다.

**완료 조건**

- 기존 `deck_semantic_cue.json`이 migration 없이 parse된다.
- legacy cue는 `suggested + current`로 정규화되며 사용자 승인 전에는 coverage 분모에 포함되지 않는다.
- 새 schema는 `cueId + revision` 또는 semantic fingerprint로 회차 비교 identity를 제공하고, `sourceDeckVersion`은 생성 provenance로만 사용한다.
- `unmeasured`가 누락되지 않으며, 리포트 schema가 raw NLI decision 없이도 완성된다.
- fallback이 성공 outcome과 구분되고, reason 없는 `unmeasured` 또는 표시되지 않은 degraded 상태를 schema/test가 허용하지 않는다.
- audience snapshot 계약에서 cue/evidence 비노출이 테스트로 고정된다.

**검증**

- shared schema parse/round-trip test
- legacy deck compatibility test
- capability/fallback reason schema test
- Python/TypeScript 동일 fixture validation
- presentation channel leakage regression test

**예상 파일**

- `packages/shared/src/deck/semantic-cue.schema.ts`
- `packages/shared/src/rehearsals/rehearsal.schema.ts`
- `packages/shared/src/deck/deck.schema.test.ts`
- `packages/shared/src/rehearsals/rehearsal.schema.test.ts`
- `docs/contracts.md`

**규모/의존성:** M / T1과 병렬 가능

#### T2A. 리허설 평가용 immutable deck/cue snapshot

**목적**  
리허설이 끝난 뒤 최신 덱을 읽어 과거 발화를 다른 cue로 평가하지 않도록, run 시작 시점의 평가 기준을 서버에서 고정한다.

**작업**

- run 생성 시 서버가 checkpoint가 반영된 `deckId`, `deckVersion`과 `approved/excluded`로 검토된 cue snapshot을 저장한다. `suggested` cue는 제외하고 `freshness`는 보존한다.
- snapshot에는 평가에 필요한 slide identity/order/title/estimatedSeconds, keyword 요약과 cue ID, revision, meaning/report label, importance, reviewStatus, freshness만 포함하고 speaker notes나 전체 덱을 복제하지 않는다.
- snapshot은 run 생성 후 수정할 수 없고, 이후 deck 편집은 다음 run에만 반영한다.
- worker와 report builder는 최신 deck 조회가 아니라 run의 evaluation snapshot을 canonical 기준으로 사용한다.
- snapshot이 없는 legacy run은 기존 report 호환 경로를 사용하되 Semantic Cue 결과는 `unmeasured`로 처리한다.

**완료 조건**

- 리허설 도중 또는 종료 후 덱/cue를 편집해도 해당 run의 outcome 분모와 문구가 바뀌지 않는다.
- run이 어떤 deck version과 cue revision으로 평가되었는지 조회할 수 있다.
- 검토된 cue가 없는 run은 빈 snapshot으로 정상 생성되고 의미 전달 점수를 0점으로 만들지 않는다.
- evaluation snapshot에 speaker notes, raw transcript, raw audio가 포함되지 않는다.

**검증**

- run-create snapshot test
- post-run deck edit isolation test
- snapshot immutability/API rejection test
- legacy run compatibility test
- worker uses snapshot instead of latest deck regression test

**예상 파일**

- `packages/shared/src/rehearsals/rehearsal.schema.ts`
- `apps/api/src/rehearsals/rehearsals.service.ts`
- `apps/api/src/rehearsals/rehearsal-run.entity.ts`
- 신규 TypeORM migration
- `apps/api/src/rehearsals/rehearsals.service.spec.ts`
- `apps/worker/src/rehearsal-stt.processor.ts`

**규모/의존성:** M / T2

#### T3. Extraction snapshot, CAS, `force` 의미 확정

**목적**  
cue 분석 중 사용자의 최신 덱 편집을 덮어쓰거나, 부분 실패로 기존 cue를 지우지 않게 한다.

**작업**

- enqueue 시 `deckVersion` 또는 content revision을 job 입력에 고정한다.
- worker 저장 시 compare-and-set을 적용하고 revision 불일치는 충돌 상태로 종료한다.
- `force=false`는 승인된 최신 cue를 보존하고 필요한 stale slide만 분석한다.
- `force=true`도 manual/approved cue를 무조건 삭제하지 않도록 명시적 정책을 둔다.
- 일부 slide 응답 누락은 기존 cue 유지 + job warning으로 처리한다.
- pending patch가 있을 때 job을 실패시킬지 먼저 checkpoint할지 API 수준에서 일관되게 결정한다.

**완료 조건**

- 분석 도중 덱을 수정해도 새 편집 내용이 사라지지 않는다.
- 같은 덱에 extraction job 두 개가 겹쳐도 마지막 완료 순서가 데이터 정합성을 결정하지 않는다.
- partial LLM response가 정상 slide의 cue를 빈 배열로 바꾸지 않는다.
- `force` 동작이 API, queue payload, worker test에서 동일하다.

**검증**

- stale revision conflict test
- concurrent job completion order test
- partial response preservation test
- pending patch policy test

**예상 파일**

- `apps/api/src/decks/decks.service.ts`
- `apps/api/src/decks/decks.service.spec.ts`
- `apps/worker/src/semantic-cue-extraction.processor.ts`
- `apps/worker/src/semantic-cue-extraction.processor.spec.ts`
- 필요 시 shared job schema

**규모/의존성:** M / T2

#### T4. Editor 변경에 따른 cascade와 stale lifecycle

**목적**  
보이지 않는 cue reference 때문에 편집이 깨지거나, 오래된 cue가 최신 슬라이드 내용처럼 사용되지 않게 한다.

**작업**

- element/action 삭제 시 연결 reference를 제거하고 cue의 `freshness`를 `stale`로 바꾼다.
- speaker notes, 의미 있는 text/table/chart 변경 시 해당 slide cue를 `stale`로 표시한다.
- 장식·좌표만 바뀐 경우에는 불필요한 stale 처리를 피한다.
- undo/redo와 patch replay에서도 같은 결과를 보장한다.

**완료 조건**

- cue가 참조하는 element를 삭제해도 deck schema validation이 깨지지 않는다.
- cue의 근거 문구가 바뀌면 리허설에서 승인된 최신 cue처럼 사용되지 않는다.
- stale cue는 자동으로 `missed` 처리되지 않는다.

**검증**

- delete element/action cascade test
- semantic text update stale test
- style-only update non-stale test
- undo/redo regression test

**예상 파일**

- `packages/shared/src/deck/patch.schema.ts`
- `packages/editor-core/src/patches/applyPatch.ts`
- `packages/editor-core/src/patches/applyPatch.test.ts`
- `packages/shared/src/deck/deck.schema.test.ts`

**규모/의존성:** M / T2

**Phase 0 체크포인트**

- 기존 덱 호환성이 유지된다.
- 각 rehearsal run의 deck version과 approved cue snapshot이 시작 시점에 고정된다.
- cue 생성 작업이 사용자 편집을 덮어쓰지 않는다.
- 측정 불가 상태와 실제 누락 상태가 계약상 구분된다.
- 이 체크포인트를 통과하기 전에는 cue 기반 사용자 점수를 기본 활성화하지 않는다.

### Phase 1. 준비 단계에서 신뢰할 수 있는 핵심 메시지 만들기

#### T5. Extraction 입력 보강과 deterministic quality gate

**목적**  
슬라이드 요약 한 문장이 아니라, 실제로 말했는지 평가 가능한 원자적 cue 후보를 만든다.

**작업**

- element를 앞에서 자르지 않고 role, visibility, text density, type에 따라 우선순위를 매긴다.
- table cell, chart label/series, image OCR/VLM 상태를 구조적으로 입력한다.
- audience, purpose, target duration, slide estimated time을 cue 중요도 판단에 사용한다.
- LLM prompt에 atomic claim, 3~8초 judgeability, speaker-centric hypothesis, technical alias, hard negative 규칙을 유지한다.
- content-rich slide의 과도한 단일 cue, 모든 cue `required/priority=1`, technical term alias 누락, source 미근거를 deterministic validator가 탐지한다.
- validator 실패 시 무한 재생성하지 않고 warning, 제한된 retry, `suggested` 유지로 분기한다.

**완료 조건**

- golden fixture의 복합 슬라이드는 독립적인 claim으로 분리된다.
- title, agenda, Q&A, closing은 기본적으로 필수 cue를 강제하지 않는다.
- technical cue의 약어·함수명에는 한국어 발음 또는 의미 alias가 존재한다.
- 이미지-only slide는 근거가 없을 때 cue를 단정하지 않고 사용자 보완을 요청한다.
- 긴 hypothesis가 조용히 drop되지 않는다.

**검증**

- Python unit/golden tests
- 실제 샘플 덱 재생성 후 품질 통계 비교
- source reference 유효성 검사

**예상 파일**

- `services/python-worker/app/ai/semantic_cues.py`
- `services/python-worker/app/ai/semantic_cue_llm.py`
- `services/python-worker/app/ai/semantic_cue_filters.py`
- `services/python-worker/tests/test_semantic_cues.py`
- `services/python-worker/tests/test_semantic_cue_quality.py`

**규모/의존성:** M / T1, T2

#### T6. 안정적인 cue identity와 재생성 병합

**목적**  
발표자가 승인한 cue와 과거 리허설 결과를 재생성 후에도 가능한 한 보존한다.

**작업**

- ordinal 기반 ID를 그대로 신뢰하지 않고 source fingerprint와 normalized meaning을 사용한 병합 정책을 만든다.
- 동일 의미 cue는 기존 ID와 review status를 유지한다.
- 의미가 크게 바뀐 cue는 revision을 올리고 과거 outcome과 구분한다.
- manual cue는 자동 재생성으로 덮어쓰지 않는다.
- 삭제 후보는 즉시 삭제하지 않고 review diff에 표시한다.

**완료 조건**

- 문구의 사소한 변화로 cue ID가 전부 바뀌지 않는다.
- 실제 의미가 바뀐 cue는 과거 반복 누락과 잘못 합쳐지지 않는다.
- approved/manual cue가 LLM 응답 순서 변화로 사라지지 않는다.

**검증**

- reorder/wording-change identity tests
- meaning-change revision test
- manual cue preservation test
- removed suggestion diff test

**예상 파일**

- `services/python-worker/app/ai/semantic_cues.py`
- `services/python-worker/app/ai/semantic_cue_merge.py`
- `services/python-worker/tests/test_semantic_cue_merge.py`
- `apps/worker/src/semantic-cue-extraction.processor.ts`

**규모/의존성:** M / T2, T3, T5

#### T7. 발표자 Cue 검토·승인 UI

**목적**  
AI의 추론을 발표자의 실제 발표 의도로 바꾸고, 무엇을 연습할지 명확하게 한다.

**작업**

- 슬라이드별 suggested cue와 source evidence를 보여준다.
- `핵심`, `보조`, `제외` 변경, 문구 수정, manual cue 추가를 제공한다.
- 예상 슬라이드 시간 대비 core cue가 과도하면 정리 권고를 보여준다.
- stale cue와 재생성 diff를 검토할 수 있게 한다.
- 변경은 shared patch/schema를 통해 저장하고 협업·undo 흐름을 우회하지 않는다.

**완료 조건**

- 발표자가 리허설 전에 평가 대상 core cue를 확인할 수 있다.
- AI가 시각 요소만으로 추론한 cue임을 구분할 수 있다.
- 승인되지 않은 suggested cue는 리허설 리포트에서 `missed`로 단정되지 않는다.
- keyboard navigation과 기본 접근성 상태가 동작한다.

**검증**

- component interaction test
- patch round-trip/undo test
- stale/review diff test
- imported deck 준비 흐름 E2E

**예상 파일**

- `apps/web/src/features/editor/semantic-cues/SemanticCueReviewPanel.tsx`
- `apps/web/src/features/editor/semantic-cues/semanticCueReviewModel.ts`
- `apps/web/src/features/editor/semantic-cues/SemanticCueReviewPanel.test.tsx`
- `apps/web/src/features/editor/shell/EditorShell.tsx`
- 필요 시 `packages/shared/src/deck/patch.schema.ts`

**규모/의존성:** M / T2, T4, T6

**Phase 1 체크포인트**

사용자는 덱을 가져온 뒤 다음을 할 수 있어야 한다.

```text
AI cue 후보 확인
→ 출처 확인
→ 핵심/보조/제외 결정
→ 목표 시간에 맞게 핵심 메시지 정리
→ 리허설 시작
```

이 체크포인트가 첫 번째 독립 사용자 가치 릴리스다. NLI가 없어도 출시 가능해야 한다.

### Phase 2. 리허설 인식과 실전 보조

#### T8. Alias any-of matching과 slide-specific STT bias

**목적**  
RSP, ROX, `file_deny_write` 같은 용어의 한국어 STT 오인식을 줄이고 alias가 많을수록 점수가 낮아지는 문제를 없앤다.

**작업**

- canonical term과 alias 배열을 하나의 concept group으로 평가한다.
- 승인된 현재/인접 슬라이드 core cue의 technical term을 STT bias phrase에 넣는다.
- code identifier의 원문, 한국어 발음, 의미 표현에 가중치와 개수 제한을 둔다.
- cue 변경 시 bias context를 갱신한다.
- 일반 단어를 과도하게 bias하여 오인식을 늘리지 않도록 필터한다.

**완료 조건**

- alias 한 개를 말해도 해당 canonical concept는 충족된다.
- alias를 추가해도 concept coverage 분모가 증가하지 않는다.
- cue만 있고 speaker notes/slide keyword가 없는 슬라이드도 관련 STT bias를 받는다.
- 기존 keyword bias가 회귀하지 않는다.

**검증**

- any-of group unit tests
- Korean acronym/code STT alternative reranking tests
- bias phrase size/deduplication tests
- 기존 speech bias regression tests

**예상 파일**

- `apps/web/src/features/rehearsal/speech/semanticCueCandidateSelector.ts`
- `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts`
- `apps/web/src/features/rehearsal/speech/speechBiasPhrases.ts`
- 관련 test files

**규모/의존성:** S / T2, T7

#### T9. Cue-local E5 retrieval과 sentence matcher 의존 제거

**목적**  
speaker notes가 없는 슬라이드에서도 실제 발화와 현재 cue 의미를 비교해 ad-lib 후보를 찾는다.

**작업**

- 승인된 현재 슬라이드 cue의 `meaning`, hypothesis, concept를 embedding index로 준비한다.
- transcript embedding과 cue별 retrieval score를 계산해 candidate selector에 전달한다.
- sentence matcher는 대본 coverage를, cue matcher는 의미 의무 coverage를 각각 책임지게 한다.
- top-k와 threshold는 T1 fixture로 조정한다.
- `query-query`와 `query-passage` prefix mode는 benchmark 결과로 선택하고 config에 기록한다.

**완료 조건**

- speaker notes와 keywords가 없어도 approved cue 후보 top-k를 만들 수 있다.
- `retrievalScoresByCueId`가 항상 0인 현재 경로가 제거된다.
- unrelated utterance는 priority만으로 NLI 후보가 되지 않는다.
- cue index는 slide 진입 전에 준비되고 UI thread를 장시간 막지 않는다.

**검증**

- Korean top-k recall fixture
- no-notes slide integration test
- unrelated utterance negative test
- index cache/invalidation test

**예상 파일**

- `apps/web/src/features/rehearsal/speech/semanticCueEmbeddingIndex.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueRuntime.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueCandidateSelector.ts`
- `apps/web/src/features/rehearsal/speech/e5EmbeddingService.ts`
- 관련 test files

**규모/의존성:** M / T1, T2, T7

#### T10. Evidence window와 observable fallback이 보장되는 runtime

**목적**  
여러 발화를 합쳐 의미 전달을 보수적으로 판정하면서, provider 비활성·timeout·runtime 장애가 정상 결과처럼 사라지지 않게 한다.

**작업**

- final transcript를 timestamp 기반 3~8초 sliding evidence window로 묶는다.
- 명확한 lexical/alias/embedding match도 NLI 없이 cue decision evidence로 기록한다.
- ambiguous top-k에만 optional NLI를 실행하고 결과를 보조 evidence로 사용한다.
- 한 발화가 여러 독립 cue를 충족할 수 있으나 cue별 중복 실행과 flip-flop을 제한한다.
- slide exit, stop, pause 시 pending queue를 제한 시간 내 flush하거나 명시적으로 `unmeasured` 처리한다.
- 오래된 job을 drop하고 slide generation/revision을 검증한다.
- STT·embedding·NLI·semantic runtime의 capability 상태와 진입/복구 event를 session state에 전달한다.
- provider evaluate를 timeout/error boundary로 감싸고, empty decision을 정상 skip과 fallback failure로 구분한다.
- NLI 실패 시 strong deterministic evidence만 `measurementMode=basic`으로 유지하고, ambiguous cue는 reason이 있는 `unmeasured`로 만든다.
- fallback 상태에서는 semantic action gate에 구체적인 `blockedReasons`를 전달한다.

**완료 조건**

- 두 final segment에 걸친 하나의 설명이 같은 window에서 평가된다.
- exact match와 alias match도 최종 outcome 생성에 필요한 evidence를 남긴다.
- 마지막 슬라이드 발화가 stop 직전에 사라지지 않는다.
- NLI timeout/비활성화가 기본 리허설 진행을 막지 않지만 `정밀 판정 비활성` 상태와 fallback reason이 반드시 남는다.
- STT 비활성, provider unavailable, runtime exception은 정상 `no_candidate`와 구분되고 영향을 받은 cue를 `missed`로 만들지 않는다.
- silent `decisions: []`로 장애를 삼키지 않으며, 모든 fallback은 capability/debug event와 measurement mode를 가진다.
- fallback 구간에는 semantic 기반 auto advance, reveal, animation이 차단되고 수동 진행은 유지된다.
- cue가 여러 claim을 포함하면 quality gate에서 막고, runtime이 한 hypothesis만으로 전체를 확정하지 않는다.

**검증**

- multi-segment window test
- multiple-cue evidence test
- slide transition/stop flush test
- stale job drop test
- STT disabled/provider unavailable/runtime exception visible fallback tests
- NLI disabled/timeout `basic` vs `unmeasured` classification test
- fallback action-gate blocking test
- fallback enter/recover event test

**예상 파일**

- `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueRuntime.ts`
- `apps/web/src/features/rehearsal/speech/rehearsalLogCollector.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueScoreCombiner.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueDebugEvents.ts`
- 관련 test files

**규모/의존성:** M / T8, T9

#### T11. 리허설·실전 모드별 Presenter Aid 정책

**목적**  
리허설에서는 학습을 돕고, 실전에서는 인지 부하를 최소화한다.

**작업**

- 공통 `PresenterAidPolicy`를 정의해 모드별 노출 항목과 최대 개수를 고정한다.
- 리허설에는 core cue checklist, partial 상태, slide-exit feedback을 제공한다.
- 실전에는 다음 core cue 또는 이전 반복 issue 중 하나만 보수적으로 표시한다.
- transcript, confidence, raw provider score는 실전에서 숨기되 capability 비활성·degraded 상태는 숨기지 않는다.
- 리허설에는 `시스템 상태` 영역을 두고 실패한 기능, fallback path, 영향 범위, 재시도 가능 여부를 표시한다.
- 실전에는 발표자 전용의 작은 상태 chip으로 `음성 체크 꺼짐`, `의미 체크 오프라인`, `정밀 판정 비활성`, `Cue 재검토 필요`를 표시한다.
- fallback status는 AI 코칭/결과 카드와 시각적으로 분리하고 debug flag가 꺼져 있어도 사용자에게 보인다.
- 큰 modal·반복 toast 없이 상태가 유지·복구되는 동안 한 자리에서 안정적으로 갱신한다.
- 실전 발표의 auto advance는 기본 off로 두고, 사용자가 명시적으로 켠 경우에도 기존 coverage·최소 체류 시간·전환 발화·cooldown gate를 모두 통과해야 한다.
- debug floating panel은 개발/QA flag에서만 lazy load하되 fallback timeline, skipped reason, timeout, provider unavailable, recovery, action blocked reason을 표시하고 JSON export에 포함한다.
- audience slide window 비노출 회귀 테스트를 유지한다.

**완료 조건**

- 리허설에서 cue별 진행 상황을 한눈에 확인할 수 있다.
- 실전에서 최대 노출 수와 표시 시간이 정책으로 제한된다.
- STT 미사용, NLI timeout, semantic runtime 장애, stale cue 상태가 리허설에서 명시적으로 보인다.
- 실전에서는 같은 상태가 발표자 전용 작은 chip으로 보이고 청중 화면에는 전달되지 않는다.
- 의미 runtime 장애 시 presenter UI와 수동 진행은 유지되지만 cue가 정상 판정된 것처럼 표시되지 않는다.
- debug flag off 또는 production build에서도 사용자용 fallback 상태는 제거되지 않는다.
- debug panel에서 fallback 진입·복구와 영향을 받은 slide/cue/action을 추적할 수 있다.
- Semantic Cue 또는 NLI 판정만으로 auto advance가 활성화되지 않는다.
- 청중 화면에는 cue, notes, 이전 실수, debug 정보가 노출되지 않는다.

**검증**

- mode policy unit test
- rehearsal checklist component test
- rehearsal fallback-state accessibility/interaction test
- live compact status visual/E2E test
- state recovery without toast-spam test
- debug fallback timeline/reason/export test
- presentation channel leakage test
- debug flag off에서도 capability status가 보이는 regression check

**예상 파일**

- `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`
- `apps/web/src/features/rehearsal/panel/SemanticCueDebugPanel.tsx`
- `apps/web/src/features/rehearsal/presenter/PresenterRemoteWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.ts`
- 신규 `apps/web/src/features/rehearsal/panel/SemanticCapabilityStatus.tsx`
- 관련 test files

**규모/의존성:** M / T7, T10

**Phase 2 체크포인트**

- NLI를 꺼도 approved cue에 대한 lexical/alias/E5 기반 리허설이 동작한다.
- 저사양 장비에서도 의미 runtime 장애가 발표 UI를 멈추지 않으며 degraded 상태가 명시적으로 보인다.
- 실전에서 불확실한 cue 결과는 단정하지 않되 capability fallback 상태는 발표자 전용 chip으로 알리고 수동 제어를 보존한다.
- silent fallback과 fallback 상태에서의 semantic auto action이 0건이어야 한다.

### Phase 3. 좋은 리포트와 반복 개선 루프

#### T12. 서버 측 post-run authoritative semantic evaluation

**목적**  
실시간 제약 때문에 놓친 의미를 전체 transcript 맥락에서 다시 평가하고, 최종 report의 신뢰 가능한 분모를 만든다.

**작업**

- T2A에서 고정한 immutable evaluation snapshot을 읽고 최신 deck을 다시 조회해 분모를 만들지 않는다.
- timestamped transcript를 slide timeline에 정렬한다.
- approved cue 전체에 대해 lexical/alias, embedding, 필요한 경우 서버 semantic grader를 적용한다.
- provisional live decision과 post-run 결과를 합치되 final outcome 생성 규칙을 한 곳에 둔다.
- transcript가 없거나 cue가 stale인 경우 `unmeasured`로 처리한다.
- 서버 연결 실패·provider unavailable·timeout을 capability event와 report evaluation status로 저장한다.
- 서버 평가가 필요한 cue는 실패 시 local provisional 또는 고정 문구로 확정하지 않고 `unmeasured`와 retryable reason을 남긴다.
- best evidence만 bounded schema에 저장한다.

**완료 조건**

- 모든 approved core cue가 정확히 하나의 final outcome을 가진다.
- report 생성이 끝나기 전에 deck을 편집해도 outcome의 cue 의미와 분모가 바뀌지 않는다.
- NLI가 실행되지 않은 cue도 `covered`, `partial`, `missed`, `unmeasured` 중 하나로 정리된다.
- live decision과 report outcome이 다를 때 최종 근거와 내부 reason이 남는다.
- 서버 평가 실패 report는 정상 완료처럼 보이지 않고 `평가 일부 불가` 상태, 영향 범위, 재시도 가능 여부를 가진다.
- transcript가 불완전한 구간은 `missed`가 아니라 `unmeasured(reason=transcript_incomplete)`이다.
- slide keyword가 없는 경우 keyword coverage는 `N/A`로 표현할 수 있다.

**검증**

- transcript-to-slide alignment tests
- full denominator outcome tests
- no transcript/stale cue unmeasured tests
- server unavailable/timeout partial-evaluation tests
- local provisional is not promoted to canonical outcome test
- post-run retry recovers evaluation status test
- bounded evidence/redacted logging tests
- worker retry/idempotency tests

**예상 파일**

- `apps/worker/src/rehearsal-stt.processor.ts`
- `apps/worker/src/rehearsal-stt.processor.spec.ts`
- `services/python-worker/app/main.py`
- `services/python-worker/app/rehearsal.py`
- `services/python-worker/tests/test_rehearsal_analyze.py`

**규모/의존성:** M / T2, T2A, T7, T10

#### T13. 사용자 언어의 Semantic Coverage 리포트

**목적**  
개발자 decision dump를 발표자가 바로 연습에 사용할 수 있는 리포트로 바꾼다.

**작업**

- slide별 승인 cue를 분모로 coverage section을 만든다.
- `covered`, `partial`, `missed`, `unmeasured`의 시각·문구를 구분한다.
- 의미상 인정된 애드리브와 부족한 concept를 짧은 evidence와 함께 보여준다.
- report 상단에 `측정 상태`를 두고 STT, basic/full 의미 체크, 서버 평가의 성공·degraded·불가 상태를 요약한다.
- `unmeasured`에는 사용자용 fallback 원인, 영향 받은 slide/cue, 재시도 가능 여부를 표시하고 raw provider/model/reason code는 debug detail로 이동한다.
- `measurementMode=basic` 결과에는 `기본 의미 체크` 표시를 붙여 정밀 판정과 구분한다.
- 고정 fallback 문구는 AI coaching 결과 영역에서 제거하고, 필요한 일반 안내는 `시스템 상태 안내`로 명시한다.
- 전체 문제를 나열하지 않고 위험 슬라이드와 다음 연습 목표를 최대 3개로 우선순위화한다.
- AI coaching 생성 시 cue outcome과 delivery metric을 구조화된 입력으로 사용한다.
- AI는 설명과 연습 문구를 생성할 수 있지만 deterministic outcome의 상태를 뒤집지 못한다.

**완료 조건**

- 사용자가 “무엇을 놓쳤고 다음에 어떻게 고칠지”를 리포트 첫 화면에서 알 수 있다.
- 모든 핵심 개선 제안은 cue outcome 또는 delivery metric으로 추적 가능하다.
- `unmeasured`를 발표자의 실수처럼 표현하지 않는다.
- fallback reason 없는 `unmeasured`가 없고, 측정 불가 cue는 coverage 분모와 Top 3 개선 목표에서 제외된다.
- 서버 평가 실패, NLI timeout, STT 비활성, stale cue, transcript 불완전이 서로 다른 사용자용 원인으로 표시된다.
- evidence 없는 고정 문구가 `AI 분석`, `AI 개선 제안`, 정상 평가 결과처럼 렌더링되지 않는다.
- keywords가 없는 덱에 `0% keyword coverage`를 표시하지 않는다.

**검증**

- report view-model unit test
- covered/partial/missed/unmeasured rendering test
- full/basic/none measurement-mode rendering test
- fallback reason and affected-scope rendering test
- static fallback copy is not rendered as AI result test
- failed server evaluation retry-state test
- no-keyword N/A regression test
- golden report snapshot 및 사용자 시나리오 리뷰

**예상 파일**

- `apps/web/src/features/rehearsal/RehearsalReportDocument.tsx`
- `apps/web/src/features/rehearsal/rehearsalSlideAnalysisModel.ts`
- `apps/web/src/features/rehearsal/RehearsalReportDocument.test.tsx`
- `apps/worker/src/rehearsal-stt.processor.ts`
- `services/python-worker/app/rehearsal.py`

**규모/의존성:** M / T12

#### T14. 안정적인 회차 비교, 시작 브리핑, slide-entry reminder

**목적**  
리포트를 읽는 데서 끝나지 않고 다음 발표에서 실제 반복 실수를 줄인다.

**작업**

- 동일 `cueId + revision`을 기준으로 이전 compatible run과 비교한다.
- 반복된 approved core cue 누락, 시간 초과, 전달 문제를 별도 issue로 만든다.
- 개선, 반복, 신규, 비교 불가를 구분한다.
- 시작 전 최대 3개 briefing과 해당 slide 진입 시 한 줄 reminder를 만든다.
- 의미가 바뀐 cue revision은 과거 누락과 자동 비교하지 않는다.
- 실전에서는 dismissed reminder를 반복 노출하지 않는다.

**완료 조건**

- “지난번 놓쳤지만 이번에는 개선함”과 “두 회차 연속 놓침”이 구분된다.
- cue가 재생성되어 의미가 바뀌면 비교 불가로 처리된다.
- briefing은 최대 3개이고, 각 항목은 해당 run evidence로 이동할 수 있다.
- slide-entry reminder가 발표 중 반복적으로 깜빡이지 않는다.

**검증**

- compatible/incompatible revision comparison tests
- repeated/improved/new issue tests
- briefing prioritization test
- live reminder once/dismiss test

**예상 파일**

- `packages/shared/src/rehearsals/rehearsal.schema.ts`
- `apps/api/src/rehearsals/rehearsals.service.ts`
- `apps/api/src/rehearsals/rehearsals.service.spec.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalProjectOverviewPage.tsx`

**규모/의존성:** M / T2, T13

**Phase 3 체크포인트**

한 명의 사용자가 다음 전체 흐름을 완료할 수 있어야 한다.

```text
cue 승인
→ 리허설
→ 의미 전달 리포트 확인
→ 제안된 3개 목표로 재연습
→ 개선/반복 이슈 비교
→ 실전 전 브리핑과 최소 reminder 사용
```

이 흐름이 ORBIT의 핵심 제품 완성 기준이다.

### Phase 4. 조건부 NLI 고도화

#### T15. True pairwise NLI PoC와 shadow rollout

**목적**  
임베딩만으로 애매한 ad-lib을 더 정확히 인정하되 저사양 장비와 실전 안정성을 해치지 않는다.

**작업**

- 현재 zero-shot entailment-like provider와 실제 3-way pairwise NLI provider를 명확히 분리한다.
- `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`의 premise/hypothesis pair logits를 ONNX/WebGPU/WASM에서 검증한다.
- quantization별 모델 크기, cold/warm load, p50/p95 latency, memory, UI responsiveness를 측정한다.
- top-k 1~2, stable window, max token, cooldown, pending job drop 정책을 검증한다.
- 초기에는 사용자 UI/action에 반영하지 않는 shadow mode로 false positive/negative를 수집한다.
- benchmark gate를 통과한 장비에서 리허설 모드만 opt-in한다.
- model not ready, low-memory disable, load failure, inference timeout을 공통 capability/fallback reason으로 연결한다.

**완료 조건**

- neutral/contradiction 점수가 실제 logits임을 검증한다.
- 모델이 준비되지 않아도 lexical/alias/E5 경로가 `measurementMode=basic`으로 동작하고 `정밀 판정 비활성` 상태가 보인다.
- 발표 중 cold load를 하지 않는다.
- false covered와 latency gate를 충족하지 못하면 기본 비활성 상태를 유지한다.
- next slide는 NLI 단독으로 실행되지 않는다.

**검증**

- model label mapping test
- WebGPU/WASM device matrix benchmark
- low-memory fallback test
- model load/inference failure visible capability-event test
- UI main-thread responsiveness test
- shadow vs post-run outcome confusion matrix

**예상 파일**

- `apps/web/src/features/rehearsal/speech/browserSemanticCueNliWorker.ts`
- `apps/web/src/features/rehearsal/speech/browserSemanticCueNliProvider.ts`
- `apps/web/src/features/rehearsal/speech/semanticCueNliProvider.ts`
- 관련 test/benchmark files
- `docs/spikes/semantic-cue-browser-nli-poc.md`

**규모/의존성:** M / T1, T9, T10 및 실제 리허설 로그

## 10. 출시 순서와 feature flag

### Stage A. 내부 준비 품질

- T1~T7과 T2A만 활성화한다.
- 사용자는 cue 후보를 검토할 수 있지만 자동 누락 점수는 기본 표시하지 않는다.
- extraction 품질과 승인/수정/제외 비율을 측정한다.

### Stage B. 리허설 lexical + E5

- T8~T11을 리허설 opt-in으로 연다.
- browser NLI는 꺼도 전체 흐름이 동작해야 하지만 `정밀 판정 비활성` 상태와 `measurementMode=basic`을 숨기지 않는다.
- false covered 사례는 debug export와 post-run review로 수집한다.

### Stage C. Post-run report

- T12~T14를 활성화한다.
- canonical outcome과 다음 목표가 사용자 리포트의 기준이 된다.
- 서버 평가 실패 시 정상 report로 위장하지 않고 부분 평가 상태와 재시도 동작을 제공한다.
- 실제 회차에서 반복 누락 감소를 확인한다.

### Stage D. NLI shadow/limited

- T15의 benchmark gate를 통과한 환경만 리허설 opt-in한다.
- 실전 발표 모드는 충분한 real-world 결과가 쌓이기 전까지 NLI 기본 off 또는 prewarmed conservative mode로 유지한다.

feature flag는 최소한 다음 책임을 분리한다.

- cue review/approval UI
- live cue matching
- rehearsal presenter aids
- live presenter aids
- browser NLI provider
- semantic debug panel
- post-run semantic outcomes

하나의 master flag 아래 모든 동작을 묶지 않는다. 장애 시 각 레이어를 독립적으로 끌 수 있어야 하며, flag로 꺼진 사용자 기대 capability도 silent fallback하지 않고 명시적인 비활성 상태를 제공한다.

## 11. 품질 지표와 출시 gate

아래 숫자는 현재 달성값이 아니라 초기 제안 gate다. T1 baseline을 측정한 뒤 고정한다.

### 11.1 준비 품질

| 지표 | 제안 gate |
|---|---:|
| source grounding precision | 98% 이상 |
| atomic cue 판정 통과율 | 95% 이상 |
| content-rich slide 단일 broad cue 비율 | 5% 이하 |
| technical core cue alias 보유율 | 95% 이상 |
| cue 생성 후 사용자의 승인/수정/제외율 | 추세 관찰 후 목표 확정 |
| stale cue를 최신 cue로 평가한 사례 | 0건 |

### 11.2 리허설 runtime

| 지표 | 제안 gate |
|---|---:|
| approved cue top-k recall | 90% 이상 |
| false `covered` | 1% 이하 |
| `unmeasured`를 `missed`로 잘못 보고 | 0건 |
| warm semantic matching p95 | 500ms 이하 목표 |
| 발표 중 모델 cold load | 0회 |
| fallback 진입의 capability/debug event 기록률 | 100% |
| fallback reason 없는 `unmeasured` | 0건 |
| `basic` 결과를 `full` 판정처럼 표시 | 0건 |
| silent fallback | 0건 |

false covered는 false missed보다 더 위험하게 본다. 사용자가 실제로 설명하지 않은 내용을 설명했다고 인정하면 리포트 신뢰가 무너지기 때문이다.

### 11.3 리포트와 반복 개선

| 지표 | 제안 gate |
|---|---:|
| 핵심 제안의 evidence 추적 가능성 | 100% |
| 첫 화면 개선 목표 수 | 최대 3개 |
| 사용자 확인 없이 suggested cue를 missed 처리 | 0건 |
| fallback/unmeasured 원인의 report 추적 가능성 | 100% |
| compatible run에서 반복 issue 식별 정확도 | 95% 이상 |
| 다음 회차 동일 core cue 반복 누락률 | baseline 대비 감소 |

### 11.4 제품 효과 지표

신뢰성 gate를 통과한 뒤에는 기술 정확도가 아니라 발표 향상 효과를 본다. 초기 목표치는 충분한 표본을 확보한 뒤 다시 고정한다.

| 지표 | 초기 제안 목표 |
|---|---:|
| 2회차 이상 사용자의 반복 high-priority cue 누락률 | 첫 회차 대비 30% 이상 감소 |
| 리포트 Top 3 목표의 다음 회차 개선 비율 | 60% 이상 |
| cue 검토 완료 후 재리허설 전환율 | baseline 수집 후 목표 확정 |
| 실전 aid disable/dismiss 비율 | 낮을수록 좋되 정성 피드백과 함께 해석 |
| 발표 후 “도움이 됨” 평가 | baseline 수집 후 목표 확정 |

### 11.5 안전성과 프라이버시

| 지표 | gate |
|---|---:|
| audience channel cue/notes/evidence 노출 | 0건 |
| 서버 로그 transcript/script/evidence 원문 | 0건 |
| semantic runtime 장애로 수동 진행 실패 | 0건 |
| NLI 단독 자동 slide advance | 0건 |
| degraded/unavailable capability를 근거로 실행된 semantic auto action | 0건 |
| fallback 고정 문구를 AI 판단 결과로 표시 | 0건 |

## 12. 전체 검증 전략

### Unit

- extraction quality validator
- stable ID/merge
- alias any-of coverage
- cue candidate retrieval/ranking
- evidence window와 score combiner
- capability transition과 fallback reason mapping
- fallback action-gate blocking
- final outcome aggregation
- run comparison priority

### Contract

- legacy deck parsing
- TypeScript/Python schema parity
- API/Job revision payload
- report outcome bounded evidence
- capability/fallback event와 unmeasured reason enum
- audience snapshot stripping

### Integration

- deck import → cue extraction → review → rehearsal session
- STT final segments → live decisions → flush → run meta
- STT/NLI/runtime failure → visible degraded state → unmeasured/action block → recovery
- run transcript → post-run outcomes → report
- server evaluation failure → partial report status → retry → recovered outcome
- report → next-run briefing → slide-entry reminder

### Performance

- E5 index 준비 시간과 cache
- semantic matching warm p50/p95
- worker queue drop/flush
- browser NLI model별 cold/warm load와 memory
- 저사양 장비에서 presenter UI frame responsiveness

### Manual/QA

- 대학/대학원 기술 발표
- 그래프·표 중심 연구 발표
- 스타트업 IR의 problem/solution/traction/ask
- speaker notes가 없는 imported PPTX
- STT 미사용·권한 거부·provider unavailable
- 서버 연결 실패와 post-run timeout
- NLI disabled/timeout 및 basic matcher 전환
- semantic runtime exception과 복구
- stale cue와 transcript 불완전
- 실전 presenter-only compact status 및 audience 비노출
- 리허설 중 빠른 slide 전환과 즉시 종료

## 13. 위험과 대응

| 위험 | 영향 | 대응 |
|---|---|---|
| cue를 지나치게 많이 생성 | 발표자가 체크리스트를 읽게 됨 | 후보 생성과 승인 core 수를 분리하고 시간 budget 적용 |
| 시각 요소에서 잘못 추론 | 잘못된 필수 누락 리포트 | `suggested` + source 표시 + 사용자 승인 전 missed 금지 |
| extraction 중 deck 편집 충돌 | 사용자 데이터 손실 | snapshot revision + CAS + merge review |
| cue 재생성으로 ID 변화 | 회차 비교 오염 | stable identity + revision + snapshot 비교 |
| alias가 오탐 증가 | false covered | any-of concept, generic alias 필터, negative fixture |
| E5가 관련성과 충족을 혼동 | 관련 말만 해도 covered | retrieval은 후보 선정, final outcome은 concept/evidence 결합 |
| NLI 오탐·지연 | 발표 방해와 신뢰 저하 | ambiguous top-k only, shadow, prewarm, visible `basic/unmeasured` fallback, 실전 compact status |
| 실시간 결과 손실 | 마지막 cue가 missed로 보임 | stop/slide flush, reason이 있는 `unmeasured`, visible degraded state |
| silent fallback | 사용자가 기능 실패를 정상 판단으로 오해 | capability state를 리허설·실전 presenter UI에 표시하고 event/report에 reason 저장 |
| 고정 fallback 문구 | 실제 AI 판단으로 오인 | AI 결과 영역에서 제거하고 `시스템 상태 안내`로만 표시 |
| fallback 중 자동 action | 잘못된 slide 진행·reveal | semantic action gate 차단, blocked reason 기록, 수동 조작 유지 |
| 개발자 score 중심 리포트 | 사용자가 다음 행동을 모름 | outcome 기반 사용자 문구와 top 3 action |
| evidence 과다 저장 | 프라이버시 위험 | bounded excerpt, redaction, retention 정책 |

## 14. 결정이 필요한 사항

아래는 구현을 막는 질문은 아니며 추천 기본값으로 P0를 진행할 수 있다.

### 14.1 시각 요소만으로 만든 cue의 기본 상태

**추천:** `suggested`, 사용자 승인 전 필수 평가 제외.

이유는 이미지·도형에서 추론한 발표 의도가 실제 발표자의 의도와 다를 수 있기 때문이다.

### 14.2 Cue 검토 UI 위치

**추천:** Editor의 준비 패널을 주 위치로 하고, 리허설 preflight에는 승인 상태 요약과 빠른 이동만 제공한다.

두 위치에서 모두 편집 가능하게 시작하면 상태 동기화와 UX가 복잡해진다.

### 14.3 Evidence 보존 범위

**추천:** 최종 outcome별 best excerpt 1개와 timestamp만 저장하고, raw live decision timeline은 세션 debug export로 제한한다.

사용자 리포트의 설명 가능성을 확보하면서 transcript 중복 저장을 줄일 수 있다.

### 14.4 실전 발표에서의 NLI 기본값

**추천:** 현재는 off. 실제 장비 benchmark와 shadow precision gate를 통과한 뒤 prewarmed conservative mode만 검토한다.

## 15. 병렬화와 PR 경계

### 순차 작업

1. T1 평가 fixture와 T2 공통 계약을 먼저 확정한다.
2. T2A/T3/T4/T5는 T2 이후 병렬 진행할 수 있다.
3. T6 후 T7을 연결한다.
4. T8/T9는 T7의 approved cue 계약을 기준으로 병렬 진행할 수 있다.
5. T10 이후 T11과 T12를 병렬 진행한다.
6. T13 이후 T14를 진행한다.
7. T15는 실제 로그와 T1 평가 결과가 쌓인 뒤 시작한다.

### PR 원칙

- shared 계약 변경과 제품 UI를 한 PR에 섞지 않는다.
- Python extraction 품질과 Web runtime threshold 변경을 한 PR에 섞지 않는다.
- 모든 behavior change PR에는 관련 golden/회귀 test 결과를 포함한다.
- 공통 계약 PR에는 `docs/contracts.md`를 함께 변경한다.
- 사용자 요청 없이 원격 push, 배포, feature flag 활성화를 진행하지 않는다.

## 16. 바로 구현 가능한 최소 안전 범위

다음 범위는 browser NLI 검증을 기다리지 않고 진행할 수 있다.

1. T1 golden fixture와 평가 harness
2. T2 lifecycle/outcome 계약과 `docs/contracts.md`
3. T2A immutable rehearsal evaluation snapshot
4. T3 extraction revision/CAS 안전성
5. T4 editor stale/cascade 처리
6. T5 extraction input/validator 개선
7. T7 cue 검토·승인 UX의 최소 버전
8. T8 alias any-of + cue STT bias
9. T10/T11의 visible capability state, fallback reason, conservative action gate
10. T12/T13의 `unmeasured` 구분, 부분 평가 상태, keyword `N/A` 처리

이 최소 범위만으로도 사용자는 더 정확한 핵심 메시지를 준비하고, 시스템은 측정하지 못한 내용을 실수로 몰아가지 않게 된다.

## 17. 검증 전 기본 활성화하면 안 되는 범위

- browser NLI를 실전 발표 기본값으로 켜는 것
- zero-shot score를 실제 neutral/contradiction으로 리포트하는 것
- NLI 단독으로 cue 전체를 `covered` 처리하는 것
- Semantic Cue를 근거로 자동 slide advance하는 것
- 사용자 승인 전 AI suggested cue를 `missed`로 평가하는 것
- image-only slide에서 출처가 불명확한 cue를 필수로 지정하는 것
- cue revision을 고정하지 않은 회차 비교
- fallback을 성공/정상 decision으로 저장하거나 사용자에게 숨기는 것
- fallback 고정 문구를 AI가 생성한 판단·코칭처럼 표시하는 것
- degraded/unavailable capability를 근거로 auto advance, reveal, animation을 실행하는 것
- raw transcript/premise timeline의 무제한 저장

## 18. Definition of Done

이 계획은 단순히 Semantic Cue 기능이 동작한다고 완료되지 않는다. 다음 조건이 모두 충족되어야 한다.

- 발표자는 리허설 전에 슬라이드별 핵심 메시지를 검토하고 확정할 수 있다.
- 리허설은 대본 그대로 읽지 않은 의미 전달을 인정하되, 관련 단어만 말한 경우를 구분한다.
- 리포트는 모든 승인 core cue를 `covered/partial/missed/unmeasured`로 빠짐없이 정리한다.
- 리포트 첫 화면은 다음 리허설 행동 최대 3개를 제시한다.
- 다음 회차에는 반복 누락과 개선이 안정적인 cue revision으로 비교된다.
- 리허설은 실패·비활성·측정 불가 capability와 영향을 명확히 보여준다.
- 실전 발표 화면은 최소 정보만 보여주고, 의미 runtime이 실패해도 발표를 방해하지 않으면서 발표자 전용 compact status로 상태를 알린다.
- 모든 fallback은 reason과 measurement mode를 가지며 `missed` 또는 정상 정밀 판정으로 위장하지 않는다.
- fallback 고정 문구는 AI 판단 결과와 분리되고, degraded 상태에서 semantic auto action은 차단된다.
- 청중 화면과 서버 로그에 발표자 전용 정보가 노출되지 않는다.
- NLI를 끈 상태에서도 핵심 제품 루프가 완성된다.

최종적으로 ORBIT이 증명해야 할 것은 “NLI를 사용했다”가 아니라 다음이다.

> 사용자가 어떤 내용을 말해야 할지 더 명확히 준비했고, 리허설에서 놓친 부분을 이해했으며, 다음 회차와 실제 발표에서 같은 실수를 줄였다.

## 19. Codex 구현 실행 명세

이 절은 위 계획을 실제 코드 변경으로 옮길 때 사용하는 실행 기준이다. Codex는 한 번에 전체 계획을 구현하지 않고 아래 slice 중 하나만 선택해 구현·검증·보고한다.

### 19.1 구현 시작 전 고정 결정

다음 항목은 추가 질문 없이 기본안으로 구현한다. 변경이 필요하면 해당 slice를 시작하기 전에 이 문서를 먼저 수정한다.

| 항목 | 구현 결정 |
|---|---|
| canonical cue 위치 | `slide.semanticCues` 유지. 별도 Cue Graph를 만들지 않는다. |
| legacy cue | `reviewStatus=suggested`, `freshness=current`, `origin=imported`, `revision=1`로 정규화하고 승인 전 평가 분모에서 제외한다. |
| 사용자 중요도 | `importance=core/supporting/optional`을 canonical 값으로 사용한다. 기존 `required/priority`는 호환 필드로 유지한다. |
| 신규 AI cue | `origin=ai`, `reviewStatus=suggested`, `freshness=current`로 저장한다. |
| 사용자 추가 cue | `origin=manual`, `reviewStatus=approved`, `freshness=current`로 저장한다. |
| cue 검토 저장 | 기존 DeckPatch 흐름에 slide 단위 `replace_semantic_cues` operation을 추가한다. 별도 CRUD API를 만들지 않는다. |
| extraction 동시성 | API가 `baseVersion`을 queue payload에 넣고 worker가 SQL compare-and-set으로 저장한다. |
| run 평가 기준 | run 생성 시 immutable `evaluationSnapshot`을 저장하고 live runtime과 worker가 모두 이 snapshot을 사용한다. |
| 실시간 의미 판정 | lexical/alias → cue E5 top-k → ambiguous top-k NLI 순서다. NLI가 없어도 기본 경로가 동작한다. |
| 최종 판정 | live decision이 아니라 post-run `semanticCueOutcomes`가 canonical report 결과다. |
| fallback | silent fallback 금지. `measurementMode`, capability state, reason을 남기고 UI에 모드별로 표시한다. |
| 자동 action | fallback/degraded 상태에서 semantic 기반 auto advance/reveal/animation을 차단한다. |
| NLI | T15 전까지 optional/shadow다. 실전 기본 off다. |
| evidence 보존 | outcome별 best excerpt 1개와 timestamp만 저장한다. raw live timeline은 bounded debug event로만 유지한다. |

### 19.2 정확한 shared contract 변경안

아래 이름과 enum을 구현 기준으로 사용한다. 실제 Zod 작성 시 기존 `.strict()`, 문자열 길이 제한, dedupe transform을 유지한다.

#### 19.2.1 Semantic Cue lifecycle

`packages/shared/src/deck/semantic-cue.schema.ts`에 다음 schema를 추가한다.

```ts
semanticCueImportanceSchema = z.enum(["core", "supporting", "optional"])
semanticCueReviewStatusSchema = z.enum(["suggested", "approved", "excluded"])
semanticCueFreshnessSchema = z.enum(["current", "stale"])
semanticCueOriginSchema = z.enum(["ai", "manual", "imported"])
semanticCueTypeSchema = z.enum([
  "definition",
  "problem",
  "cause",
  "solution",
  "result",
  "warning",
  "lesson",
  "transition",
  "closing"
])

semanticCueSourceRefSchema = z.object({
  kind: z.enum([
    "slide-title",
    "speaker-notes",
    "element",
    "table",
    "chart",
    "image-analysis"
  ]),
  refId: z.string().trim().min(1).max(120).optional(),
  sourceHash: z.string().trim().min(8).max(128)
}).strict()
```

기존 `semanticCueSchema`에는 다음 필드를 추가한다.

```ts
reportLabel: z.string().trim().min(1).max(80).optional()
presenterTag: z.string().trim().min(1).max(40).optional()
cueType: semanticCueTypeSchema.optional()
importance: semanticCueImportanceSchema.default("supporting")
reviewStatus: semanticCueReviewStatusSchema.default("suggested")
freshness: semanticCueFreshnessSchema.default("current")
origin: semanticCueOriginSchema.default("imported")
revision: z.number().int().positive().default(1)
sourceDeckVersion: z.number().int().positive().optional()
sourceFingerprint: z.string().trim().min(8).max(128).optional()
sourceRefs: z.array(semanticCueSourceRefSchema).max(16).default([])
qualityWarnings: z.array(z.string().trim().min(1).max(80)).max(12).default([])
```

호환 규칙:

- 기존 `required/priority`는 제거하지 않는다.
- review UI가 cue를 저장할 때 `core → required=true, priority=1`, `supporting → required=false, priority=2`, `optional → required=false, priority=3`으로 함께 기록한다.
- legacy parse 기본값이 `suggested`이므로 기존 `required=true`가 자동 승인으로 승격되지 않는다.
- UI는 `reportLabel ?? meaning`, `presenterTag ?? reportLabel ?? meaning` 순서로 fallback하되 이를 AI 분석 결과가 아닌 표시용 label fallback으로만 사용한다.

fingerprint/ID 규칙:

- source text는 NFC 정규화, 연속 공백 축소, trim 후 SHA-256을 계산한다.
- `sourceRefs[*].sourceHash`는 각 note/element/table/chart source 단위 hash다.
- `sourceFingerprint`는 정렬된 `(kind, refId, sourceHash)` 목록과 cue type, normalized required concept를 stable JSON으로 직렬화한 SHA-256이다.
- 재생성 병합은 동일 `sourceFingerprint + cueType` 후보가 정확히 하나일 때만 기존 cue ID를 재사용한다.
- meaning/reportLabel/concept가 같으면 revision을 유지하고, 의미가 바뀌면 동일 ID의 revision을 1 증가시킨다.
- 여러 기존 cue가 동시에 매칭되면 임의 병합하지 않는다. 새 `scue_${uuid}`를 만들고 job warning에 `ambiguous-cue-identity`를 남긴다.
- manual/approved cue는 자동 병합으로 내용이나 revision을 바꾸지 않는다.

#### 19.2.2 DeckPatch operation

`packages/shared/src/deck/patch.schema.ts`에 다음 operation을 추가한다.

```ts
type ReplaceSemanticCuesOperation = {
  type: "replace_semantic_cues";
  slideId: DeckSlideId;
  semanticCues: SemanticCue[];
};
```

적용 규칙:

- `DeckPatch.baseVersion` 충돌 처리는 기존 patch API 정책을 그대로 사용한다.
- `applyPatch.ts`는 slide의 cue 배열을 deep clone하여 교체한다.
- `update_speaker_notes`, 의미 있는 `update_element_props`, text/table/chart element 삭제는 연관 cue의 `freshness`만 `stale`로 바꾸고 `reviewStatus`는 보존한다.
- `delete_element`는 `targetElementIds/sourceRefs`에서 해당 element를 제거하고 cue를 stale 처리한다.
- `delete_slide_action`은 `triggerActionIds`에서 해당 action을 제거한다.
- frame 좌표·z-index·장식 스타일만 바뀐 경우 cue를 stale 처리하지 않는다.

#### 19.2.3 Extraction request/result

public request는 기존 `{ deckId?, force }`를 유지한다. queue 전용 payload schema를 shared에 추가한다.

```ts
type SemanticCueExtractionJobPayload = {
  jobId: string;
  projectId: string;
  request: {
    deckId: string;
    force: boolean;
    baseVersion: number;
  };
};

type SemanticCueExtractionSlideResult = {
  slideId: string;
  status: "succeeded" | "skipped" | "failed";
  semanticCues: SemanticCue[];
  warnings: string[];
};

type SemanticCueExtractionResult = {
  deckId: string;
  sourceDeckVersion: number;
  slides: SemanticCueExtractionSlideResult[];
};
```

worker 병합 규칙:

- API는 enqueue 전에 transaction에서 deck row를 lock하고 pending patch를 replay한 뒤 `writeDeckCheckpoint`와 동일한 방식으로 materialize한다. 이때 확정된 version을 `baseVersion`으로 queue에 넣는다.
- `status=succeeded`인 slide만 병합한다.
- `skipped/failed` 또는 응답에서 누락된 slide는 기존 cue를 보존한다.
- `force=false`: `approved/manual` cue를 보존하고 stale 또는 AI suggested 후보만 갱신한다.
- `force=true`: AI suggested 후보는 전부 재생성하지만 `approved/manual` cue는 보존한다.
- 저장 SQL은 `WHERE project_id=$1 AND deck_id=$2 AND version=$baseVersion`뿐 아니라 `after_version > baseVersion`인 pending patch가 없을 때만 갱신하도록 transaction 또는 `NOT EXISTS` 조건을 사용한다.
- 반환 row가 없으면 `SEMANTIC_CUE_DECK_VERSION_CONFLICT`로 job을 실패시키고 재시도 여부를 사용자에게 표시한다.

Python extraction 세부 규칙:

- LLM response schema에는 `reportLabel`, `presenterTag`, `cueType`, `importance`를 추가한다. `reviewStatus`, `freshness`, `origin`, `revision`, source hash는 LLM이 결정하지 않고 Python/worker가 설정한다.
- LLM의 `importance`에서 호환 `required/priority`를 파생한다. LLM이 두 표현을 동시에 반환하게 하지 않는다.
- `_element_text()`는 text/title/label/alt와 table cell text를 읽는다.
- element input은 `role`, `type`, `visible`, text length를 기준으로 정렬하고 최대 32개를 보낸다. background/decoration/generic alt는 감점한다.
- input에 `deck.version`, target duration, slide estimatedSeconds, audience, purpose, element role/type/source ID를 포함한다.
- `compact_texts()`는 긴 문자열을 drop하지 않고 지정 길이로 truncate한다.
- hypothesis는 `이 슬라이드는`으로 시작할 수 없고 `발표자는 … 설명했다` 형태를 quality validator가 검사한다.
- code identifier/acronym/영문 기술어가 candidate keyword에 있는데 alias가 없으면 `missing-technical-alias` warning을 만든다.
- 독립 접속어와 다중 원인/해결 표현으로 broad cue가 의심되면 `broad-cue` warning을 만든다. warning은 자동 승인 실패 사유이며 cue 자체를 조용히 삭제하지 않는다.
- title/Q&A/closing은 기본 `importance=optional`; content cue 후보는 여러 개 생성할 수 있지만 모두 `suggested`다.
- image-only source에 OCR/VLM 근거가 없으면 `image-source-unverified` warning과 `sourceRefs=[]`를 남기고 승인 전 평가하지 않는다.

quality warning enum의 최소 집합:

```text
broad-cue
missing-technical-alias
slide-centric-hypothesis
hypothesis-missing-required-concept
inconsistent-numeric-claim
weak-negative-hint
ungrounded-source
image-source-unverified
all-cues-priority-one
content-rich-slide-too-few-cues
ambiguous-cue-identity
```

#### 19.2.4 Rehearsal evaluation snapshot

`packages/shared/src/rehearsals/rehearsal.schema.ts`에 owner-only snapshot을 정의한다.

```ts
type RehearsalEvaluationSnapshot = {
  deckId: string;
  deckVersion: number;
  capturedAt: string;
  slides: Array<{
    slideId: string;
    order: number;
    title: string;
    estimatedSeconds: number;
    keywords: Array<{
      keywordId: string;
      text: string;
      synonyms: string[];
      abbreviations: string[];
      required: boolean;
    }>;
    semanticCues: SemanticCue[];
  }>;
};
```

snapshot 생성 규칙:

- `reviewStatus`가 `approved` 또는 `excluded`인 cue만 포함한다.
- `freshness=stale`도 포함하여 report에서 `unmeasured(stale_cue)`로 설명할 수 있게 한다.
- `speakerNotes`, elements, raw transcript, raw audio는 포함하지 않는다.
- `rehearsalRunSchema`에 `deckVersion: number | null`, `evaluationSnapshot: RehearsalEvaluationSnapshot | null`을 추가한다.
- legacy run의 두 필드는 `null`이며 Semantic Cue 최종 결과는 `unmeasured(evaluation_not_run)`이다.

run lifecycle 변경:

- `createRehearsalRunRequestSchema`에 optional `expectedDeckVersion`과 `semanticEvaluationMode: "full" | "delivery-only"`를 추가한다. 기본값은 `full`이다.
- `RehearsalWorkspace`는 STT/P3 session 시작 직전에 run을 생성하고 반환된 server snapshot으로 `P3RehearsalSessionSlide`를 만든다.
- 기존 `runRehearsalUploadFlow`는 새 run을 만들지 않고 이미 생성된 `runId`를 입력받아 upload/meta/complete를 이어간다.
- 사용자가 저장 없이 종료한 run을 정리하기 위해 run status에 `cancelled`를 추가하고 `POST /api/v1/rehearsals/:runId/cancel`을 추가한다. audio processing이 시작된 run은 cancel하지 않는다.
- run 목록/회차 비교는 `cancelled` run을 기본 제외한다.
- 서버 연결 실패로 run을 만들지 못해도 local rehearsal은 계속할 수 있다. 이때 client deck version으로 provisional snapshot을 만들고 `server_evaluation: unavailable/network_error`를 표시한다.
- 재연결 후 run 생성을 재시도할 때 `expectedDeckVersion`이 현재 서버 deck version과 같으면 full run을 만든다. 다르면 명시적인 `delivery-only` run을 만들어 오디오·속도·필러 report는 허용하되 Semantic Cue 결과는 `unmeasured(evaluation_snapshot_mismatch)`로 고정한다.
- `delivery-only` run은 `evaluationSnapshot=null`로 저장하고 semantic worker 호출을 생략한다. client provisional cue 결과를 canonical report로 업로드하지 않는다.

DB 변경:

- migration: `apps/api/src/database/migrations/2026071001000-AddRehearsalEvaluationSnapshot.ts`
- `rehearsal_runs.deck_version integer NULL`
- `rehearsal_runs.evaluation_snapshot_json jsonb NULL`
- `rehearsal_runs.semantic_evaluation_mode text NOT NULL DEFAULT 'full'`
- `down()`은 세 column을 제거한다.
- 기존 row backfill은 하지 않는다.

#### 19.2.5 Capability, fallback, decision, outcome

다음 enum을 shared rehearsal schema에 추가한다.

```ts
SemanticCapability =
  | "stt"
  | "semantic_runtime"
  | "embedding"
  | "nli"
  | "server_evaluation"
  | "cue_freshness"
  | "transcript_evidence";

SemanticCapabilityState = "available" | "degraded" | "unavailable";
SemanticMeasurementMode = "full" | "basic" | "none";

SemanticFallbackReason =
  | "user_disabled"
  | "permission_denied"
  | "stt_unavailable"
  | "network_error"
  | "provider_unavailable"
  | "model_not_ready"
  | "model_load_failed"
  | "timeout"
  | "runtime_error"
  | "server_evaluation_failed"
  | "stale_cue"
  | "transcript_incomplete"
  | "no_transcript"
  | "insufficient_evidence"
  | "slide_not_visited"
  | "evaluation_not_run"
  | "evaluation_snapshot_mismatch"
  | "queue_dropped"
  | "needs_confirmation";
```

```ts
type SemanticCapabilityEvent = {
  eventId: string;
  capability: SemanticCapability;
  fromState: SemanticCapabilityState | null;
  toState: SemanticCapabilityState;
  reason?: SemanticFallbackReason;
  measurementMode: SemanticMeasurementMode;
  retryable: boolean;
  slideId?: string;
  cueIds: string[];
  provider?: string;
  latencyMs?: number;
  at: string;
};
```

기존 `RehearsalSemanticCueDecision`은 provisional/debug 용도로 유지하면서 다음을 추가한다.

```ts
matchedBy: "lexical" | "alias" | "embedding" | "nli"
measurementMode: "full" | "basic" | "none"
fallbackUsed: boolean
fallbackReason?: SemanticFallbackReason
provider?: SemanticCueNliProvider // 기존 required에서 optional로 변경
```

최종 report용 schema를 별도로 추가한다.

```ts
type RehearsalSemanticCueOutcome = {
  slideId: string;
  cueId: string;
  cueRevision: number;
  cueMeaningSnapshot: string;
  reportLabelSnapshot: string;
  importance: "core" | "supporting" | "optional";
  status: "covered" | "partial" | "missed" | "unmeasured" | "excluded";
  confidence?: number;
  matchedBy?: "lexical" | "alias" | "embedding" | "nli" | "post_run_semantic";
  measurementMode: "full" | "basic" | "none";
  fallbackUsed: boolean;
  fallbackReason?: SemanticFallbackReason;
  unmeasuredReason?: SemanticFallbackReason;
  evidence?: {
    excerpt: string; // max 300
    startMs: number;
    endMs: number;
  };
  coveredConcepts: string[];
  missingConcepts: string[];
  feedback?: string; // max 300
};
```

Zod `superRefine` 규칙:

- `status=unmeasured`는 `measurementMode=none`과 `unmeasuredReason`을 요구한다.
- `status=excluded`는 `measurementMode=none`이고 evidence를 가질 수 없다.
- `status=missed`는 `measurementMode=full`에서만 허용한다.
- `fallbackUsed=true`는 `fallbackReason`을 요구한다.
- `measurementMode=basic`은 `covered/partial`만 허용한다. basic matcher에 positive evidence가 없으면 outcome은 `unmeasured/none`이며 absence만으로 `missed`를 만들 수 없다.
- evidence excerpt는 정규화 후 최대 300자로 제한한다.

`rehearsalRunMetaSchema`에는 bounded `semanticCapabilityEvents`를 최대 100개 추가한다. `rehearsalReportSchema`에는 다음을 추가한다.

```ts
semanticEvaluation: {
  state: "succeeded" | "partial" | "unavailable";
  measurementMode: "full" | "basic" | "none";
  reasons: SemanticFallbackReason[];
  retryable: boolean;
};
semanticCueOutcomes: RehearsalSemanticCueOutcome[];
```

기존 `semanticCueDecisions`는 한 번에 제거하지 않고 debug/legacy 호환 필드로 유지한다. `metrics.keywordCoverage` 숫자 필드는 호환성을 위해 유지하고 다음 additive 상태를 추가한다.

```ts
keywordCoverageMeasurement: {
  state: "measured" | "unmeasured";
  reason?: "no-keywords" | "stt-unavailable" | "transcript-incomplete";
};
```

legacy report는 기본 `measured`로 parse한다. 새 report에서 keyword denominator가 0이면 `keywordCoverage=0`을 계산용 placeholder로만 두고 `state=unmeasured, reason=no-keywords`를 기록한다. UI는 상태가 unmeasured일 때 숫자를 렌더링하지 않고 `N/A`를 표시한다.

capability event 검증 규칙:

- `toState=degraded/unavailable`은 `reason`을 요구한다.
- `toState=available`은 복구 event로 사용할 수 있으며 `fromState`와 `at`을 요구한다.
- `cueIds`는 중복 제거 후 최대 50개다.
- event에는 transcript, speaker notes, premise 원문을 넣지 않는다.

### 19.3 결정적 outcome 집계 규칙

post-run aggregator는 evaluation snapshot의 cue를 순회하여 정확히 한 outcome을 만든다. 아래 우선순위를 코드와 테스트에 그대로 사용한다.

```text
1. reviewStatus=excluded
   → excluded / mode=none

2. freshness=stale
   → unmeasured(stale_cue) / mode=none

3. slide를 방문하지 않음
   → unmeasured(slide_not_visited) / mode=none

4. STT 없음 또는 해당 slide transcript 없음
   → unmeasured(no_transcript) / mode=none

5. transcript completeness gate 실패
   → unmeasured(transcript_incomplete) / mode=none

6. strong exact/alias evidence
   → covered 또는 partial / mode=basic 또는 full

7. cue E5 top-k + full post-run semantic evaluation 성공
   → covered, partial, missed 중 하나 / mode=full

8. NLI/server evaluator가 필요한 ambiguous cue인데 provider 실패
   → unmeasured(provider reason) / mode=none

9. basic matcher만 실행되고 strong positive evidence가 없음
   → unmeasured(insufficient_evidence) / mode=none
```

추가 규칙:

- `missed`는 “평가가 정상 완료되었고 의미 전달 근거가 없음”일 때만 생성한다.
- `unmeasured/excluded`는 coverage denominator와 Top 3 개선 목표에서 제외한다.
- `basic covered`는 리포트에 표시할 수 있지만 semantic auto action 근거로 사용하지 않는다.
- live `covered`를 post-run 결과로 그대로 복사하지 않는다. 동일 snapshot과 transcript로 다시 집계한다.
- AI coaching은 outcome을 문장으로 설명할 수 있지만 status, missingConcepts, reason을 변경할 수 없다.

### 19.4 실시간 runtime 구현 순서

#### 19.4.1 Session 입력과 상태

`P3RehearsalSessionSlide`는 run의 evaluation snapshot에서 만든다. 최신 editor deck의 cue를 직접 넘기지 않는다.

session 시작 순서:

```text
현재 deck version 확인
→ create rehearsal run(expectedDeckVersion)
→ 성공: server evaluation snapshot을 session 입력으로 사용
→ 실패: server_evaluation unavailable event 표시
          local provisional snapshot으로 리허설만 계속
→ stop/upload: 기존 runId 재사용
→ run이 없으면 같은 expectedDeckVersion으로 생성 재시도
→ version mismatch면 delivery-only run으로 업로드
   semantic outcome은 unmeasured(evaluation_snapshot_mismatch)
```

현재 `runRehearsalUploadFlow` 안에서 run을 생성하는 코드는 제거하고 `runId` 누락을 validation error로 처리한다. run meta update의 현재 빈 `catch`도 제거하여 `server_evaluation` capability와 사용자 상태로 전달한다.

- matcher 입력에는 `reviewStatus=approved && freshness=current` cue만 넣는다.
- `approved + stale` cue는 matcher에서 제외하고 `cue_freshness: degraded/stale_cue` 상태를 만든다.
- `excluded` cue는 live UI와 matcher에서 제외하고 post-run aggregator에서만 `excluded` outcome을 만든다.

`P3RehearsalSessionState`에 다음을 추가한다.

```ts
capabilityStatuses: Record<SemanticCapability, {
  state: SemanticCapabilityState;
  reason?: SemanticFallbackReason;
  measurementMode: SemanticMeasurementMode;
  retryable: boolean;
}>;
```

`CreateP3RehearsalSessionInput`에는 `onSemanticCapabilityEvent` callback을 추가하고 `P3RehearsalSession`에는 내부 reducer를 둔다. 상태 변경이 없으면 중복 event를 만들지 않는다.

#### 19.4.2 STT 상태

- `port.start()` 성공 시 `stt: available/full` event를 기록한다.
- 사용자 설정 off는 `unavailable/user_disabled`다.
- mic permission 거부는 `unavailable/permission_denied`다.
- `port.onError`는 session 전체를 무조건 `failed`로 종료하지 않고 STT capability를 unavailable로 바꾸고 manual presentation을 유지한다.
- STT unavailable 구간의 approved cue는 live에서 missed 처리하지 않는다.

#### 19.4.3 Evidence window

- slide별 final segment ring buffer를 유지한다.
- 최근 8초를 보관하고 최소 3초 또는 문장 종결 시 평가한다.
- window text는 600자로 제한하고 timestamp range를 함께 유지한다.
- slide change 전 `flushSemanticQueue(1500ms)`를 호출한다.
- timeout 시 `queue_dropped` event와 affected cue 범위를 남기고 해당 cue를 unmeasured 후보로 기록한다.
- `stop()`은 generation을 먼저 무효화하지 말고 queue flush 후 generation을 닫는다.

#### 19.4.4 Cue retrieval과 NLI

- slide 진입 전에 approved/current cue의 `meaning`, `nliHypotheses`, `requiredConcepts` embedding을 준비한다.
- transcript query embedding과 cue별 max cosine similarity를 `retrievalScoresByCueId`로 만든다.
- candidate selector는 `retrievalScore`, alias any-of, concept coverage를 사용한다. priority만으로 후보가 될 수 없다.
- canonical term과 aliases는 하나의 concept group이다. group 내 하나 이상 match하면 1회 hit이고, concept coverage는 `matched groups / total groups`다.
- strong lexical/alias match는 NLI 없이 decision을 남긴다.
- NLI는 top 2 cue, cue당 최대 2 hypothesis, 1회 입력 최대 96 tokens로 제한한다.
- NLI timeout 기본값은 1200ms로 시작하되 config 상수로 두고 T1 fixture/benchmark 후 조정한다.
- timeout/provider failure 시 strong deterministic positive만 `basic`; 그 외는 `unmeasured`다.

초기 scoring 값은 신규 `semanticCueRuntimeConfig.ts` 한 곳에 둔다.

```text
candidateScore =
  0.20 * lexicalScore +
  0.25 * conceptCoverage +
  0.45 * retrievalScore +
  0.10 * importanceScore

candidate eligible =
  lexicalScore >= 0.20 OR
  conceptCoverage > 0 OR
  retrievalScore >= 0.55

basic covered =
  exact phrase match OR
  (conceptCoverage == 1 AND retrievalScore >= 0.60)

basic partial =
  candidateScore >= 0.62 AND
  (lexicalScore >= 0.20 OR conceptCoverage >= 0.34)
```

이 값은 출시 gate가 아니라 T1 golden fixture를 시작하기 위한 보수적 초기값이다. threshold는 component 내부에 하드코딩하지 않고 config와 test fixture를 함께 변경한다. E5 점수만으로 `covered`를 만들지 않는다.

#### 19.4.5 Action gate

semantic action 전에 다음 순서로 검사한다.

```text
manual action인가? → 허용
관련 capability가 available/full인가? 아니면 차단
cue freshness가 current인가? 아니면 차단
transcript evidence가 complete인가? 아니면 차단
required cue coverage/min dwell/cooldown/transition phrase 충족? 아니면 차단
모든 조건 통과 → 기존 action controller에 전달
```

fallback 차단 reason은 `SemanticCueDebugEvent.actionGate.blockedReasons`와 capability event에 기록한다. 차단된 자동 action을 나중에 복구 시 재생하지 않는다.

### 19.5 UI 구현 계약

#### 19.5.0 Cue 검토·승인 UI

- Editor에 slide별 cue panel을 추가하고 `reportLabel`, `meaning`, `importance`, aliases, source/quality warning을 보여준다.
- 기본 동작은 `승인`, `보조로 변경`, `제외`, `문구 수정`, `직접 추가`다. NLI hypothesis와 source hash는 advanced/debug 영역으로 숨긴다.
- 저장은 현재 slide의 전체 cue 배열을 `replace_semantic_cues` patch로 보낸다.
- 승인/importance 변경만으로 cue revision을 올리지 않는다.
- meaning, requiredConcepts, aliases, nliHypotheses가 바뀌면 revision을 1 증가시키고 `origin=manual`, `freshness=current`로 바꾼다.
- reportLabel/presenterTag만 바뀌면 revision을 유지한다.
- manual cue에 hypothesis가 없으면 `발표자는 다음 내용을 설명했다: ${meaning}`을 deterministic하게 만들고 AI 생성 결과로 표시하지 않는다.
- stale cue는 기존 승인 상태와 이전 source를 보여주고 `재승인` 또는 `제외` 전까지 matcher에 넣지 않는다.
- patch version conflict가 나면 덮어쓰지 않고 최신 slide cue를 다시 불러와 diff를 보여준다.

#### 19.5.1 공통 상태 view-model

신규 `SemanticCapabilityStatus.tsx`는 raw event를 직접 해석하지 않는다. 별도 pure model 함수가 다음 view-model을 만든다.

```ts
type SemanticCapabilityStatusItem = {
  key: SemanticCapability;
  severity: "info" | "warning" | "error";
  shortLabel: string;
  detail: string;
  retryable: boolean;
  affectedCount: number;
};
```

표시 우선순위는 `STT unavailable → semantic runtime unavailable → stale cue → server evaluation unavailable → NLI degraded → transcript incomplete` 순서다.

사용자 copy는 신규 `semanticCapabilityCopy.ts`의 reason→system-status mapping 한 곳에서 관리한다. copy model은 항상 `source: "system-status"`를 반환하고 AI coaching renderer에 전달할 수 없는 별도 타입을 사용한다. 현재 workspace에 흩어진 generic/깨진 fallback 문자열은 이 mapping 또는 실제 error message로 교체한다.

#### 19.5.2 리허설

- `RehearsalPanel` 상단 또는 cue checklist 바로 위에 `시스템 상태` 영역을 고정한다.
- unavailable은 원인과 해결 동작을 보여준다. 가능한 동작은 `마이크 권한 확인`, `재시도`, `Cue 검토로 이동`, `서버 재평가`다.
- degraded/basic 상태는 warning 색상과 `기본 의미 체크` label을 사용한다.
- 시스템 상태 copy는 AI coaching 카드와 다른 component/ARIA label을 사용한다.
- 상태가 복구되면 같은 row에서 3초간 `복구됨`을 보여준 뒤 제거한다.

#### 19.5.3 실전 presenter

- `PresenterRemoteWindow`에 최대 한 줄의 compact status rail을 둔다.
- 동시에 여러 장애가 있으면 가장 높은 severity 한 개와 `+N`을 표시한다.
- hover/focus 또는 단축키로 상세를 볼 수 있지만 자동 modal/toast는 띄우지 않는다.
- 이 상태는 presenter state에만 존재하며 `createSlideWindowDeckSnapshot`과 audience channel payload에 포함하지 않는다.

#### 19.5.4 Debug panel

- latest event 단일 화면을 timeline + detail 구조로 바꾼다.
- 각 event는 capability, from/to state, reason, provider, latency, fallback path, affected cue, action block을 표시한다.
- copy/export JSON은 transcript 원문을 기본 제외하거나 명시적 debug flag에서만 bounded excerpt를 포함한다.
- ring buffer는 100개를 유지한다.

#### 19.5.5 Report

- report view-model을 component 밖 pure 함수로 만든다.
- 상단 `측정 상태`는 `succeeded/partial/unavailable`과 reason을 표시한다.
- coverage 계산은 `(covered + partial + missed)`만 denominator로 사용한다.
- `unmeasured/excluded`는 별도 목록과 원인으로 표시한다.
- `measurementMode=basic` badge를 표시한다.
- evidence 없는 static copy는 `시스템 상태 안내`에만 표시하고 `AI 분석/AI 개선 제안` 영역에 넣지 않는다.

### 19.6 Post-run 서버 평가 구현

기존 `/rehearsal/analyze`에 모든 책임을 추가하지 않고 Python worker에 별도 endpoint를 둔다.

```text
POST /rehearsal/analyze-semantic-cues
```

요청:

```ts
type AnalyzeSemanticCuesRequest = {
  runId: string;
  evaluationSnapshot: RehearsalEvaluationSnapshot;
  segments: Array<{ startMs: number; endMs: number; text: string }>;
  slideTimeline: Array<{ slideId: string; enteredAtMs: number; exitedAtMs?: number }>;
  provisionalDecisions: RehearsalSemanticCueDecision[];
  capabilityEvents: SemanticCapabilityEvent[];
};
```

응답:

```ts
type AnalyzeSemanticCuesResponse = {
  semanticEvaluation: RehearsalReport["semanticEvaluation"];
  semanticCueOutcomes: RehearsalSemanticCueOutcome[];
};
```

worker 처리 순서:

1. run entity의 evaluation snapshot을 shared schema로 parse한다.
2. STT segments를 snapshot slide timeline과 정렬한다.
3. Python semantic endpoint를 호출한다.
4. 성공 응답을 shared schema로 검증한다.
5. 실패하면 일반 delivery report는 계속 만들고 Semantic Cue outcome을 reason 있는 `unmeasured`로 채운다.
6. report의 `semanticEvaluation.state`를 `partial/unavailable`로 저장한다.
7. 재시도 job은 기존 성공한 delivery analysis를 재사용하고 semantic evaluation만 idempotent하게 교체한다.

재시도 계약:

- endpoint: `POST /api/v1/rehearsals/:runId/semantic-evaluation/retry`
- job type: `rehearsal-semantic-evaluation`
- 기존 Redis transcript cache에 timestamped segment payload를 별도 key로 최대 30분 저장한다. DB에는 전체 segment/transcript를 추가 저장하지 않는다.
- retry endpoint는 cache가 남아 있고 run snapshot이 존재할 때만 job을 만든다.
- cache가 없으면 HTTP 409 `REHEARSAL_SEMANTIC_EVIDENCE_EXPIRED`와 `retryable=false`를 반환한다.
- retry worker는 기존 delivery metric/coaching을 변경하지 않고 `semanticEvaluation`과 `semanticCueOutcomes`만 교체한다.
- Redis key, job payload, server log에 transcript/segment 원문을 출력하지 않는다.

Python evaluator 규칙:

- full transcript를 로그에 남기지 않는다.
- snapshot cue별로 정확히 한 outcome을 반환한다.
- provider failure를 generic coaching 문구로 대체하지 않는다.
- deterministic exact/alias evidence를 먼저 평가한다.
- semantic grader가 필요한 cue만 model/provider를 호출한다.
- `missed`와 `unmeasured` 규칙은 19.3을 그대로 따른다.

#### 19.6.1 회차 비교 API

endpoint:

```text
GET /api/v1/projects/:projectId/rehearsals/:runId/comparison
```

response:

```ts
type RehearsalRunComparison = {
  currentRunId: string;
  previousRunId: string | null;
  improved: ComparisonIssue[];
  repeated: ComparisonIssue[];
  newIssues: ComparisonIssue[];
  incomparable: ComparisonIssue[];
  briefing: ComparisonIssue[]; // max 3
};

type ComparisonIssue = {
  category: "semantic-cue" | "timing" | "delivery";
  slideId: string;
  cueId?: string;
  cueRevision?: number;
  label: string;
  severity: "high" | "medium" | "low";
  reason: string;
};
```

비교 규칙:

- 동일 `cueId + cueRevision`만 직접 비교한다.
- 이전 `missed/partial`이 현재 `covered`면 improved다.
- 이전과 현재가 모두 `missed/partial`이고 core cue면 repeated다.
- 현재만 `missed/partial`이면 newIssues다.
- 어느 한쪽이 `unmeasured/excluded`이거나 revision이 다르면 incomparable이며 부정적 briefing에 넣지 않는다.
- briefing 우선순위는 `repeated core miss → current core miss → 반복 시간 초과 → 반복 delivery issue`이고 최대 3개다.
- 실전 slide-entry reminder는 repeated high severity issue만 1회 표시한다.

#### 19.6.2 업무 이벤트 로그

API/Worker 변경은 다음 업무 이벤트를 structured log로 남긴다.

```text
semantic_cue.extraction.queued
semantic_cue.extraction.succeeded
semantic_cue.extraction.failed
semantic_cue.extraction.version_conflict
rehearsal.evaluation_snapshot.created
rehearsal.semantic_evaluation.started
rehearsal.semantic_evaluation.partial
rehearsal.semantic_evaluation.succeeded
rehearsal.semantic_evaluation.retry_failed
```

허용 필드는 `projectId`, `deckId`, `deckVersion`, `runId`, `jobId`, cue count, slide count, capability/reason code, latency다. cue meaning, speaker notes, transcript, premise/hypothesis, evidence excerpt, raw audio는 로그에 넣지 않는다.

### 19.7 구현 slice와 PR 순서

각 slice는 별도 branch/PR을 권장한다. 이전 slice가 병합되지 않았다면 shared 계약에 의존하는 다음 slice를 시작하지 않는다.

| Slice | 기존 Task | 산출물 | 주요 파일 | 필수 검증 |
|---|---|---|---|---|
| S00 | 전체 | baseline 기록, dirty worktree 보호, 기존 테스트 실패 목록 | 코드 변경 없음 | `git status --short`, scoped tests |
| S01 | T2 | Semantic Cue lifecycle/source schema와 legacy defaults | `semantic-cue.schema.ts`, 신규 schema test, `deck.schema.test.ts`, `docs/contracts.md` | shared test/typecheck |
| S02 | T2 | capability, decision, outcome, report schema | `rehearsal.schema.ts`, `rehearsal.schema.test.ts`, `docs/contracts.md` | shared test/typecheck |
| S03 | T2A | run snapshot DB/API 저장과 cancel lifecycle | run entity, migration, rehearsals controller/service/spec | API test + migration run/revert |
| S04 | T2A/T12 | run 선생성, upload 재사용, web/worker snapshot 사용 | `RehearsalWorkspace.tsx`, rehearsal processor/spec | web/worker tests |
| S05 | T4/T7 | `replace_semantic_cues` patch | `patch.schema.ts`, `applyPatch.ts`, 관련 tests | shared/editor-core tests |
| S06 | T4 | content edit cascade와 stale 처리 | `applyPatch.ts`, `applyPatch.test.ts`, deck schema tests | editor-core/shared tests |
| S07 | T3 | extraction `baseVersion`, CAS, force/partial semantics | extraction schema, deck service/spec, extraction processor/spec | shared/API/worker tests |
| S08 | T5 | Python input ranking/table extraction/quality validator | `semantic_cues.py`, filters, LLM prompt, tests | ruff/mypy/pytest |
| S09 | T6 | stable ID/revision merge | 신규 `semantic_cue_merge.py`, semantic cues, tests, processor spec | Python + worker tests |
| S10 | T7 | Cue 검토·승인 UI | review model/panel/tests, `EditorShell.tsx` | web test/typecheck |
| S11 | T8 | alias any-of와 cue STT bias | candidate selector/test, bias phrases/test, P3 test | web tests |
| S12 | T9 | cue E5 index와 retrieval score 연결 | 신규 embedding index/test, runtime, P3 session/test | web tests + benchmark fixture |
| S13 | T10 | capability reducer/event/debug schema | 신규 capability module/test, debug events/test, shared run meta | shared/web tests |
| S14 | T10 | evidence window와 slide/stop flush | P3 session/test, collector/test | web tests/typecheck |
| S14A | T10 | runtime visible fallback와 conservative decision | semantic runtime/test, score combiner/test | web tests/typecheck |
| S15 | T11 | 리허설 시스템 상태 UI와 copy model | status/copy model/tests, RehearsalPanel/test | web component tests |
| S16 | T11 | 실전 compact status와 conservative action gate | PresenterRemoteWindow/test, presentationChannel/test, auto advance config/test | web tests + audience leakage test |
| S17 | T11 | debug fallback timeline/export | SemanticCueDebugPanel/test, debug event serialization | web tests |
| S18 | T12 | Python post-run semantic endpoint | `main.py`, `rehearsal.py` 또는 신규 evaluator, Python tests | ruff/mypy/pytest |
| S19 | T12 | worker outcome aggregation과 partial report 저장 | rehearsal processor/spec, shared response validation | worker tests |
| S19A | T12 | cached semantic retry job/API | transcript cache, retry controller/service/spec, job schema/processor | worker/API tests |
| S20 | T13 | 사용자 report view-model/UI | report document/test, slide analysis model | web tests + snapshot review |
| S21 | T14 | run comparison, briefing, reminder | rehearsal schema, API service/spec, workspace/overview tests | shared/API/web tests |
| S22 | T15 | true NLI shadow PoC | browser provider/worker/tests, spike 문서 | device benchmark; 기본 flag off |

### 19.8 Slice별 상세 완료 기준

#### S01–S02 계약 checkpoint

- 기존 `deck_semantic_cue.json`과 기존 rehearsal report fixture가 parse된다.
- legacy cue가 `suggested`로 정규화되고 자동 missed 대상이 아니다.
- `unmeasured` without reason, `fallbackUsed` without reason, `missed + mode=none`이 schema validation에서 실패한다.
- `docs/contracts.md`가 code schema와 같은 enum/default를 설명한다.

#### S03–S04 snapshot checkpoint

- run 생성 직후 deck을 수정해도 run snapshot이 변하지 않는다.
- P3 session 시작 전에 run이 생성되고 upload flow가 동일 runId를 재사용한다.
- server run 생성 실패 시 local rehearsal은 visible offline 상태로 계속되며 정상 server report를 가장하지 않는다.
- 저장하지 않고 종료한 run은 cancelled 되고 회차 비교에서 제외된다.
- web runtime과 worker report가 최신 deck이 아니라 run snapshot의 cue revision을 사용한다.
- legacy run은 정상 조회되며 Semantic Cue 영역만 `unmeasured(evaluation_not_run)`이다.
- migration `up/down/up`이 로컬 PostgreSQL에서 성공한다.

#### S05–S10 preparation checkpoint

- cue 승인/수정/제외가 DeckPatch history와 undo/redo를 통과한다.
- notes/text/table 변경은 approved 상태를 보존하면서 freshness만 stale로 만든다.
- extraction 충돌이 사용자 편집을 덮어쓰지 않는다.
- LLM 일부 slide 실패가 기존 cue를 삭제하지 않는다.
- AI regeneration이 manual/approved cue ID와 revision을 보존한다.
- imported deck에서 사용자가 core/supporting/excluded를 저장할 수 있다.

#### S11–S14A runtime checkpoint

- alias 추가가 coverage 분모를 늘리지 않는다.
- notes가 없는 slide에서도 cue top-k가 생성된다.
- exact/alias/E5/NLI 모두 같은 decision schema로 기록된다.
- STT off, NLI timeout, runtime exception, queue drop이 각각 다른 capability reason을 만든다.
- basic mode에서 absence를 missed로 판정하지 않는다.
- stop/slide change가 pending evidence를 조용히 유실하지 않는다.

#### S15–S17 UX/observability checkpoint

- 리허설에서 실패한 capability와 영향이 debug flag 없이 보인다.
- 실전에서는 presenter-only compact chip으로 보이고 audience에는 노출되지 않는다.
- fallback 상태에서 semantic auto action은 실행되지 않는다.
- debug export로 fallback reason, skipped reason, timeout, provider, action block을 재현할 수 있다.
- fixed fallback copy가 AI result component에 렌더링되지 않는다.

#### S18–S21 report/loop checkpoint

- snapshot의 reviewed cue마다 outcome이 정확히 하나 존재한다.
- excluded/stale/no transcript/server failure가 missed로 변환되지 않는다.
- server semantic endpoint failure에도 delivery report는 생성되며 측정 상태가 partial/unavailable로 보인다.
- retry 성공 시 같은 report/run에 semantic outcome이 idempotent하게 갱신된다.
- retry cache가 만료되면 `retryable=false`와 evidence expired 원인이 보이고 고정 결과로 대체되지 않는다.
- Top 3 목표는 full/basic positive evidence가 있는 partial/missed만 사용한다.
- compatible `cueId + revision`만 회차 비교에 사용한다.

#### S22 NLI checkpoint

- true pairwise label mapping이 fixture로 검증된다.
- model load/timeout/low-memory가 visible capability state로 연결된다.
- warm latency와 false-covered gate를 통과하지 못하면 flag는 off로 유지된다.
- NLI 결과는 action의 단독 근거가 아니다.

### 19.9 필수 테스트 매트릭스

아래 사례는 최소 regression fixture다. 구현 slice가 관련 행을 깨뜨리면 완료로 처리하지 않는다.

| Case | 입력/상태 | live 표시 | 최종 outcome | action |
|---|---|---|---|---|
| F01 | STT user disabled | `음성 인식 꺼짐` | approved cue `unmeasured(user_disabled)` | 음성/semantic auto action 차단 |
| F02 | mic permission denied | 권한 원인 + 해결 동작 | `unmeasured(permission_denied)` | 차단 |
| F03 | exact alias match, NLI off | `기본 의미 체크` | `covered/basic` | semantic auto action 단독 근거 불가 |
| F04 | ambiguous E5 candidate, NLI timeout | `정밀 판정 비활성` | `unmeasured(timeout)` | 차단 |
| F05 | semantic runtime throws | `의미 체크 오프라인` | 장애 구간 `unmeasured(runtime_error)` | 차단, manual 유지 |
| F06 | approved stale cue | `Cue 재검토 필요` | `unmeasured(stale_cue)` | 해당 cue action 차단 |
| F07 | transcript missing final segment | `근거 부족` | `unmeasured(transcript_incomplete)` | 영향 구간 차단 |
| F08 | slide not visited | live 표시 없음 | `unmeasured(slide_not_visited)` | 해당 없음 |
| F09 | server semantic endpoint timeout | 리허설 계속, 서버 평가 상태 표시 | report `partial/unmeasured(timeout)` | report retry만 허용 |
| F10 | server retry succeeds | `복구됨` | canonical outcome으로 교체 | 과거 live action 재생 금지 |
| F11 | provider returns empty unexpectedly | fallback reason 표시 | `unmeasured(provider_unavailable)` | 차단 |
| F12 | fixed generic coaching only | `시스템 상태 안내` label | AI evidence/outcome으로 저장 금지 | 근거 사용 금지 |
| F13 | full evaluation, no evidence | 정상 측정 완료 | `missed/full` | 기존 다중 gate 없이는 차단 |
| F14 | excluded cue | 표시/평가 제외 | `excluded/none` | 차단 |
| F15 | offline rehearsal 후 server deck version mismatch | `서버 의미 평가 불가` | delivery report 유지, cue `unmeasured(evaluation_snapshot_mismatch)` | semantic action/report 비교 제외 |

### 19.10 검증 명령

slice에서는 관련 명령을 먼저 실행하고, phase checkpoint에서 전체 명령을 실행한다.

#### Shared / editor

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared typecheck
pnpm --filter @orbit/editor-core test
pnpm --filter @orbit/editor-core typecheck
```

#### Web

```bash
pnpm --filter @orbit/web test
pnpm --filter @orbit/web typecheck
```

특정 slice에서는 관련 Vitest 파일을 인자로 좁혀 먼저 실행한 뒤 전체 `@orbit/web` test를 실행한다.

#### API / Worker

```bash
pnpm --filter @orbit/api test
pnpm --filter @orbit/api typecheck
pnpm --filter @orbit/worker test
pnpm --filter @orbit/worker typecheck
```

#### Python worker

```bash
cd services/python-worker
uv run ruff check .
uv run mypy app
uv run pytest
```

#### Migration

```bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
pnpm db:migration:run
```

#### Phase checkpoint

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
node infra/scripts/check-env.mjs
docker compose config
```

실행하지 못한 명령은 생략하지 말고 이유와 미검증 범위를 PR/작업 결과에 남긴다.

### 19.11 Codex 작업 절차

Codex는 각 slice에서 다음 순서를 따른다.

1. `AGENTS.md`, 이 문서, `docs/contracts.md`를 읽는다.
2. `git status --short`로 사용자 변경을 확인하고 관련 없는 수정은 건드리지 않는다.
3. 구현할 slice 하나와 선행 slice 완료 여부를 확인한다.
4. 대상 코드와 기존 test pattern을 읽는다.
5. shared contract가 필요한 경우 contract/test를 먼저 변경한다.
6. 최소 동작을 구현하고 regression test를 추가한다.
7. slice 검증 명령을 실행한다.
8. diff에서 transcript/script/raw audio가 로그에 추가되지 않았는지 확인한다.
9. audience channel payload에 presenter-only 상태가 들어가지 않았는지 확인한다.
10. 완료 조건, 실행한 테스트, 남은 위험, 다음 slice를 결과에 기록한다.

한 turn에 여러 slice를 구현해야 한다면 shared 파일을 동시에 수정하는 slice는 병렬 처리하지 않는다. S01→S02→S03, S07→S08→S09, S13→S14→S14A, S18→S19→S19A→S20은 순차 작업이다.

### 19.12 Slice 완료 보고 형식

```text
완료 slice: Sxx

변경:
- 계약/동작 요약
- 사용자에게 보이는 변화

검증:
- 실행 명령과 결과
- 추가된 regression case

호환성/안전:
- legacy parse 여부
- fallback/unmeasured 처리
- audience/log privacy 확인

남은 범위:
- 의도적으로 다음 slice로 미룬 항목
- 미실행 테스트와 이유

다음 slice:
- Sxx
```

이 형식을 만족하지 않으면 코드가 빌드되더라도 해당 slice를 완료로 보지 않는다.
