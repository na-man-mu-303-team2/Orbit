# 슬라이드 의미 기반 Motion Planner 구현 계획 (에이전트 실행용) — v1

작성일: 2026-07-23
상위 문서: `docs/plans/slide-redesign-implementation.md`
관련 계약: `docs/contracts.md`, `packages/shared/src/deck`
검토 기준: 원격 확인 `origin/develop@6be25048fbf6b4bf776806ab70dffefa65447a6f`
범위: **PR-M0~PR-M5.** Motion Eligibility Gate + 의미 추출 + Narrative Motion Plan + 결정론적 compiler + 안전 병합 + 실제 motion preview + 평가·점진 출시.

> 이 문서의 핵심은 애니메이션 효과 종류를 늘리는 것이 아니다. 현재 `recommend-animation`은 요소 역할과 위치를 정렬해 `appear`/`fade-in`/`zoom-in`을 붙이는 단순 휴리스틱이다. 이를 다음 파이프라인으로 교체한다.
>
> **슬라이드 이해 → 발표 beat 계획 → 결정론적 compiler → 기존 timeline 병합·검증 → 실제 motion preview**
>
> LLM은 슬라이드의 이야기를 어떤 순서로 보여 줄지만 제안한다. 실제 effect, duration, delay, `startMode`, `animationId`, patch는 코드가 결정한다.

## 출시 구간

| 구간 | 범위 | 예상 | 사용자가 얻는 것 |
| --- | --- | ---: | --- |
| **M3-A 안전 기반** | PR-M0 | 2일 | snapshot·불완전 import·special slide에서 Web/API/Worker/apply가 일관되게 추천을 거부 |
| **M3-B 의미 계획** | PR-M1~PR-M3 | 6일 | 슬라이드 의미와 발표 흐름을 반영한 안전한 3종 애니메이션 추천 |
| **M3-C 체감·검증** | PR-M4~PR-M5 | 4일 | 재생 가능한 proposal preview, 12종 golden/eval, 단계적 출시 |
| | **합계** | **12일** | |

PR-M0는 독립적으로 먼저 배포한다. 현재 heuristic으로 롤백하더라도 PR-M0의 eligibility 검증은 남겨야 한다. PR-M1~M3는 서버 플래그 뒤에서 shadow 평가가 가능하고, PR-M4는 사용자 노출 전에 합쳐져야 한다.

---

## 0. 이 문서를 실행하는 에이전트를 위한 규칙

1. **`AGENTS.md`가 최우선이다.** 공통 Deck/patch 계약은 `packages/shared` Zod schema를 기준으로 하며, 계약이 바뀌면 `docs/contracts.md`와 Python 모델을 같이 맞춘다.
2. **PR 순서를 지킨다.** PR-M0 없이 planner나 preview를 먼저 노출하지 않는다. 각 PR은 독립적으로 검증·롤백 가능해야 한다.
3. **안전 gate는 feature flag 밖에 둔다.** planner가 `off`여도 snapshot, partial/unknown import, activity slide에는 기존 heuristic을 실행하지 않는다.
4. **추천 실패를 자유 생성 경로로 넘기지 않는다.** `refused-unsafe` 또는 merge 실패는 `operations=[]`로 종료한다.
5. **speaker notes는 일시적 입력이다.** bounded text만 LLM 요청 메모리에 올리고, 로그·Job payload/result·message `contextJson`의 motion 파생 정보·proposal metadata에 원문 또는 발췌문을 남기지 않는다.
6. **PPTX serializer가 안전하게 보존하는 범위를 초과하지 않는다.** Deck schema가 7종을 허용해도 이 기능은 `appear`, `fade-in`, `zoom-in`만 생성한다.
7. **기존 사용자 motion을 보존한다.** 명시적 “교체” 요청이 아닌 추천에서 animation/action 삭제를 만들지 않는다.
8. 이 문서의 경로와 함수는 위 검토 기준에서 확인했다. 구현 중 구조가 바뀌었으면 해당 PR의 파일 목록과 계약 영향을 갱신한 뒤 진행한다.

---

## 1. 사전 확인된 현재 상태

### 1.1 현재 추천은 slide semantics가 아니라 정렬 휴리스틱이다

`services/python-worker/app/ai/design_agent.py`의 `_build_animation_recommendation()`은 현재 다음 방식으로 동작한다.

- 이미 animation이 있는 요소와 `background`/`decoration`/`footer`/`group`을 제외한다.
- title을 먼저, 나머지를 `y`, `x` 순으로 정렬하고 최대 8개를 고른다.
- title은 `fade-in`, image/chart/table은 `zoom-in`, 나머지는 `appear`로 정한다.
- 첫 title은 `on-slide-enter`, 첫 본문은 `on-click`, 이후에는 group 여부에 따라 `with-previous`/`after-previous`를 사용한다.
- 모든 duration을 500ms, delay를 0, easing을 `ease-out`으로 둔다.

이는 안전한 최소 구현이지만 process의 단계, comparison의 두 진영, data의 근거→결론, 발표자 강조점 같은 의미를 이해하지 않는다. 효과 수를 늘려도 이 문제는 해결되지 않는다.

### 1.2 현재 안전 gate에는 `importRenderMode` 공백이 있다

| 계층 | 현재 동작 | 위험 |
| --- | --- | --- |
| Web canvas | `canEditSlideCanvas()`가 `importRenderMode === "snapshot"`을 차단 | canvas는 안전 |
| Web AI panel | `EditorRightPanel`이 `designEditingEnabled={!isSpecialSlide}`만 전달 | snapshot content에서도 AI chatbot이 열릴 수 있음 |
| Web motion policy | `getAnimationMutationDisabledReason()`이 import source/coverage를 보지만 render mode는 보지 않음 | snapshot/hybrid 제한이 UI마다 다름 |
| API create | 최신 deck/version/slide ID만 확인하고 client `input.context`를 Python에 전달한 뒤 결과에 `applyDeckPatch()` 수행 | client context가 authoritative slide와 달라도 unsafe 요청·잘못된 의미 입력을 Worker로 전달할 수 있음 |
| Python | imported 여부, source part, coverage만 확인 | `importRenderMode` 미검사 |
| API apply | baseVersion과 slide 존재만 다시 확인한 뒤 저장 | pending proposal 생성 후 slide 안전 상태가 바뀌는 경우를 별도 분류하지 않음 |

따라서 PR-M0에서 Web 사전 차단, API 요청 gate, Python gate, API apply 재검증을 모두 둔다. Web만 막는 것은 보안·정합성 경계가 아니다.

### 1.3 최신 import 및 rich text 계약

- `Slide.importRenderMode`는 `editable | hybrid | snapshot`이다.
- `Slide.ooxmlMotionCapabilities.importedMainSequenceCoverage`는 imported animation main sequence를 안전하게 덮어쓸 수 있는지 나타낸다.
- TemplateBlueprint `elementSources`는 `elementId`, `slidePart`, `shapeId`, `writable`, `ooxmlEditCapabilities`, fallback provenance를 가진다.
- rich text는 `letterSpacing`, `autoFit`, `fontScale`, `lineSpaceReduction`을 보존한다.
- `packages/editor-core/src/text/richTextOperations.ts`에는 `normalizeRichTextProps()`와 `getRichTextSemanticText()`가 있고, Web renderer는 shrink-text의 `fontScale`과 줄 간격 감소를 실제 layout에 반영한다.

따라서 raw `fontSize`만 비교하면 auto-fit된 큰 글자를 실제보다 높은 위계로 오판할 수 있다. Motion Extractor는 role을 우선하고, role이 없거나 동률일 때만 normalized rich text의 **effective rendered typography**를 사용한다.

### 1.4 Deck animation 계약과 실제 export 지원 범위가 다르다

