# ORBIT Animation Runtime 아키텍처

## 목적

`slide.animations`를 실행 가능한 sequence로 변환하고, 현재 animation state를 계산하는 공통 `Animation Runtime`을 `Editor preview`와 `Presentation mode`가 함께 사용하도록 고정한다.

이 문서는 두 가지를 결정한다.

- 모듈을 어떤 경계로 분리할지
- 렌더링 방식을 어떤 방향으로 고정할지

## Source of Truth

애니메이션의 기준 데이터는 아래 두 필드다.

- `slide.elements`
- `slide.animations`

런타임 state는 deck JSON에 저장하지 않는다.

- `currentStepIndex`
- `executedAnimationIds`
- `lastTriggeredAnimationId`
- `status`

이 값들은 실행 중에만 메모리에서 관리한다.

## 패키지 경계

### `packages/shared`

역할: data contract만 담당한다.

- `deck/animation.schema.ts`
- `deck/deck.schema.ts`
- `deck/patch.schema.ts`

여기에는 아래만 둔다.

- `slide.animations` schema
- animation type / easing type
- patch contract

여기에는 두지 않는다.

- sequence 생성 로직
- playback state 계산 로직
- renderer 전용 state

### `packages/editor-core`

역할: 공통 domain logic과 pure runtime을 담당한다.

Animation Runtime은 여기 둔다.

- `src/animations/types.ts`
- `src/animations/runtime.ts`

public export는 아래에서 노출한다.

- `packages/editor-core/src/index.ts`

현재 runtime public API는 아래 함수들이다.

- `buildAnimationSequence(slide)`
- `createInitialAnimationRuntimeState(sequence)`
- `advanceAnimationRuntimeState(sequence, state)`
- `resetAnimationRuntimeState(sequence)`
- `completeAnimationRuntimeState(sequence)`
- `resolveAnimationRenderState(slide, sequence, state)`

현재 runtime public type은 아래 타입들이다.

- `AnimationSequence`
- `AnimationSequenceStep`
- `AnimationRuntimeState`
- `AnimationRenderState`
- `AnimationResolvedElementState`

### `apps/web`

역할: renderer adapter와 interaction layer를 담당한다.

여기서는 pure runtime을 다시 구현하지 않는다.
workspace package 내부 구현 경로도 직접 import하지 않는다.

역할을 아래처럼 나눈다.

- `features/editor`: 편집 interaction, selection, patch 생성
- `features/slide-render`: read-only slide renderer adapter
- `features/rehearsal` 또는 추후 `features/presentation`: runtime state를 받아 playback

### import 규칙

- `apps/web` -> `packages/editor-core` 의존은 `@orbit/editor-core` public export만 사용한다.
- `features/slide-render`는 `features/editor/*` 하위 구현을 직접 import하지 않는다.
- render-only 로직은 `features/slide-render` 또는 `features/shared`로 올리고, editor는 그것을 조합만 한다.

## Runtime 책임

`Animation Runtime`은 아래까지만 책임진다.

### 1. Sequence 정렬

- `slide.animations`를 `order` 기준으로 정렬한다.
- tie-break는 `delayMs`, `animationId` 순서로 처리한다.

### 2. Step kind 해석

현재 MVP 분류는 아래처럼 둔다.

- `appear`, `fade-in`, `zoom-in` -> `enter`
- `disappear`, `fade-out`, `zoom-out` -> `exit`
- `rotate` -> `emphasis`

추후 animation type이 늘어나면 이 매핑만 확장한다.

### 3. Initial state 계산

각 element의 첫 animation이 `enter`라면 초기에는 숨긴다.

- `visible = false`
- `opacity = 0`

그 외에는 element 원래 상태를 유지한다.

### 4. Step advance / reset / complete

- `advance`: 다음 step 1개 실행
- `reset`: 실행 이력 제거 후 초기 state로 복귀
- `complete`: 모든 step을 실행된 상태로 전환

### 5. Render state 계산

runtime은 adapter가 소비할 수 있는 최소 state만 계산한다.

- element visible 여부
- element opacity
- 현재 active step
- 현재 step index
- 완료 여부