`packages/shared/src/deck/animation.schema.ts`는 다음 7종을 허용한다.

`appear`, `disappear`, `fade-in`, `fade-out`, `zoom-in`, `zoom-out`, `rotate`

그러나 `services/python-worker/app/ai/pptx_motion.py`의 안전 serializer allowlist는 다음 3종이다.

`appear`, `fade-in`, `zoom-in`

Motion Planner는 3종만 생성한다. 나머지 4종은 기존 사용자가 이미 만든 값을 읽고 보존할 수는 있지만, 추천·compiler가 새로 만들거나 다른 효과에서 변환하지 않는다.

### 1.5 preview는 현재 animation을 보여 주지 않는다

`DesignProposalPreviewModal`과 compare card는 정적 Before/After canvas를 렌더한다. animation-only patch는 두 정적 그림이 같아 보인다. 반면 presenter/rehearsal은 `packages/editor-core/src/playback/animationTimeline.ts`의 `createAnimationTimeline()`을 사용하고 reduced motion도 처리한다.

PR-M4에서는 별도 timeline 의미를 만들지 않고 이 canonical timeline을 proposal preview에서도 사용한다.

---

## 2. 확정된 설계 결정

| # | 결정 | 근거 |
| --- | --- | --- |
| D1 | `recommend-animation`의 첫 단계는 항상 **Motion Eligibility Gate**다 | unsafe slide를 LLM 또는 기존 heuristic에 보내지 않기 위해 |
| D2 | 결과는 `applicable` / `not-needed` / `refused-unsafe`의 3분기다 | 안전 거부와 추천할 대상이 없음은 UX·관측에서 구분해야 함 |
| D3 | LLM은 strict Structured Output의 **Narrative Motion Plan**만 만든다 | raw patch, ID 생성, 임의 duration을 금지해 결과를 결정론화 |
| D4 | 실제 patch는 **Motion Library + compiler**가 생성한다 | serializer 지원 범위, timing budget, ID 규칙을 코드로 강제 |
| D5 | 생성 effect는 `appear`, `fade-in`, `zoom-in` 3종뿐이다 | 현재 PPTX serializer의 안전 지원 범위 |
| D6 | 기존 animations/actions는 merge하고 ID·참조를 보존한다 | `play-animation` action의 dangling reference와 사용자 작업 손실 방지 |
| D7 | 명시적 교체 요청이 아니면 delete operation은 0개다 | “추천”이 기존 motion을 파괴하지 않도록 함 |
| D8 | v1은 공개 Web API/Deck schema를 바꾸지 않는다 | `designAgentContextSchema`에 전체 `slideSchema`가 이미 존재 |
| D9 | TemplateBlueprint가 필요하면 전체 sidecar가 아니라 API가 정제한 최소 internal context만 Worker에 보낸다 | privacy와 architecture boundary 유지 |
| D10 | preview는 정적 diff가 아니라 candidate slide의 실제 timeline을 재생한다 | 사용자가 적용 전 click 수와 흐름을 판단할 수 있어야 함 |
| D11 | speaker notes는 최대 4,000자의 bounded transient signal이다 | 문맥은 활용하되 과도한 prompt와 영구 저장을 방지 |
| D12 | model은 snapshot ID로 고정하고 변경 PR마다 golden eval을 다시 돌린다 | alias 업데이트에 의한 동작 drift 방지 |

### 2.1 전체 파이프라인

```text
recommend-animation request
  -> Motion Eligibility Gate
  -> Motion Extractor
  -> Narrative Motion Planner (strict output)
       \-> deterministic fallback planner (LLM unavailable/invalid)
  -> Motion Library + deterministic compiler
  -> existing timeline merge
  -> safety validation + applyDeckPatch dry-run
  -> proposal
  -> actual motion preview
  -> apply-time eligibility + patch validation
```

`refused-unsafe`는 어느 단계에서도 기존 free-form animation prompt로 fallback하지 않는다. `not-needed`와 compile/merge 실패도 `operations=[]`이며, 사용자가 수정할 수 있는 이유만 응답한다.

---

## 3. Motion Eligibility Gate

### 3.1 공통 결과 타입

TypeScript와 Python은 같은 fixture를 통과하는 동형 정책을 가진다.

```ts
type MotionEligibility =
  | {
      outcome: "applicable";
      allowedTargetElementIds: string[];
      source: "authored" | "imported-editable" | "imported-hybrid";
    }
  | { outcome: "not-needed"; reasonCode: MotionReasonCode }
  | { outcome: "refused-unsafe"; reasonCode: MotionReasonCode };
```

reason은 원문 데이터를 담지 않는 enum code다.

```text
SPECIAL_SLIDE
SNAPSHOT_SLIDE
IMPORT_RENDER_MODE_UNKNOWN
IMPORT_SOURCE_MISSING
IMPORT_COVERAGE_UNSAFE
NO_STABLE_TARGETS
NO_VISIBLE_CONTENT_TARGETS
```

### 3.2 eligibility matrix

| 슬라이드 | 필수 조건 | 결과 |
| --- | --- | --- |
| 일반 `content` | visible content target 1개 이상 | `applicable` |
| imported `editable` | `ooxmlSourceSlidePart` 존재, render mode 명시, coverage가 `absent` 또는 `complete`, target source/capability 검증 | `applicable` |
| imported `hybrid` | 위 slide-level 조건 + 현재 Web에서 실제 렌더되는 요소 + authoritative writable shape에 1:1 대응되는 stable target만 사용 | stable target에 한해 `applicable` |
| imported `snapshot` | 조건 없음 | 항상 `refused-unsafe` |
| imported + coverage `partial`/`unknown`/누락 | 조건 없음 | 항상 `refused-unsafe` |
| `activity` / `activity-results` | 조건 없음 | 항상 `refused-unsafe` |
| visible target 없음 | 장식·footer만 존재 | `not-needed` |

일반 content에는 `importRenderMode`가 없어도 된다. 그러나 deck가 import이거나 slide/element에 imported provenance가 있는데 render mode가 없으면 legacy imported slide로 보고 `IMPORT_RENDER_MODE_UNKNOWN`으로 거부한다.

### 3.3 stable target 정의

authored slide는 visible하고 잠기지 않은 일반 content 요소를 시작점으로 한다. imported slide는 다음 조건을 모두 만족해야 한다.

1. candidate element가 실제 render tree에 포함된다. snapshot은 render tree 여부와 무관하게 slide-level에서 이미 거부한다.
2. TemplateBlueprint source가 같은 `elementId`에 대해 정확히 1개이며 `writable === true`다.
3. source의 `slidePart`가 slide의 `ooxmlSourceSlidePart`와 일치하고, 비어 있지 않은 `shapeId`가 있다.
4. source가 rasterized fallback이거나 unresolved/ambiguous/grouped target이면 제외한다.
5. `ooxmlEditCapabilities.frame === true` 또는 motion target 전용 검증기가 1:1 shape resolution을 확인한다.
6. `background`, `decoration`, `footer`, invisible, `activity-qr`은 제외한다.

Deck element의 `ooxmlEditCapabilities`만으로 1:1 OOXML shape resolution을 완전히 증명하기 어렵다. 따라서 v1의 imported hybrid 범위는 의도적으로 보수적으로 잡는다.

### 3.4 공개 계약을 늘리지 않는 internal import context

Web의 `CreateDesignAgentMessageRequest`에는 전체 slide가 이미 있으므로 공개 API와 Deck schema는 그대로 둔다. API는 서버가 가진 TemplateBlueprint를 읽을 수 있을 때 다음 최소값만 산출해 Python 내부 요청에 추가한다.

```ts
type MotionImportContext = {
  renderMode: "editable" | "hybrid" | "snapshot";
  sourceSlidePartPresent: boolean;
  importedMainSequenceCoverage: "absent" | "complete" | "partial" | "unknown";
  stableTargetElementIds: string[];
};
```

- 허용: render mode, source 존재 boolean, coverage enum, stable `elementId` allowlist.
- 금지: 전체 TemplateBlueprint, `notesXml`, speaker notes 사본, shape XML, preview base64, raw import warning text.
- quality provenance가 꼭 필요해지면 `hasRasterFallback`, `hasAmbiguousTargets` 같은 boolean code만 추가한다.
- internal field가 없으면 editable/hybrid imported recommendation을 추측하지 않고 `refused-unsafe`로 닫는다.

이는 API→Python 내부 request의 additive optional 필드이며 공개 request/response나 Deck 저장 계약 변경은 아니다. 구현 시 internal Pydantic/TypeScript 타입과 parity test는 함께 바꾼다.

### 3.5 네 계층 검증

1. **Web 사전 gate**
   - `EditorRightPanel`의 `designEditingEnabled`를 `!isSpecialSlide`가 아니라 공통 motion eligibility 결과와 결합한다.
   - snapshot에서 AI panel 전체를 숨길 필요는 없다. 일반 질문은 가능하지만 `recommend-animation` quick action과 animation mutation submit을 disable하고 사유를 표시한다.
   - `canEditSlideCanvas()`와 motion policy가 서로 다른 판정을 내지 않도록 shared pure policy를 사용한다.

2. **API create gate**
   - `intentPreset === "recommend-animation"`이면 current deck의 실제 slide로 eligibility를 다시 계산한다.
   - client가 보낸 slide snapshot을 신뢰하지 않는다. API가 `slideId`로 찾은 authoritative current slide, deck canvas/theme를 사용해 Worker용 context를 다시 만들고, selected ID는 current slide element와 교집합만 남긴다.
   - client context의 `importRenderMode`, coverage, elements, animations/actions, speaker notes를 그대로 전달하지 않는다.
   - `refused-unsafe`면 Python을 호출하지 않고 proposal 없이 안전 메시지를 반환한다.

3. **Python gate**
   - 직접 Worker 호출과 API 구현 실수를 방어한다.
   - `_build_animation_recommendation()` 앞에서 Python mirror gate를 실행한다.
   - allowed target ID가 하나라도 벗어나면 전체 plan을 거부한다.

4. **API apply gate**
   - pending proposal의 operation 중 animation add/update/delete가 있으면 최신 slide에 다시 gate를 실행한다.
   - baseVersion 검증과 별개로 안전 판정을 명시한다. snapshot/coverage/import mode가 unsafe면 proposal을 `stale` 또는 별도 rejected status로 전환하고 append하지 않는다.
   - 최종 candidate deck에 `applyDeckPatch()`와 timeline validator를 다시 실행한다.

---

## 4. Motion Extractor와 Narrative Motion Plan

### 4.1 신호 우선순위

Extractor는 아래 순서대로 신호를 합성한다. 상위 신호가 있으면 하위 신호가 이를 뒤집지 못한다.

1. `semanticCues` 중 `reviewStatus === "approved" && freshness === "current"`
2. `aiNotes`와 `aiNotes.compositionPlan`
3. bounded `speakerNotes`
4. element `role`, group 관계, geometry, z-order

`suggested`, `excluded`, `stale` semantic cue는 motion target 근거로 사용하지 않는다. approved/current cue의 `targetElementIds`도 eligibility allowlist와 교집합만 남긴다.

### 4.2 장식과 footer 제외

다음 대상은 LLM 입력의 target 목록과 compiler 출력에서 제거한다.

- role이 `background`, `decoration`, `footer`
- invisible 또는 opacity 0
- slide 전체를 덮는 배경성 shape
- 작은 반복 footer/page-number/date 요소
- content 의미를 갖지 않는 connector/line
- hybrid에서 stable target allowlist에 없는 요소

process의 화살표나 connector는 구조 추론에만 쓸 수 있고 animation target이 될 수 없다. comparison의 divider도 동일하다.

### 4.3 effective rendered typography

위계 판정 순서는 다음과 같다.

1. 명시적 role: `title > subtitle > highlight > body > caption`
2. approved cue의 importance와 composition focal point
3. normalized rich text의 effective rendered typography
4. geometry와 z-order

effective font signal은 raw `fontSize`가 아니다.

```text
effectiveFontSize = runFontSize * resolvedFontScale
effectiveLetterSpacing = letterSpacing * resolvedFontScale
effectiveLineHeight = baseLineHeight * resolvedFontScale * (1 - lineSpaceReduction)
```

- `autoFit !== "shrink-text"`이면 `resolvedFontScale = 1`이다.
- `autoFit === "shrink-text"`이면 validated `fontScale`을 사용한다.
- paragraph/run별 값은 `normalizeRichTextProps()`를 먼저 통과한다.
- 여러 run이 있으면 최대값 하나가 아니라 글자 수 가중 median과 dominant run을 사용한다.
- role이 있으면 typography는 동률 해소에만 사용한다.

PR-M1에서 Web renderer에만 있는 계산을 복사하지 말고 Canvas/Konva 의존성이 없는 pure resolver를 `packages/editor-core/src/text/effectiveTypography.ts`로 추출한다. API는 이 resolver로 정제된 숫자 신호를 만들 수 있고, Python fallback은 같은 golden fixture로 parity를 검증한다.

### 4.4 speaker notes privacy와 bound

`MOTION_SPEAKER_NOTES_MAX_CHARS = 4_000`으로 고정한다.

- approved cue keyword, focal element text, slide keyword와 겹치는 문장을 먼저 선택한다.
- 남은 budget은 원래 문장 순서로 채운다.
- 4,000자를 넘으면 문장 경계에서 자르고 `notesTruncated=true`만 메모리 내 metric에 둔다.
- prompt에는 bounded text를 넣을 수 있지만 결과 schema에는 notes/excerpt/reasonQuote 필드를 두지 않는다.
- raw/bounded notes를 logger field, exception, telemetry span, Job payload/result, proposal `summary`/`warnings`/`interpretedIntent`, assistant message, request message의 motion 파생 `contextJson`에 복사하지 않는다.
- 현재 `DesignAgentService.createMessage()`가 전체 `input.context`를 `contextJson`에 저장하므로, motion request는 저장용 context를 sanitize해 `slide.speakerNotes`를 제거하거나 길이·내용이 없는 `{ speakerNotesPresent: boolean }`로 바꾼다. 이 동작의 회귀 테스트를 PR-M1에 넣는다.
- motion planner는 v1에서 synchronous in-memory 경로만 사용한다. 추후 Job 전환 시 raw notes를 enqueue하지 않는 별도 설계가 먼저 필요하다.

로그에는 다음 집계만 허용한다.

```text
slideType, eligibilitySource, cueCount, targetCount,
notesPresent, notesTruncated, plannerOutcome, fallbackUsed,
beatCount, clickCount, operationCount, reasonCode, latencyMs
```

### 4.5 ExtractedMotionContext

```python
class MotionTarget(BaseModel):
    element_id: str
    semantic_role: Literal[
        "title", "subtitle", "body", "focal", "media",
        "data", "label", "supporting", "other"
    ]
    group_id: str | None
    reading_order: int
    emphasis: Literal["primary", "secondary", "supporting"]
    geometry_bucket: Literal["top", "left", "center", "right", "bottom"]

class ExtractedMotionContext(BaseModel):
    slide_type: Literal[
        "cover", "title", "problem", "solution", "feature-grid", "process",
        "architecture", "data", "chart", "comparison", "quote", "summary"
    ]
    narrative_intent: Literal[
        "orient", "sequence", "contrast", "explain-data", "emphasize", "summarize"
    ]
    targets: list[MotionTarget]
    approved_cue_count: int
    notes_present: bool
    notes_truncated: bool
```