transform interpolation, DOM style, Konva tween 같은 실제 렌더링은 runtime 책임이 아니다.

## Renderer 책임

renderer adapter는 runtime이 준 state를 화면에 반영한다.

### 공통 규칙

- runtime의 `AnimationRenderState`를 입력으로 받는다.
- element base data는 `slide.elements`에서 읽는다.
- active step의 `type`, `durationMs`, `delayMs`, `easing`을 보고 실제 animation을 재생한다.

### runtime이 하지 않는 것

- Konva node 조작
- DOM className/style 적용
- CSS transition 선언
- requestAnimationFrame 기반 tween

이 부분은 전부 adapter가 맡는다.

## 렌더링 방향 고정

MVP에서는 `Canvas-first`로 고정한다.

### 결정

- `Editor preview`: Konva/Canvas adapter 사용
- `Presentation mode`: Konva/Canvas adapter 재사용
- `DOM renderer`: 이번 단계의 우선 구현 대상에서 제외
- `PDF`: export / preview / fallback 전용

### 이유

현재 저장소에서 실제 slide element를 가장 정확하게 그리는 코드는 `apps/web/src/features/editor/canvas`에 있다.

반면 현재 `RehearsalWorkspace`의 presenter preview는 다음 둘 중 하나다.

- slide thumbnail image
- 간이 DOM preview

이 구조는 element 단위 animation playback을 바로 올리기 어렵다.

따라서 MVP에서는 DOM renderer를 새로 만드는 대신, 기존 Canvas renderer를 read-only adapter로 추출해서 `Editor`와 `Presentation mode`가 같이 쓰는 것이 가장 안전하다.

## Web 모듈 분리안

`apps/web`에서는 아래 구조를 목표로 한다.

```text
apps/web/src/features/
  slide-render/
    canvas/
      SlideCanvasRenderer.tsx
      SlideCanvasElementNode.tsx
      slideCanvasRenderState.ts
```

### `features/slide-render/canvas`

역할:

- read-only slide render
- runtime state 반영
- editor 전용 interaction 없음

여기로 이동 또는 추출할 후보:

- `RenderOnlyElementNode`
- `getRenderableSlideElements`
- read-only stage 구성 로직

현재 출발 파일:

- `apps/web/src/features/editor/canvas/EditorCanvas.tsx`

### `features/editor`

계속 남길 것:

- selection
- drag/resize/transform
- inline text editing
- custom shape editing
- patch emit

즉 `EditorCanvas`는 interaction shell이 되고, 실제 element draw는 `slide-render`를 소비하는 구조로 바꾼다.

### `features/rehearsal` 또는 추후 `features/presentation`

현재 thumbnail/간이 preview 대신 `slide-render/canvas`의 read-only renderer를 붙인다.

입력은 아래 3개로 통일한다.

- `slide`
- `deck`
- `animationRenderState`

## Integration 순서

### 1단계

`packages/editor-core`의 `Animation Runtime`을 기준 API로 고정한다.

### 2단계

`apps/web/src/features/editor/canvas/EditorCanvas.tsx`에서 read-only rendering 부분을 `features/slide-render/canvas`로 추출한다.

### 3단계

`Presentation mode` 또는 현재 `RehearsalWorkspace` preview에서 thumbnail/간이 DOM preview 대신 read-only canvas renderer를 사용한다.

### 4단계

renderer adapter가 `AnimationRenderState.activeStep`와 element state를 사용해 실제 playback을 구현한다.

## Non-goals

이 단계에서 하지 않는 것:

- presentation session event 처리
- rehearsal cue event 처리
- audience sync
- PPTX/PDF/image export playback
- DOM renderer 완성

## 현재 결정 요약

- source of truth는 `slide.elements`, `slide.animations`
- runtime은 `packages/editor-core/src/animations`
- `packages/shared`는 schema 전용 유지
- renderer는 `apps/web` adapter로 분리
- MVP rendering은 `Canvas-first`
- `Presentation mode`도 우선 same canvas adapter를 사용
- PDF는 playback engine이 아니다