text 원문을 장기 객체에 넣지 않는다. LLM prompt builder만 bounded ephemeral text와 sanitized target labels를 결합하고 호출 직후 참조를 버린다.

### 4.6 strict Narrative Motion Plan

LLM Structured Output은 다음 의미 계획만 허용한다.

```python
class NarrativeBeat(BaseModel):
    beat_id: str
    purpose: Literal["orient", "reveal", "connect", "contrast", "emphasize", "conclude"]
    trigger: Literal["entry", "click"]
    target_element_ids: list[str]
    relation: Literal["together", "sequence"]

class NarrativeMotionPlan(BaseModel):
    schema_version: Literal[1]
    pattern: Literal[
        "hero-then-support", "stepwise-process", "paired-comparison",
        "evidence-then-insight", "cluster-reveal", "summary-recap"
    ]
    beats: list[NarrativeBeat]
```

금지 필드: `operations`, `patch`, `animationId`, `effect`, `type`, `durationMs`, `delayMs`, `easing`, 좌표, arbitrary CSS/OOXML.

server-side validation 한도:

| 항목 | 한도 |
| --- | ---: |
| beat | 최대 6 |
| click beat | 최대 4 |
| 전체 unique target | 최대 8 |
| beat당 target | 최대 4 |
| entry beat | 최대 1 |
| entry target | 최대 2 |
| compiler 후 자동 재생 | 최대 900ms |
| compiler 후 click step 1개의 재생 | 최대 1,200ms |
| 전체 예상 motion time | 최대 6,000ms |

모든 target ID는 extractor가 제공한 allowlist에 있어야 한다. 중복 ID, 빈 beat, 장식 target, cap 초과, 추가 JSON key가 있으면 Structured Output 전체를 폐기하고 deterministic fallback planner를 사용한다.

### 4.7 model pinning과 deterministic fallback

- `OPENAI_MOTION_PLANNER_MODEL`을 새 환경 계약으로 추가하고 초기값은 snapshot ID `gpt-4.1-mini-2025-04-14`로 고정한다.
- production에서 alias(`gpt-4.1-mini`, `latest`)는 거부한다.
- snapshot 변경은 golden eval 결과와 사람 평가 비교를 포함한 별도 PR로만 허용한다.
- temperature/seed 지원 여부에 결과 안정성을 의존하지 않는다. compiler와 fallback은 완전히 결정론적이어야 한다.
- timeout, provider error, schema invalid, cap 초과면 LLM 재시도는 1회 이하로 제한하고 deterministic fallback plan을 사용한다.
- fallback도 slide type, role, approved cue, reading order만 사용하며 기존 y/x heuristic으로 우회하지 않는다.

---

## 5. 결정론적 Motion Library와 compiler

### 5.1 slide type별 기본 narrative pattern

| slide type | 기본 pattern | beat 원칙 |
| --- | --- | --- |
| cover | `hero-then-support` | title을 entry, subtitle/identity는 필요할 때만 함께 |
| title | `hero-then-support` | section title 1 beat, supporting copy 최소화 |
| problem | `hero-then-support` | 문제 statement → 증거/영향 |
| solution | `hero-then-support` | 해법 statement → 핵심 구성 |
| feature-grid | `cluster-reveal` | heading entry → row/cluster별 reveal, 카드마다 click 금지 |
| process | `stepwise-process` | title entry → 단계 순서대로 최대 4 click, connector target 제외 |
| architecture | `cluster-reveal` | overview → layer/cluster, 연결선 target 제외 |
| data | `evidence-then-insight` | chart/table context → 핵심 수치/insight 강조 |
| chart | `evidence-then-insight` | chart 전체 → annotation/insight; series별 animation은 v1 제외 |
| comparison | `paired-comparison` | 공통 heading → 좌우 pair를 같은 beat → 결론 |
| quote | `hero-then-support` | quote entry → attribution 함께 또는 후속 1 beat |
| summary | `summary-recap` | title entry → 2~4개 recap cluster |

`slide_redesign/slide_extractor.py`의 12종 분류 vocabulary를 공유하되, motion extractor는 redesign의 raw font-size ordering을 그대로 호출하지 않는다. 공통 enum/fixture만 공유하고 의미 추출 규칙은 위 rich-text fidelity를 반영한다.

### 5.2 effect 선택은 compiler가 한다

| target | effect | duration | easing |
| --- | --- | ---: | --- |
| title/subtitle/quote/일반 text | `fade-in` | 400ms | `ease-out` |
| body/label/step/supporting | `appear` | 300ms | `ease-out` |
| focal image/chart/table/media | `zoom-in` | 450ms | `ease-out` |

- `relation === "together"`: 첫 target은 beat root, 나머지는 `with-previous`.
- `relation === "sequence"`: 첫 target은 root, 나머지는 `after-previous`.
- `trigger === "entry"`: root `on-slide-enter`.
- `trigger === "click"`: root `on-click`.
- delay는 기본 0이며, 동일 beat의 sequence에서만 compiler가 0~50ms 범위의 고정 stagger를 쓸 수 있다.
- compiler는 cap을 넘는 plan을 임의로 잘라 의미를 바꾸지 않는다. deterministic fallback으로 다시 계획하거나 `operations=[]`로 종료한다.
- v1은 element 단위다. rich-text paragraph/bullet 내부를 분해해 animation target으로 만들지 않는다.

### 5.3 ID 생성

새 animation ID는 입력 `(deckId, slideId, elementId, beatIndex, compilerVersion)`의 stable hash에서 충돌 없는 suffix를 만든다. 같은 baseVersion과 같은 plan을 두 번 compile하면 byte-identical operations를 반환해야 한다.

기존 target에 animation이 있으면 새 ID를 만들기 전에 merge policy를 적용한다. random UUID, model이 제안한 ID, 현재 시각 기반 ID는 금지한다.

---

## 6. 기존 animations/actions 병합과 안전 검증

### 6.1 기본 원칙

1. 기존 `animationId`를 보존한다.
2. `Slide.actions[].effect.kind === "play-animation"`의 `animationId` 참조를 보존한다.
3. 사용자 기존 effect가 compiler 3종 밖이어도 그대로 둔다.
4. 추천 대상이 이미 animation을 가지면 안전한 field update만 고려한다.
5. 명시적 “기존 애니메이션을 교체해줘/초기화하고 다시” 요청이 아니면 delete는 절대 생성하지 않는다.
6. 안전한 merge를 증명할 수 없으면 전체 proposal을 `operations=[]`로 만든다. 부분 적용으로 순서를 망가뜨리지 않는다.

### 6.2 operation 정책

| 상황 | 허용 동작 |
| --- | --- |
| target에 기존 animation 없음 | stable ID로 `add_animation` |
| target에 animation 1개, action 참조 없음 | 같은 `animationId`의 `update_animation`; 변경 필드는 compiler가 관리하는 type/startMode/duration/delay/easing/order만 |
| target에 animation 1개, `play-animation` action 참조 있음 | ID를 유지하는 `update_animation`만 가능. click root 의미가 action과 충돌하면 기존 값을 보존하거나 전체 거부 |
| target에 animation 여러 개 | 기존 sequence를 그대로 두고 새 target만 추가할 수 있을 때만 merge. 재정렬이 필요하면 전체 거부 |
| animation ID 중복·dangling action·orphan timeline | 전체 거부 |
| 명시적 replace 요청 | 참조 없는 animation만 delete 가능. 참조된 animation은 같은 ID update가 우선이며 action 삭제/재작성은 v1 제외 |

`recommend-animation` intent preset은 기본적으로 add/update만 허용한다. delete를 허용하려면 request parser가 명시적 replace 의도를 별도 boolean으로 증명해야 하며, free-form 추정만으로 켜지 않는다.

### 6.3 merge 순서

1. current slide의 animation/action graph를 읽는다.
2. plan target과 기존 target을 매칭한다.
3. 보존해야 할 root/click order를 고정한다.
4. update candidates를 같은 ID로 만든다.
5. 새 animation만 기존 order 사이가 아닌 안전한 tail/root 경계에 추가한다.
6. 모든 order를 unique positive integer로 canonicalize한다. 기존 relative order는 보존한다.
7. candidate slide를 만든 뒤 action reference, target, timeline, cap을 검증한다.
8. 하나라도 실패하면 operations를 일부 반환하지 않고 빈 배열로 바꾼다.

### 6.4 validator

TypeScript validator는 최종 candidate slide에 대해 다음을 검사한다.

- `deckPatchOperationSchema`와 `applyDeckPatch()` 성공
- 모든 animation target element 존재
- `animationId` unique
- 모든 `play-animation` action reference 존재
- 기존 animation ID와 기존 action reference 보존
- 삭제는 explicit replace에서만 존재
- 새/수정 effect가 3종 allowlist
- eligibility allowed target의 부분집합
- `createAnimationTimeline()` diagnostics 0
- beat/click/target/time cap 만족
- 같은 입력의 compiler output deep-equal

Python은 동일한 preconditions를 먼저 검사하되, proposal 저장 전 최종 권위 검증은 API의 shared Deck/apply/timeline 코드가 수행한다.

---

## 7. PR-M0 — motion-eligibility-and-gating

브랜치: `feature/motion-eligibility-gate`
선행 PR: 없음
예상: 2일

### 7.1 목표

planner 품질과 무관하게 unsafe slide에서 추천·저장·적용이 일어나지 않게 한다. 현재 snapshot canvas와 AI panel 사이의 불일치를 먼저 닫는다.

### 7.2 수정 예상 파일

```text
packages/editor-core/src/policies/motionEligibility.ts                 # 신규
packages/editor-core/src/policies/motionEligibility.test.ts            # 신규
packages/editor-core/src/index.ts
apps/web/src/features/editor/shell/utils/motionEditingPolicy.ts
apps/web/src/features/editor/shell/utils/slideEditingPolicy.ts
apps/web/src/features/editor/shell/components/EditorRightPanel.tsx
apps/web/src/features/editor/shell/components/EditorRightPanel.test.tsx
apps/web/src/features/editor/design-agent/AiChatPanel.tsx
apps/api/src/design-agent/design-agent.service.ts
apps/api/src/design-agent/design-agent.service.spec.ts
apps/api/src/design-agent/design-agent-python.client.ts
services/python-worker/app/ai/motion_planner/__init__.py               # 신규
services/python-worker/app/ai/motion_planner/eligibility.py            # 신규
services/python-worker/app/ai/design_agent.py
services/python-worker/tests/test_motion_eligibility.py                 # 신규
tests/fixtures/motion-eligibility.json                                  # 신규, TS/Python 공용
docs/contracts.md                                                       # 동작 규칙 명시만
```

TemplateBlueprint 조회가 이미 API service 경계에 없다면 이 PR에서는 imported editable/hybrid를 fail-closed로 두고, 최소 import context builder를 같은 PR에 추가하거나 PR-M1의 선행 commit으로 분리한다. 안전 gate를 생략한 채 imported를 허용하지 않는다.

### 7.3 계약 변경 여부

- Deck schema: 없음.
- 공개 API request/response: 없음.
- 내부 API→Python request: optional `motionImportContext` 추가 가능.
- `docs/contracts.md`: animation recommendation eligibility 표와 refusal semantics를 추가.

### 7.4 Acceptance criteria

- snapshot content에서 AI의 `recommend-animation` action은 disable되고 정확한 사유가 보인다.
- client가 우회 호출해도 API는 Python 호출 전에 `refused-unsafe`로 종료한다.
- client가 snapshot의 `importRenderMode`/coverage를 지우거나 elements/animations를 변조해도 API는 authoritative current slide로 Worker context를 재구성한다.
- Python 직접 호출에서도 snapshot은 operations 0개다.
- pending proposal 생성 후 최신 slide가 snapshot/unsafe coverage가 되면 apply가 거부된다.
- imported partial/unknown/누락 coverage는 모든 계층에서 거부된다.
- activity/activity-results는 모든 계층에서 거부된다.
- imported editable은 source/capability 검증이 완료된 target만 허용된다.
- imported hybrid는 stable allowlist 외 target이 0개다.
- Web/TS/Python이 공용 fixture의 같은 reason code를 반환한다.
- 기존 일반 authored content 추천은 계속 동작한다.

### 7.5 검증 명령

```bash
pnpm --filter @orbit/editor-core test -- motionEligibility
pnpm --filter @orbit/web test -- EditorRightPanel motionEditingPolicy
pnpm --filter @orbit/api test -- design-agent.service
cd services/python-worker
uv run pytest tests/test_motion_eligibility.py tests/test_design_agent.py -q
uv run ruff check app/ai/motion_planner tests/test_motion_eligibility.py
uv run mypy app
```

### 7.6 rollout / rollback

- gate는 즉시 100% 적용하고 flag로 끄지 않는다.
- imported false-negative가 발생하면 stable target derivation을 좁은 수정으로 고친다. 기존 unsafe heuristic으로 되돌리지 않는다.
- DB migration이 없으므로 코드 롤백만 필요하지만 API apply gate는 유지한다.

---

## 8. PR-M1 — motion-extractor-and-plan

브랜치: `feature/motion-extractor-plan`
선행 PR: PR-M0
예상: 2일

### 8.1 목표

slide를 target 목록이 아니라 발표 구조로 해석하고, LLM이 patch 대신 제한된 Narrative Motion Plan만 반환하게 한다.

### 8.2 수정 예상 파일

```text
packages/editor-core/src/text/effectiveTypography.ts                   # 신규
packages/editor-core/src/text/effectiveTypography.test.ts              # 신규
packages/editor-core/src/text/richTextOperations.ts
packages/editor-core/src/index.ts
apps/api/src/design-agent/motion-context.builder.ts                     # 신규
apps/api/src/design-agent/motion-context.builder.spec.ts                # 신규
apps/api/src/design-agent/design-agent.service.ts                       # stored context sanitize
apps/api/src/design-agent/design-agent.service.spec.ts
services/python-worker/app/ai/motion_planner/models.py                  # 신규
services/python-worker/app/ai/motion_planner/extractor.py               # 신규
services/python-worker/app/ai/motion_planner/prompt.py                  # 신규
services/python-worker/app/ai/motion_planner/llm.py                     # 신규
services/python-worker/app/config.py
packages/config/src/index.ts
apps/api/src/config/env.schema.spec.ts
.env.example
docs/conventions/environment.md
services/python-worker/tests/test_motion_extractor.py                   # 신규
services/python-worker/tests/test_motion_planner_llm.py                 # 신규
tests/fixtures/motion-extractor/                                       # 신규
```

### 8.3 계약 변경 여부

- 공개 API/Deck/proposal schema: 없음.
- 환경 계약: `OPENAI_MOTION_PLANNER_MODEL`과 `AI_MOTION_PLANNER_MODE=off|shadow|on` 추가. production model은 dated snapshot만 허용.
- 내부 request: sanitized effective typography와 optional `motionImportContext`를 더할 수 있다.
- proposal metadata에는 Narrative Plan이나 notes excerpt를 저장하지 않는다.

### 8.4 Acceptance criteria

- approved+current cue가 suggested/stale cue보다 우선한다.
- `aiNotes.compositionPlan.primaryFocalElementId`가 allowlist 안일 때 focal signal이 된다.
- speaker notes는 4,000자 이하만 prompt로 전달되고 저장·로그·Job/proposal JSON에는 원문이 없다.
- `contextJson` persistence test에 sentinel note를 넣었을 때 DB entity와 serialized logs에 sentinel이 없다.
- role이 있는 title은 auto-fit 전 raw fontSize가 작아도 title로 유지된다.
- `fontScale`과 `lineSpaceReduction`이 다른 두 rich text 요소의 effective hierarchy가 Web layout과 일치한다.
- LLM output에 unknown key, raw operation, duration, 비-allowlist ID, cap 초과가 있으면 reject된다.
- LLM 실패 시 동일 입력은 동일 fallback Narrative Plan을 만든다.

### 8.5 검증 명령

```bash
pnpm --filter @orbit/editor-core test -- effectiveTypography
pnpm --filter @orbit/api test -- motion-context design-agent.service
pnpm --filter @orbit/config test
node infra/scripts/check-env.mjs
cd services/python-worker
uv run pytest tests/test_motion_extractor.py tests/test_motion_planner_llm.py -q
uv run ruff check app/ai/motion_planner tests/test_motion_extractor.py tests/test_motion_planner_llm.py
uv run mypy app
```

### 8.6 rollout / rollback

- `AI_MOTION_PLANNER_MODE=off|shadow|on` 중 PR-M1 배포값은 `shadow`다. 이 enum도 환경 계약에 추가한다.
- shadow는 proposal을 바꾸지 않고 기존 heuristic 결과와 plan의 count/reason code만 비교한다. notes와 element text는 telemetry에 남기지 않는다.
- model 오류가 늘면 mode를 `off`로 바꾼다. PR-M0 gate와 notes sanitization은 유지한다.

---

## 9. PR-M2 — semantic-motion-planner/compiler

브랜치: `feature/semantic-motion-compiler`
선행 PR: PR-M1
예상: 2일

### 9.1 목표

Narrative Motion Plan을 serializer-safe한 animation operations로 결정론적으로 compile하고, 12 slide type에 맞는 presentation beat를 제공한다.

### 9.2 수정 예상 파일

```text
services/python-worker/app/ai/motion_planner/library.py                 # 신규
services/python-worker/app/ai/motion_planner/fallback.py                # 신규
services/python-worker/app/ai/motion_planner/compiler.py                # 신규
services/python-worker/app/ai/motion_planner/service.py                 # 신규
services/python-worker/app/ai/design_agent.py
services/python-worker/tests/test_motion_library.py                     # 신규
services/python-worker/tests/test_motion_compiler.py                    # 신규
services/python-worker/tests/test_design_agent.py
tests/fixtures/motion-golden/                                           # 12종 시작
```

### 9.3 계약 변경 여부

- 없음. compiler output은 기존 `add_animation`/`update_animation` operation schema를 사용한다.
- capability version도 올리지 않는다. 기존 operation 종류 안에서만 동작한다.

### 9.4 Acceptance criteria

- compiler가 새로 만드는 type은 `appear`, `fade-in`, `zoom-in`뿐이다.
- 같은 slide/baseVersion/plan/compilerVersion은 같은 operations를 만든다.
- LLM output에는 없는 duration/startMode/easing/animationId가 library 상수로만 생성된다.
- process는 connector를 제외하고 단계 순서를 유지한다.
- comparison은 좌우 대응 항목을 같은 beat로 묶는다.
- data/chart는 증거 전체와 insight를 분리하고 series 내부 animation을 만들지 않는다.
- decoration/footer/background는 golden 12종 모두 target 0개다.
- entry 900ms, click step 1,200ms, 전체 6초 cap을 넘지 않는다.
- LLM 장애 fixture에서 deterministic fallback output이 snapshot과 일치한다.

### 9.5 검증 명령

```bash
cd services/python-worker
uv run pytest \
  tests/test_motion_library.py \
  tests/test_motion_compiler.py \
  tests/test_design_agent.py -q
uv run ruff check app/ai/motion_planner tests/test_motion_library.py tests/test_motion_compiler.py
uv run mypy app
```

### 9.6 rollout / rollback

- `shadow`에서 authored content golden pass와 production aggregate를 확인한다.
- 첫 `on`은 allowlisted internal/demo project의 authored content에만 적용한다.
- rollback은 planner routing을 기존 heuristic으로 돌리되 PR-M0 gate 뒤에서만 실행한다. compiler가 만든 pending proposal은 기존 schema이므로 migration/cleanup이 필요 없다.

---

## 10. PR-M3 — motion-merge-and-safety

브랜치: `feature/motion-merge-safety`
선행 PR: PR-M2
예상: 2일

### 10.1 목표

기존 animations/actions를 잃지 않고 새 beat를 병합하며, 저장 전과 적용 시점에 candidate timeline을 검증한다.

### 10.2 수정 예상 파일

```text
packages/editor-core/src/policies/motionProposalValidation.ts          # 신규
packages/editor-core/src/policies/motionProposalValidation.test.ts     # 신규
packages/editor-core/src/playback/animationTimeline.ts
packages/editor-core/src/playback/animationTimeline.test.ts
packages/editor-core/src/index.ts
apps/api/src/design-agent/design-agent.service.ts
apps/api/src/design-agent/design-agent.service.spec.ts
services/python-worker/app/ai/motion_planner/merge.py                    # 신규
services/python-worker/app/ai/motion_planner/validation.py             # 신규
services/python-worker/app/ai/design_agent.py
services/python-worker/tests/test_motion_merge.py                       # 신규
services/python-worker/tests/test_design_agent.py
packages/shared/src/deck/deck.schema.test.ts                            # action ref 회귀
```

### 10.3 계약 변경 여부

- 없음. 기존 animation/action/patch schema의 불변식을 강화한다.
- 새로운 delete semantics가 필요하지 않다. explicit replace도 기존 `delete_animation`을 제한적으로 사용한다.

### 10.4 Acceptance criteria

- 기존 animation ID와 action의 `play-animation` reference가 proposal 전후 동일하다.
- action이 참조하는 animation을 delete하거나 새 ID로 대체하는 operation은 거부된다.
- 명시적 replace가 아닌 모든 recommendation fixture의 delete count는 0이다.
- duplicate ID, missing target, dangling action, orphan `after-previous`, cap 초과는 operations 0개다.
- 안전한 update는 기존 ID를 보존한다.
- 기존 사용자 animation의 7종 type은 변경 없이 보존되지만 새/수정 type은 3종이다.
- proposal 생성 dry-run과 apply-time latest deck validation이 모두 통과해야 append된다.
- apply 후 일반 deck undo/redo가 animation/action을 정확히 되돌리고 다시 적용한다.

### 10.5 검증 명령

```bash
pnpm --filter @orbit/shared test -- deck.schema
pnpm --filter @orbit/editor-core test -- animationTimeline motionProposalValidation
pnpm --filter @orbit/api test -- design-agent.service
cd services/python-worker
uv run pytest tests/test_motion_merge.py tests/test_design_agent.py -q
uv run ruff check app/ai/motion_planner tests/test_motion_merge.py
uv run mypy app
```

### 10.6 rollout / rollback

- merge validator는 planner mode와 무관하게 AI animation proposal에 적용한다.
- false-positive가 생겨도 unsafe validation을 끄지 않고 proposal을 `operations=[]`로 fail-closed한다.
- planner routing만 `off`로 돌릴 수 있다. apply-time action/ID validation은 유지한다.

---

## 11. PR-M4 — motion-proposal-preview

브랜치: `feature/motion-proposal-preview`
선행 PR: PR-M3
예상: 2일

### 11.1 목표

animation-only proposal을 정적 Before/After가 아닌 실제 beat 흐름으로 검토할 수 있게 한다.

### 11.2 UX

preview 상단에 다음 요약을 표시한다.

```text
자동 진입 1 · 클릭 3 · 대상 6개 · 예상 3.4초
```

조작:

- play / pause
- 처음으로
- 이전 beat / 다음 beat
- 현재 `진입` 또는 `클릭 N/M` 표시
- 대상 element highlight
- reduced-motion 상태 표시 및 전환

`prefers-reduced-motion: reduce`에서는 opacity/scale tween을 재생하지 않고 beat 상태를 즉시 전환한다. 그러나 이전/다음 beat, 대상 표시, click count는 유지해 정보가 사라지지 않게 한다.

snapshot은 preview fallback을 보여 주지 않는다. 추천 단계에서 proposal이 생성되지 않아야 한다.

### 11.3 수정 예상 파일

```text
apps/web/src/features/editor/design-agent/components/MotionProposalPreview.tsx        # 신규
apps/web/src/features/editor/design-agent/components/MotionProposalPreview.test.tsx   # 신규
apps/web/src/features/editor/design-agent/components/DesignProposalPreviewModal.tsx
apps/web/src/features/editor/design-agent/components/DesignProposalCompareCard.tsx
apps/web/src/features/editor/shell/components/animation/utils/animationPreviewPlayback.ts
apps/web/src/features/rehearsal/presenter/slideshowStepModel.ts
apps/web/src/features/rehearsal/presenter/useSlideshowTransitions.ts
apps/web/src/features/editor/design-agent/design-assistant.css
apps/web/src/features/editor/design-agent/MotionProposalPreview.integration.test.tsx  # 신규
```

기존 `animationPreviewPlayback`, presenter step model, `createAnimationTimeline()`을 재사용한다. proposal preview 전용 start-mode 해석을 새로 만들지 않는다.

### 11.4 계약 변경 여부

- 없음.
- preview summary는 proposal metadata가 아니라 current slide + candidate slide + canonical timeline에서 계산한다.
- beat label persistence가 꼭 필요해질 때만 speaker notes와 무관한 sanitized enum (`purpose`)을 optional proposal contract로 별도 제안한다. v1에는 넣지 않는다.

### 11.5 Acceptance criteria

- animation-only proposal이 motion preview로 자동 분기된다.
- play/pause와 beat 이동이 candidate timeline을 정확히 반영한다.
- 자동 진입, click 수, unique target 수, 예상 시간이 `createAnimationTimeline()` 결과와 같다.
- reduced-motion에서는 tween 없이 같은 최종 visibility state와 step count를 보여 준다.
- 기존 layout/color proposal은 정적 Before/After preview를 유지한다.
- snapshot은 motion preview가 아니라 추천 거부 메시지만 보인다.
- preview와 presenter가 같은 fixture에서 같은 root/click 순서를 사용한다.

### 11.6 검증 명령

```bash
pnpm --filter @orbit/editor-core test -- animationTimeline
pnpm --filter @orbit/web test -- MotionProposalPreview DesignProposalPreview
pnpm --filter @orbit/web typecheck
pnpm --filter @orbit/web build
```

### 11.7 rollout / rollback

- PR-M4 자체는 공개 runtime-config 계약을 늘리지 않는다. semantic planner의 backend allowlist/internal rollout과 같은 배포 cohort에서 preview를 먼저 검증한다.
- preview 오류 시 apply button을 활성화한 정적 canvas로 조용히 fallback하지 않는다. timeline validation error를 표시하고 apply를 막는다.
- UI commit을 롤백해야 하면 semantic planner mode도 `shadow` 또는 `off`로 내린다. “보이지 않는 motion proposal”을 장기 노출하지 않는다.

---

## 12. PR-M5 — golden, export parity, eval, rollout

브랜치: `feature/motion-planner-evaluation`
선행 PR: PR-M4
예상: 2일

### 12.1 12개 slide type golden fixture

각 fixture는 authored 기본형 1개 이상을 가진다.

```text
cover
title
problem
solution
feature-grid
process
architecture
data
chart
comparison
quote
summary
```

각 fixture에는 다음 기대값을 저장한다.

- classified slide type / narrative intent
- eligible target IDs
- excluded decoration/footer/connector IDs
- Narrative Motion Plan 또는 deterministic fallback plan
- compiled operations
- candidate animation/action graph
- entry/click roots와 총 예상 시간
- stable hash/compiler version

golden update는 사람이 diff를 검토해야 하며 model 변경과 compiler 변경을 한 PR에서 섞지 않는다.

### 12.2 안전·구조 fixture matrix

| 축 | 필수 case |
| --- | --- |
| process | 단계 3/4/6개, connector 제외, 최대 click cap |
| comparison | 좌우 1:1, 비대칭 항목, divider 제외 |
| data/chart | chart 전체→insight, caption 포함, series 분해 금지 |
| decorations | background/footer/page number/작은 반복 장식 target 0 |
| references | 기존 animation ID, `play-animation` action, semantic cue target 보존 |
| imported editable | source/coverage/stable target 통과와 source 누락 거부 |
| imported hybrid | stable target 일부만 허용, raster/unresolved target 제외 |
| imported snapshot | 모든 경우 `refused-unsafe`, proposal 없음 |
| import coverage | absent/complete 허용, partial/unknown/누락 거부 |
| special slide | activity/activity-results 거부 |
| rich text | letterSpacing/autoFit/fontScale/lineSpaceReduction hierarchy parity |
| fallback | timeout, invalid JSON/schema, non-allowlist ID에서 deterministic output |

### 12.3 undo, presenter, PPTX export parity

1. proposal apply 전 Deck JSON snapshot을 저장한다.
2. apply 후 animation/action graph와 timeline을 캡처한다.
3. undo 후 before snapshot과 deep-equal한다.
4. redo 후 candidate snapshot과 deep-equal한다.
5. presenter preview의 entry roots/click roots/target visibility를 캡처한다.
6. PPTX export 후 OOXML main sequence를 parse해 type/order/target/start-mode 의미를 비교한다.
7. imported editable/hybrid는 source shape resolution과 export 결과까지 검증한다.

PPTX binary byte equality는 요구하지 않는다. 다음 semantic equality를 요구한다.

- animation target identity
- effect 3종 mapping
- click root 수와 relative order
- with/after relation
- action reference 보존

### 12.4 pinned model eval

eval manifest 예시:

```json
{
  "model": "gpt-4.1-mini-2025-04-14",
  "plannerSchemaVersion": 1,
  "compilerVersion": 1,
  "fixtureVersion": 1,
  "runsPerFixture": 5
}
```

LLM run이 달라도 validated plan이 cap 안에 있고 compiler safety 결과가 동일한지를 측정한다. strict plan이 달라질 수는 있지만 다음 safety invariant는 100%여야 한다.

- invalid target 0
- unsafe slide proposal 0
- decoration/footer target 0
- dangling action 0
- unsupported generated effect 0
- cap violation 0
- raw speaker notes artifact 0

### 12.5 사람 평가 지표

내부 평가자 3명 이상이 12종 × 최소 2변형을 blind 비교한다.

| 지표 | 질문 | 출시 기준 |
| --- | --- | ---: |
| narrative fit | 발표 흐름과 등장 순서가 맞는가 | 평균 4.0/5 이상 |
| hierarchy preservation | 핵심과 보조 정보의 위계가 유지되는가 | 90% 이상 pass |
| click appropriateness | 클릭 수와 위치가 발표에 자연스러운가 | 평균 4.0/5 이상 |
| distraction | 과하거나 불필요한 motion이 있는가 | 10% 미만 |
| structure correctness | process/comparison/data 구조가 맞는가 | 95% 이상 |
| preview confidence | 적용 전에 결과를 이해할 수 있는가 | 평균 4.0/5 이상 |
| export fidelity | presenter와 PPTX 결과가 의미상 같은가 | 100% fixture pass |

현재 heuristic을 baseline으로 같은 slide에서 비교한다. 효과 수가 많다는 이유로 점수를 주지 않고, 더 적은 beat로 이야기 구조를 잘 보존하면 높은 점수를 준다.

### 12.6 수정 예상 파일

```text
tests/fixtures/motion-golden/**
services/python-worker/tests/test_motion_golden.py                      # 신규
services/python-worker/tests/test_pptx_motion.py
services/python-worker/tests/test_pptx_ooxml_generation.py
packages/editor-core/src/playback/animationTimeline.test.ts
apps/web/src/features/rehearsal/presenter/...test.ts
apps/web/e2e 또는 infra Playwright motion proposal spec                # 신규
docs/evals/motion-planner-v1.md                                         # 신규
docs/runbooks/local-development.md                                      # flag/검증 추가
```

### 12.7 계약 변경 여부

- 없음.
- eval artifact에는 fixture의 합성 notes만 사용하고 실제 사용자 notes를 넣지 않는다.

### 12.8 Acceptance criteria

- 12개 slide type authored golden이 모두 통과한다.
- process/comparison/data 구조 fixture와 decoration/footer exclusion fixture가 모두 통과한다.
- imported editable/hybrid/snapshot 및 absent/complete/partial/unknown coverage matrix가 예상 outcome과 일치한다.
- 기존 animation ID/action reference, apply→undo→redo 불변식이 모두 통과한다.
- presenter preview와 PPTX export의 semantic timeline이 모든 export fixture에서 일치한다.
- provider 실패·invalid Structured Output에서 deterministic fallback golden이 반복 실행마다 동일하다.
- pinned model 5회 반복 eval의 safety invariant가 100%다.
- 사람 평가가 §12.5 출시 기준을 모두 만족한다.
- 실제 또는 합성 sentinel speaker notes가 log/DB Job result/proposal metadata에 남지 않는다.

### 12.9 검증 명령

```bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/editor-core test
pnpm --filter @orbit/api test -- design-agent
pnpm --filter @orbit/web test
cd services/python-worker
uv run pytest \
  tests/test_motion_golden.py \
  tests/test_design_agent.py \
  tests/test_pptx_motion.py \
  tests/test_pptx_ooxml_generation.py -q
uv run ruff check .
uv run mypy app
cd ../..
pnpm typecheck
pnpm lint
pnpm build
```

Playwright spec가 추가된 뒤에는 실제 명령 이름을 repository script에 등록하고 해당 focused E2E를 실행한다. 수동 검증만으로 완료 처리하지 않는다.

### 12.10 rollout / rollback

출시 순서:

1. `shadow`: authored + imported 전체에서 결과를 저장하지 않고 count/reason/safety만 측정.
2. internal/demo: authored content만 `on`.
3. 5%: authored content.
4. 25% → 100%: authored content, 안전 invariant와 사람 신고율 확인.
5. imported editable 5% → 100%.
6. imported hybrid는 stable target/export parity fixture가 100%일 때 별도로 5%부터 시작.
7. snapshot/special/unsafe coverage는 영구 거부.

중단 조건:

- dangling action 또는 ID 유실 1건
- snapshot/partial/unknown coverage proposal 1건
- unsupported generated effect 1건
- raw speaker notes가 log/DB result/proposal metadata에서 발견 1건
- presenter/PPTX semantic mismatch 1건
- apply/undo corruption 1건

rollback:

- `AI_MOTION_PLANNER_MODE=off`로 semantic planner를 끈다.
- 기존 heuristic을 쓰더라도 PR-M0 eligibility, notes sanitization, apply validator를 통과해야 한다.
- motion preview flag는 planner와 독립적으로 내릴 수 있으나, 사용자가 결과를 검토할 수 없으면 recommendation quick action도 함께 숨긴다.
- schema/DB migration이 없으므로 persisted data rollback은 없다. 이미 적용된 animations는 정상 Deck data로 남고 undo/history로 되돌린다.

---

## 13. 통합 완료 조건

다음이 모두 충족되어야 v1 완료다.

- [ ] 일반 content는 추천 가능하다.
- [ ] imported editable은 source/capability/coverage 검증 후에만 추천 가능하다.
- [ ] imported hybrid는 실제 렌더 가능하고 stable한 element ID에만 추천한다.
- [ ] snapshot, partial/unknown import coverage, activity/activity-results는 Web/API/Python/apply에서 모두 거부한다.
- [ ] Web panel의 snapshot 공백이 닫혔다.
- [ ] approved+current cue → aiNotes/compositionPlan → bounded speakerNotes → role/group/geometry 순서가 테스트로 고정됐다.
- [ ] raw speaker notes가 log, stored motion context, Job/result, proposal metadata에 남지 않는다.
- [ ] rich text hierarchy가 role-first이고 effective typography를 사용한다.
- [ ] LLM은 strict Narrative Motion Plan만 반환하고 raw patch/duration을 만들 수 없다.
- [ ] beat 6, click 4, target 8, entry 900ms, total 6초 cap이 강제된다.
- [ ] compiler의 신규 effect는 3종뿐이다.
- [ ] 기존 animation ID와 `play-animation` action reference가 보존된다.
- [ ] 명시적 replace 외 delete가 없다.
- [ ] merge 불가 시 partial operation이 아니라 `operations=[]`다.
- [ ] motion proposal에 play/pause, beat 이동, 요약, reduced-motion preview가 있다.
- [ ] 12 slide type golden과 import/reference/fallback matrix가 통과한다.
- [ ] apply→undo→redo와 presenter→PPTX semantic parity가 통과한다.
- [ ] pinned model eval과 사람 평가 기준을 통과한다.

---

## 14. 요구사항 추적표

| 요구 | 반영 위치 |
| --- | --- |
| 단순 heuristic 대신 이해→beat→compiler→merge→preview | §1.1, §2.1 |
| importRenderMode 우선 gate와 mode별 정책 | §3.2~§3.4, PR-M0 |
| Web/Backend/Worker/apply 다중 검증 | §1.2, §3.5, PR-M0 |
| cue/aiNotes/notes/role 우선순위와 notes privacy | §4.1, §4.4 |
| rich text fidelity와 effective typography | §1.3, §4.3, PR-M1 |
| strict plan, ID allowlist, cap | §4.6 |
| 3종 결정론적 library/compiler | §1.4, §5 |
| animation/action 보존과 fail-closed merge | §6, PR-M3 |
| 실제 motion preview와 reduced motion | §7, PR-M4 |
| 5개 이상 단계와 파일/계약/AC/명령/롤백 | PR-M0~PR-M5 |
| 12종 golden, 구조, import, undo/export/eval/사람 지표 | PR-M5 |
| 공개 API 유지, 필요 시 최소 sanitized context | D8~D9, §3.4 |

---

## 15. 참조

- `AGENTS.md`
- `docs/plans/slide-redesign-implementation.md`
- `docs/contracts.md`
- `docs/conventions/environment.md`
- `docs/conventions/logging.md`
- `packages/shared/src/deck/animation.schema.ts`
- `packages/shared/src/deck/deck.schema.ts`
- `packages/shared/src/deck/design-agent.schema.ts`
- `packages/shared/src/deck/template-blueprint.schema.ts`
- `packages/editor-core/src/playback/animationTimeline.ts`
- `packages/editor-core/src/text/richTextOperations.ts`
- `apps/web/src/features/editor/shell/utils/slideEditingPolicy.ts`
- `apps/web/src/features/editor/shell/utils/motionEditingPolicy.ts`
- `apps/web/src/features/editor/design-agent/components/DesignProposalPreviewModal.tsx`
- `apps/api/src/design-agent/design-agent.service.ts`
- `services/python-worker/app/ai/design_agent.py`
- `services/python-worker/app/ai/pptx_motion.py`
- `services/python-worker/app/ai/pptx_ooxml_generation.py`
- `services/python-worker/app/ai/slide_redesign/slide_extractor.py`
