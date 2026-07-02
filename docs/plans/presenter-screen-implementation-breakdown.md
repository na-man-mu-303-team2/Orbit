# Implementation Breakdown: Presenter Screen

**Status:** Ready for implementation review  
**Date:** 2026-07-02  
**Source plan:** [presenter-screen.md](./presenter-screen.md)  
**Source spec:** [presenter-screen.md](../specs/presenter-screen.md)  

This document keeps the P0-P7 milestone structure from the source plan and breaks each milestone into implementable, verifiable units. The W1/W2/W3 documents are used only as interface context; this plan's implementation scope remains the presenter screen spec and plan.

## Scope Boundaries

**In scope**
- Presenter/rehearsal screen implementation in the existing `apps/web/src/features/rehearsal` area, with shared read-only slide rendering extracted to `apps/web/src/features/slides/rendering`.
- Read-only slideshow rendering, slide-window display management, local state synchronization, Live STT, speech tracking, auto advance, cue execution, recording, chunk upload, server assembly, and integration events.
- Narrow contract/schema work needed by this feature:
  - `Deck.targetDurationMinutes`
  - `Slide.estimatedSeconds`
  - rehearsal audio chunk APIs and run meta API
  - `REPORT_STT_PROVIDER=openai | whisperx`
  - `REHEARSAL_AUDIO_MAX_BYTES=209715200`
- A WhisperX external API contract spike before implementation.

**Out of scope**
- W1 editor cue-authoring UI. The editor animation feature and cue editing are owned separately.
- W2 report v2 analytics beyond receiving run meta and preserving the report STT pipeline.
- W3 network broadcasting/audience gateway. This work emits local `PresentationStateBus` events only.
- PCM upload fallback. FLAC is the P6 MVP; PCM fallback remains a follow-up.

## Resolved Implementation Decisions

- `SttPort` is split into `LiveSttPort` for browser live control and `ReportSttProvider` for server report transcription.
- Live STT engines: Sherpa, Moonshine, Web Speech. WhisperX is not selectable for live control.
- Report STT providers: OpenAI and WhisperX. WhisperX calls an external hosted API.
- WhisperX implementation starts with a contract spike defining endpoint, auth, audio input, transcript, and segment response shape.
- Chunk upload replaces `/api/v1/rehearsals/:runId/audio/upload-url`.
- Chunk endpoints:
  - `POST /api/v1/rehearsals/:runId/audio-begin`
  - `POST /api/v1/rehearsals/:runId/audio-chunks/:index`
  - `POST /api/v1/rehearsals/:runId/audio-complete`
- Chunk storage uses S3/MinIO temporary objects. Successful complete deletes chunks immediately. Incomplete/failed chunks have a 1 day TTL.
- Run meta is uploaded through a new API, not inside `audio-complete`.
- `targetDurationMinutes` and `estimatedSeconds` schema changes are in scope and should be the first small PR. Populating those values in generated decks is handled by another owner.
- P0 shared renderer location: `apps/web/src/features/slides/rendering`.
- P0 slide backgrounds use a shared CSS background layer extracted from the existing editor preview behavior.
- P0 cue dependency is an input port only: the renderer/model receives trigger-referenced `animationId` values, while real `CueProvider` loading remains in P5.
- P0 animation semantics: `zoom-in` settles visible at the base element state, `zoom-out` settles hidden, and `rotate` is a transient 360 degree effect that settles back to the base rotation.
- P0 highlights are persistent state: active highlights remain visible until an inactive state is applied.
- P0 manual controls: Space, ArrowRight, PageDown, Enter, and clicker-equivalent key events run `nextStep`; ArrowLeft and PageUp go to the previous slide and restore `stepIndex=0`.
- P0 performance gate is manual playback plus a simple RAF/drop-frame measurement note, not a hard CI performance threshold.

## Dependency Graph

```
Contract Baseline
  ├─ Deck timing schema
  ├─ audio chunk schemas
  ├─ report STT provider config
  └─ run meta schema/API

P0 SlideshowRenderer
  └─ P1 DisplayManager

P2 LiveSttPort + ReportSttProvider
  └─ P3 SpeechTracker + RehearsalPanel
       ├─ P4 AdvanceController
       └─ P5 CueEngine

P6 Recording + Chunk Upload

P0-P6
  └─ P7 Integration
```

P0/P1, P2/P3/P4/P5, and P6 can run as parallel tracks after the contract baseline. P7 waits for all three tracks.

## Contract Baseline: First PR

### Task C0.1: Add Deck Timing Schema

**Description:** Add the presenter timing fields needed by P3/P7 while preserving existing decks.

**Feature/spec:** `Deck.targetDurationMinutes` and `Slide.estimatedSeconds`.

**Tech stack:** `packages/shared` Zod schemas, Vitest, `docs/contracts.md`.

**Implementation plan:**
- Add `targetDurationMinutes` to `deckSchema`, defaulting to `10` to match the existing AI deck generation request default.
- Add optional positive integer `estimatedSeconds` to `slideSchema`.
- Update deck schema tests for defaulting, valid values, and invalid non-positive `estimatedSeconds`.
- Update `docs/contracts.md` and `packages/shared/src/README.md`.

**Acceptance criteria:**
- Existing decks without the new fields still parse.
- Parsed decks expose `targetDurationMinutes`.
- Slides may omit `estimatedSeconds`; presenter UI falls back when absent.

**Verification:**
- `pnpm --filter @orbit/shared test`
- `pnpm --filter @orbit/shared build`

**Dependencies:** None

**Files likely touched:**
- `packages/shared/src/deck/deck.schema.ts`
- `packages/shared/src/deck/deck.schema.test.ts`
- `docs/contracts.md`
- `packages/shared/src/README.md`

**Estimated scope:** Small

### Task C0.2: Define Rehearsal Chunk Contracts

**Description:** Replace the single upload-url flow with chunked rehearsal audio contracts.

**Feature/spec:** FLAC upload, 200MB configurable cap, begin/chunk/complete APIs, run meta API.

**Tech stack:** `packages/shared` Zod schemas, Vitest.

**Implementation plan:**
- Add `audio/flac` to rehearsal audio MIME support.
- Replace or deprecate upload-url request schemas with:
  - `beginRehearsalAudioUploadRequestSchema`
  - `uploadRehearsalAudioChunkParamsSchema`
  - `completeRehearsalAudioUploadRequestSchema`
  - `updateRehearsalRunMetaRequestSchema`
- Model run meta as `{ slideTimeline, missedKeywords, adviceEvents }`.
- Keep response shape for complete as `{ run, job }`.

**Acceptance criteria:**
- `audio/flac` is accepted for rehearsal audio.
- Chunk begin accepts only `{ codec:"flac", sampleRate:16000, channels:1, chunkDurationMs:30000 }`.
- Complete validates `chunkCount`, `totalDurationMs`, `totalSizeBytes`, and `sha256`.
- Meta rejects transcript, speaker notes, raw audio, or script content.

**Verification:**
- `pnpm --filter @orbit/shared test`
- `pnpm --filter @orbit/shared build`

**Dependencies:** Task C0.1

**Files likely touched:**
- `packages/shared/src/files/file.schema.ts`
- `packages/shared/src/files/file.schema.test.ts`
- `packages/shared/src/rehearsals/rehearsal.schema.ts`
- `packages/shared/src/rehearsals/rehearsal.schema.test.ts`
- `docs/contracts.md`

**Estimated scope:** Medium

### Task C0.3: Extend Runtime Config

**Description:** Add report STT provider selection and rehearsal upload limits.

**Feature/spec:** `REPORT_STT_PROVIDER=openai | whisperx`, `WHISPERX_API_URL`, `WHISPERX_API_KEY`, `WHISPERX_MODEL`, `REHEARSAL_AUDIO_MAX_BYTES`.

**Tech stack:** `packages/shared`, `packages/config`, Python `pydantic`, env docs.

**Implementation plan:**
- Extend `reportSttProviderSchema` to `openai | whisperx`.
- Add `REHEARSAL_AUDIO_MAX_BYTES` with default/example `209715200`.
- Add optional WhisperX env keys. Require `WHISPERX_API_URL` and `WHISPERX_API_KEY` only when `REPORT_STT_PROVIDER=whisperx`.
- Mirror validation in `services/python-worker/app/config.py`.
- Update `.env.example` and `docs/conventions/environment.md`.

**Acceptance criteria:**
- Existing local config with `REPORT_STT_PROVIDER=openai` still passes.
- `REPORT_STT_PROVIDER=whisperx` fails without required WhisperX URL/key.
- 200MB limit is read from config rather than hard-coded.

**Verification:**
- `pnpm --filter @orbit/api test -- env.schema`
- `cd services/python-worker && uv run pytest tests/test_config.py`

**Dependencies:** None

**Files likely touched:**
- `packages/shared/src/config/runtime.ts`
- `packages/config/src/index.ts`
- `apps/api/src/config/env.schema.spec.ts`
- `services/python-worker/app/config.py`
- `services/python-worker/tests/test_config.py`
- `.env.example`
- `docs/conventions/environment.md`

**Estimated scope:** Medium

### Checkpoint: Contract Baseline

- [ ] Shared schema tests pass.
- [ ] API config tests pass.
- [ ] Python config tests pass.
- [ ] `docs/contracts.md` matches the new public contract.
- [ ] This can be committed and opened as the first PR before feature UI work.

## P0: Slideshow Renderer

### Task P0.1: Extract Shared Read-Only Slide Renderer Primitives

**Description:** Move the editor's existing render-only primitives into a neutral shared module that can be consumed by editor thumbnails, presenter slideshow, and later audience views without importing editor interaction code.

**Feature/spec:** Read-only viewer mode; deck JSON is the source of truth; no editor selection, transform, inline editing, custom shape editing overlays, keyboard shortcuts, or editor shell assumptions.

**Tech stack:** React, React Konva, `@orbit/shared` deck types, existing `packages/editor-core` element normalization, existing asset URL resolver behavior.

**Implementation plan:**
- Create `apps/web/src/features/slides/rendering`.
- Move or wrap the current render-only path from `EditorCanvas`: `RenderOnlyElementNode`, `getRenderableSlideElements`, grouped-child rendering, and element frame normalization.
- Move reusable element drawing behind shared imports so `EditableElementNode` continues to compose it, but read-only consumers do not import `EditableElementNode`, `Transformer`, inline text editing, or canvas interaction hooks.
- Add a `SlideBackground` helper that matches current editor preview behavior: `backgroundColor`, `backgroundImage.fit`, and `backgroundImage.opacity` as a CSS layer behind the Konva stage.
- Keep `resolveEditorAssetUrl` behavior equivalent for image elements and slide background images. Rename only if a neutral asset helper is extracted in the same change.
- Expose a `ReadOnlySlideCanvas` component with input `{ deck, slide, elementStates?, highlights? }`.

**Acceptance criteria:**
- A slide renders without importing editor interaction components.
- Text, image, shape, group, custom shape, and chart elements render at the same coordinates as the editor preview.
- Slide background color and background image behavior match the editor preview.
- Grouped child elements are not double-rendered, and hidden elements remain hidden.

**Verification:**
- `pnpm --filter @orbit/web test -- ReadOnlySlideCanvas`
- Manual visual comparison against an editor deck preview with background image, group, chart, image, and custom shape elements.

**Dependencies:** Task C0.1

**Files likely touched:**
- `apps/web/src/features/slides/rendering/ReadOnlySlideCanvas.tsx`
- `apps/web/src/features/slides/rendering/SlideBackground.tsx`
- `apps/web/src/features/slides/rendering/elementRendering.tsx`
- `apps/web/src/features/slides/rendering/elementNormalization.ts`
- `apps/web/src/features/editor/canvas/EditorCanvas.tsx`
- `apps/web/src/features/editor/canvas/components/EditableElementNode.tsx`

**Estimated scope:** Medium

### Task P0.2: Define Slideshow Model Inputs and Animation Plan

**Description:** Define the pure model boundary for slideshow playback before rendering transitions. P0 receives cue-referenced animation IDs through an input port only; real `CueProvider` loading and speech matching remain in P5.

**Feature/spec:** D12, D13, D14, D17 P0 boundary.

**Tech stack:** TypeScript pure functions, Vitest.

**Implementation plan:**
- Add model input types:
  - `SlideshowModelInput = { slide, triggerAnimationIds }`
  - `SlideshowStepAddress = { slideId, stepIndex }`
  - `SlideshowAnimationPlan = { entryAnimations, triggerSteps, maxStepIndex }`
- Classify animations by `animationId` membership in `triggerAnimationIds`.
- Sort entry animations by `order`, then `delayMs`, then array index.
- Build trigger steps from distinct `order` values among referenced animations.
- Treat equal `order` as one simultaneous trigger step; group ordering tie-break remains original array index.
- Ignore dangling animation targets for render output without throwing, and expose them in debug metadata for tests.

**Acceptance criteria:**
- `stepIndex=0` means no trigger step has completed.
- `maxStepIndex` equals the number of distinct trigger `order` values.
- Cue-unreferenced animations are classified as entry auto-play.
- Cue-referenced animations are the only animations that affect trigger step count.
- Equal-order trigger animations execute in the same step group.

**Verification:**
- `pnpm --filter @orbit/web test -- slideshowStepModel`

**Dependencies:** Task P0.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.ts`
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.test.ts`

**Estimated scope:** Small

### Task P0.3: Compute Deterministic Settled Element State

**Description:** Implement the no-transition restoration function that maps `(slideId, stepIndex)` to final element presentation state. This is the recovery path for slide-window reopen, crash recovery, and rapid state jumps.

**Feature/spec:** D12 deterministic restoration; D13 entry animation restore behavior; D14 simultaneous steps; shared animation types.

**Tech stack:** TypeScript pure functions, Vitest.

**Implementation plan:**
- Add `computeSettledElementStates({ deck, slide, stepIndex, triggerAnimationIds })`.
- Base state starts from normalized deck element properties: `visible`, `opacity`, `rotation`, frame, and z-index.
- Entry animations are always treated as completed for settled restoration.
- Trigger animations are applied only when their step group index is `<= stepIndex`.
- Implement settled semantics:
  - `appear` and `fade-in`: target element settles visible at base opacity.
  - `disappear` and `fade-out`: target element settles hidden with opacity `0`.
  - `zoom-in`: target element settles visible at base scale.
  - `zoom-out`: target element settles hidden with opacity `0` and scale `0`.
  - `rotate`: target element settles back to base rotation.
- Clamp invalid `stepIndex` values into `0..maxStepIndex` at the store/command boundary, not inside low-level render components.

**Acceptance criteria:**
- The same input deck, slide, `stepIndex`, and trigger ID set always produce the same element states.
- Non-cue entry animations do not replay during settled restoration.
- State restoration works for every shared animation type.
- Missing or hidden base elements do not crash state computation.

**Verification:**
- `pnpm --filter @orbit/web test -- slideshowStepModel`
- Unit cases cover `stepIndex=0`, middle step, last step, equal-order groups, missing animation target, and out-of-range command clamping.

**Dependencies:** Task P0.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.ts`
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.test.ts`

**Estimated scope:** Medium

### Task P0.4: Build SlideshowRenderer Composition

**Description:** Compose the shared `ReadOnlySlideCanvas` with the slideshow model so presenter and slide-window views can render a deck from state only.

**Feature/spec:** SlideshowRenderer is a function of `(slideId, stepIndex, highlights)` plus cue-referenced animation IDs; it does not know whether the trigger source is keyboard, speech, automation, or recovery.

**Tech stack:** React, React Konva, TypeScript, Vitest/Testing Library.

**Implementation plan:**
- Add `SlideshowRenderer` under `apps/web/src/features/rehearsal/presenter`.
- Resolve `slideId` to the active slide; return an explicit empty/error state only when the slide is missing.
- Pass computed settled `elementStates` into `ReadOnlySlideCanvas`.
- Keep renderer props explicit: `{ deck, slideId, stepIndex, highlights, triggerAnimationIds, renderMode }`.
- Ensure the rendered slide scales to the available container without changing deck-space coordinates.
- Keep notes, transcript, controls, and presenter-only UI outside this component.

**Acceptance criteria:**
- Renderer output depends only on the provided deck and presenter state props.
- Rendering works without Live STT, CueEngine, DisplayManager, or recording code.
- Slide scaling preserves aspect ratio and element coordinates.
- Missing `slideId` is handled without throwing.

**Verification:**
- `pnpm --filter @orbit/web test -- SlideshowRenderer`

**Dependencies:** Task P0.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.tsx`
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.test.tsx`

**Estimated scope:** Small

### Task P0.5: Add Transition Runtime and Reduced Motion

**Description:** Add live transition behavior as a decoration over deterministic settled state. Transitions must never change the restored final state.

**Feature/spec:** Entry auto-play, trigger step transitions, 500ms transition cap, skipped transitions on rapid state jumps, `prefers-reduced-motion`.

**Tech stack:** React hooks, React Konva transforms/opacity, browser `matchMedia`, Vitest.

**Implementation plan:**
- Add `useReducedMotion`.
- Add `useSlideshowTransitions` that receives previous and next settled states plus the animation plan.
- On slide entry, play cue-unreferenced entry animations once in `order -> delayMs -> array index` order.
- On trigger step change, play only animations in the newly completed step group.
- Cap effective transition duration at `min(animation.durationMs, 500)`.
- If state jumps by more than one step, or slide changes during an active transition, cancel intermediate transitions and render the target settled state.
- If `prefers-reduced-motion` is active, bypass transition frames and render the target settled state immediately.

**Acceptance criteria:**
- Transition runtime can be disabled without changing settled output.
- Rapid jumps never leave an element stuck in an intermediate opacity, scale, or rotation.
- Reduced-motion users see immediate final states.
- `rotate` animates transiently and settles to base rotation.

**Verification:**
- `pnpm --filter @orbit/web test -- SlideshowRenderer`
- Manual reduced-motion browser check.

**Dependencies:** Task P0.4

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/useSlideshowTransitions.ts`
- `apps/web/src/features/rehearsal/presenter/useReducedMotion.ts`
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.tsx`
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.test.tsx`

**Estimated scope:** Medium

### Task P0.6: Render Persistent Highlight State

**Description:** Render active highlights as persistent presentation state until an inactive state is applied.

**Feature/spec:** `highlights: { elementId, active }[]` state; editor-defined highlight elements are still normal deck elements; runtime highlights use the default scale/glow overlay.

**Tech stack:** React Konva overlays, TypeScript, Vitest/Testing Library.

**Implementation plan:**
- Normalize highlights into a `Map<elementId, active>`.
- Render default highlight overlay around the target element with glow and subtle scale.
- Keep overlay non-listening so it never captures pointer events.
- Keep highlight styling outside the pure settled-state function.
- Ensure hidden elements do not show runtime highlight overlays.
- Keep active highlights visible until the caller sends inactive state.

**Acceptance criteria:**
- Active highlight appears for the target element and remains visible across re-renders.
- Inactive highlight removes the overlay.
- Highlight overlay does not alter element deck coordinates or settled state.
- Highlighting a missing or hidden element is ignored without throwing.

**Verification:**
- `pnpm --filter @orbit/web test -- SlideshowRenderer`

**Dependencies:** Task P0.4

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.tsx`
- `apps/web/src/features/slides/rendering/highlightOverlay.tsx`
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.test.tsx`

**Estimated scope:** Small

### Task P0.7: Add Presenter State Store and Manual Commands

**Description:** Add the local state and command surface needed to operate the slideshow manually before STT, auto advance, and CueEngine are connected.

**Feature/spec:** Manual key/clicker priority; `next-step` is the common command; last trigger step advances to the next slide; previous slide restores with `stepIndex=0`.

**Tech stack:** TypeScript reducer or small store, React hooks, browser keyboard events, Vitest.

**Implementation plan:**
- Add presenter state `{ slideId, slideIndex, stepIndex, highlights }`.
- Add commands: `nextStep`, `nextSlide`, `previousSlide`, `setSlide`, `setHighlight`.
- `nextStep` increments `stepIndex` until `maxStepIndex`, then requests `nextSlide`.
- `nextSlide`, `previousSlide`, and `setSlide` reset `stepIndex=0`.
- Clamp slide index and step index at the command boundary.
- Map Space, ArrowRight, PageDown, Enter, and clicker-equivalent key events to `nextStep`.
- Map ArrowLeft and PageUp to `previousSlide`.
- Ignore keyboard commands when focus is inside editable form controls.

**Acceptance criteria:**
- Manual commands work without Live STT or CueEngine.
- Last step on a slide moves to the next slide and resets `stepIndex=0`.
- Previous slide restores with `stepIndex=0`.
- Keyboard shortcuts do not fire while typing in an input, textarea, select, or contenteditable target.

**Verification:**
- `pnpm --filter @orbit/web test -- presenterStateStore`
- `pnpm --filter @orbit/web test -- usePresenterKeyboard`
- Manual keyboard and clicker smoke test.

**Dependencies:** Task P0.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/presenterStateStore.ts`
- `apps/web/src/features/rehearsal/presenter/usePresenterKeyboard.ts`
- `apps/web/src/features/rehearsal/presenter/presenterStateStore.test.ts`
- `apps/web/src/features/rehearsal/presenter/usePresenterKeyboard.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

**Estimated scope:** Medium

### Task P0.8: Add Animation Fixture Deck and P0 Verification Harness

**Description:** Add focused test fixtures and a manual verification path so P0 can be validated independently from STT, CueEngine, DisplayManager, and recording.

**Feature/spec:** P0 gate: manual slideshow playback with animation deck, deterministic restoration tests, no editor interaction dependency, near-60fps manual playback check.

**Tech stack:** Vitest, Testing Library, fixture deck JSON, simple RAF measurement helper for manual/dev-only use.

**Implementation plan:**
- Add a small fixture deck covering background image, text, image, group, chart, custom shape, and all animation types.
- Add model tests for restoration across `stepIndex` values.
- Add renderer tests for highlight persistence and reduced-motion immediate state.
- Add an import-boundary test or lightweight dependency assertion that presenter renderer code does not import `EditableElementNode`, `Transformer`, editor hooks, or inline text editor modules.
- Add a dev-only RAF measurement helper or documented manual checklist for the P0 gate.

**Acceptance criteria:**
- Fixture deck can be played manually through all trigger steps.
- Automated tests cover deterministic restoration and equal-order simultaneous steps.
- Presenter renderer import path stays free of editor interaction modules.
- Manual perf note records no visible transition frame drops on the development machine.

**Verification:**
- `pnpm --filter @orbit/web test -- slideshowStepModel`
- `pnpm --filter @orbit/web test -- SlideshowRenderer`
- `pnpm --filter @orbit/web test -- ReadOnlySlideCanvas`
- Manual animation playback and RAF/drop-frame note.

**Dependencies:** Tasks P0.1-P0.7

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/__fixtures__/animationDeck.ts`
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.test.ts`
- `apps/web/src/features/rehearsal/presenter/SlideshowRenderer.test.tsx`
- `apps/web/src/features/slides/rendering/ReadOnlySlideCanvas.test.tsx`
- `apps/web/src/features/rehearsal/presenter/slideshowPerfProbe.ts`
- `apps/web/src/features/rehearsal/presenter/slideshowPerfProbe.test.ts`

**Estimated scope:** Medium

### Checkpoint: P0

- [ ] Manual slideshow playback works with the P0 fixture animation deck.
- [ ] Deterministic restoration tests pass for `(slideId, stepIndex)`.
- [ ] Renderer does not depend on editor interaction code.
- [ ] Background image, grouped elements, images, charts, and custom shapes match editor preview behavior.
- [ ] Persistent highlight state works until explicitly deactivated.
- [ ] Space/ArrowRight/PageDown/Enter/clicker advance steps; ArrowLeft/PageUp move to previous slide with `stepIndex=0`.
- [ ] Reduced-motion mode skips transition frames.
- [ ] Manual RAF/drop-frame note is recorded for the development machine.

### P0 Implementation Notes

- Shared read-only rendering is implemented in `apps/web/src/features/slides/rendering`.
- `RehearsalWorkspace` now uses `SlideshowRenderer` for the main slide preview and exposes a manual "다음 스텝" control plus keyboard shortcuts.
- P0 intentionally passes an empty `triggerAnimationIds` set in production rehearsal UI until P5 connects `CueProvider`; fixture tests pass trigger IDs directly to prove the P0 input port.
- Manual performance verification uses `measureSlideshowFrameCadence` from `apps/web/src/features/rehearsal/presenter/slideshowPerfProbe.ts`.

## P1: Presenter Screen and Slide Window

### Task P1.1: Add `/present/:deckId` Slide Window Route

**Description:** Create a slide-only route that renders the read-only slideshow and waits for BroadcastChannel state.

**Feature/spec:** Slide window is render-only and receives state from presenter window.

**Tech stack:** React route handling in existing `App.tsx`, BroadcastChannel.

**Implementation plan:**
- Add a `present` route for `/present/:deckId`.
- Render a full-viewport slide canvas with no presenter controls.
- Use BroadcastChannel to receive deck snapshot and presenter state.
- Show a waiting/error state if opened without a presenter source.

**Acceptance criteria:**
- The route can render a received deck and state.
- The route does not expose speaker notes, transcript, or presenter controls.

**Verification:**
- `pnpm --filter @orbit/web test -- PresentWindow`
- Manual open route from presenter screen.

**Dependencies:** P0 checkpoint

**Files likely touched:**
- `apps/web/src/App.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`

**Estimated scope:** Medium

### Task P1.2: Implement DisplayManager

**Description:** Open and synchronize the slide-only window, with Chrome Window Management support and fallback guidance.

**Feature/spec:** D1, BroadcastChannel sync, window recovery.

**Tech stack:** Browser `window.open`, Fullscreen API, Window Management API, BroadcastChannel.

**Implementation plan:**
- Implement `DisplayManager` with `openSlideWindow`, `syncState`, `requestFullscreen`, and `recoverWindow`.
- Use `window.getScreenDetails()` only when available.
- Move the slide window to the external display when permission is granted.
- Fall back to a manual placement guide when unsupported or denied.

**Acceptance criteria:**
- Chrome with permission can place the slide window on an external screen.
- Safari/Firefox paths show manual instructions.
- Closing the slide window produces a recoverable warning in the presenter view.

**Verification:**
- `pnpm --filter @orbit/web test -- displayManager`
- Manual Chrome + external monitor test.
- Manual unsupported-browser fallback check.

**Dependencies:** Task P1.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/displayManager.ts`
- `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

**Estimated scope:** Medium

### Task P1.3: Add Single-Screen Fallback Mode

**Description:** Provide a presenter-safe mode when no secondary display is available.

**Feature/spec:** Slide fullscreen plus timer-only mini overlay.

**Tech stack:** React, Fullscreen API, existing timer state.

**Implementation plan:**
- Add a single-screen mode command.
- Render slide fullscreen with a minimal timer overlay.
- Hide notes, transcript, and advice in the slide-only area.

**Acceptance criteria:**
- Single-screen mode works without opening a second window.
- Overlay contains only allowed presenter timing information.

**Verification:**
- `pnpm --filter @orbit/web test -- singleScreen`
- Manual fullscreen fallback smoke test.

**Dependencies:** Task P1.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/SingleScreenPresenter.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

**Estimated scope:** Small

### Checkpoint: P1

- [ ] Presenter and slide windows stay synchronized.
- [ ] Slide window can be recovered after close.
- [ ] Manual fallback paths are visible and usable.

## P2: STT Abstractions

### Task P2.1: Define `LiveSttPort`

**Description:** Replace the current ad hoc Live STT adapter surface with a stable port for browser live control engines.

**Feature/spec:** Browser-only live STT: Sherpa, Moonshine, Web Speech.

**Tech stack:** TypeScript interfaces, Vitest, existing `LiveSttAdapter`.

**Implementation plan:**
- Define `LiveSttPort`, `LiveSttSessionConfig`, `LiveSttResult`, and `LiveSttError`.
- Add capabilities `{ onDevice, streaming, keywordBiasing, languages }`.
- Add an adapter bridge so existing Sherpa implementation can satisfy the port.
- Keep transcript/debug logging rules from `live-stt-keyword-control.md`.

**Acceptance criteria:**
- SpeechTracker can consume only `LiveSttPort`, not Sherpa-specific APIs.
- Current Sherpa path still works through the bridge.

**Verification:**
- `pnpm --filter @orbit/web test -- liveSttPort`

**Dependencies:** None

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.ts`
- `apps/web/src/features/rehearsal/liveStt.ts`

**Estimated scope:** Medium

### Task P2.2: Add WebSpeech and Moonshine Live Adapters

**Description:** Implement additional live engines behind `LiveSttPort`.

**Feature/spec:** WebSpeechAdapter and new MoonshineAdapter.

**Tech stack:** Browser SpeechRecognition API, Web Worker/WASM or ONNX runtime path for Moonshine, existing local model assets.

**Implementation plan:**
- Implement Web Speech adapter with Korean language support and browser support guards.
- Implement a Moonshine adapter as new code using the local Moonshine model asset path.
- Report unsupported runtime as a typed `LiveSttError`.
- Keep both adapters hidden behind settings until contract tests pass.

**Acceptance criteria:**
- Unsupported browsers fail gracefully.
- Both adapters satisfy the same contract tests as Sherpa using mocked engine outputs.
- No server audio upload is introduced for live control.

**Verification:**
- `pnpm --filter @orbit/web test -- webSpeechLiveSttPort`
- `pnpm --filter @orbit/web test -- moonshineLiveSttPort`
- Manual local engine harness for real Moonshine model.

**Dependencies:** Task P2.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/moonshineLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/*.test.ts`
- `apps/web/public/models/live-stt/README.md`

**Estimated scope:** Medium

### Task P2.3: Build Live STT Evaluation Harness

**Description:** Create a repeatable fixture harness for live STT adapters.

**Feature/spec:** Small committed WAV/FLAC fixtures; CI mocks only; real model harness local/manual.

**Tech stack:** Vitest, committed fixtures under the web feature, optional local harness script.

**Implementation plan:**
- Add small Korean fixture audio and expected phrases.
- Add mocked adapter contract tests in CI.
- Add an optional local script/test mode that runs actual Sherpa/Moonshine/WebSpeech when model/browser support exists.
- Record metrics: phrase recall, keyword hit rate, latency.

**Acceptance criteria:**
- CI does not require large ONNX models.
- Fixture data is small enough to commit.
- The same expected scenario can run against all adapters.

**Verification:**
- `pnpm --filter @orbit/web test -- liveSttHarness`
- Manual local harness documented.

**Dependencies:** Task P2.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/__fixtures__/`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.ts`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.test.ts`

**Estimated scope:** Medium

### Task P2.4: WhisperX API Contract Spike

**Description:** Define the external WhisperX hosted API contract before implementing the provider.

**Feature/spec:** Report STT only; no live-control UI selection.

**Tech stack:** Markdown spec, Python worker provider protocol, no external call in CI.

**Implementation plan:**
- Define request shape: auth, audio delivery, language, model, and timeout expectations.
- Define response shape: transcript, language, provider, model, duration, segments with start/end seconds.
- Define error mapping to existing `AudioTranscriptionError`.
- Document privacy and logging constraints.

**Acceptance criteria:**
- Provider implementation can be written from the contract without further product decisions.
- Contract excludes live STT usage.
- No secrets or transcript payloads are logged.

**Verification:**
- Human review of the contract before provider implementation.

**Dependencies:** Task C0.3

**Files likely touched:**
- `docs/specs/whisperx-report-stt-provider.md`
- `services/python-worker/app/audio/transcribe.py`

**Estimated scope:** Small

### Task P2.5: Implement `ReportSttProvider` Selection

**Description:** Extend server report STT to support OpenAI or WhisperX providers.

**Feature/spec:** `REPORT_STT_PROVIDER=openai | whisperx`.

**Tech stack:** Python worker, Pydantic, HTTP client, pytest.

**Implementation plan:**
- Rename or formalize the existing `SpeechToTextProvider` as the report provider contract.
- Keep OpenAI behavior unchanged.
- Add `WhisperXSpeechToTextProvider` using the spike contract.
- Add tests for provider selection, missing config, successful response, provider failure, and timeout.
- Ensure `audio/flac` is accepted by the worker request model.

**Acceptance criteria:**
- `REPORT_STT_PROVIDER=openai` remains backward compatible.
- `REPORT_STT_PROVIDER=whisperx` calls only the configured external endpoint.
- Provider responses normalize to the existing `AudioTranscribeResponse`.

**Verification:**
- `cd services/python-worker && uv run pytest tests/test_audio_transcribe.py tests/test_config.py`

**Dependencies:** Task P2.4

**Files likely touched:**
- `services/python-worker/app/audio/transcribe.py`
- `services/python-worker/tests/test_audio_transcribe.py`
- `services/python-worker/tests/test_config.py`

**Estimated scope:** Medium

### Checkpoint: P2

- [ ] Live STT consumers use `LiveSttPort`.
- [ ] Sherpa, Moonshine, and Web Speech have common contract tests.
- [ ] WhisperX is implemented only as a report provider.
- [ ] Large model tests are local/manual, not required in CI.

## P3: Speech Tracking and Rehearsal Panel

### Task P3.1: Implement PhraseExtractor

**Description:** Extract sentence and phrase matching primitives from speaker notes.

**Feature/spec:** D16 deterministic Korean heuristic.

**Tech stack:** TypeScript pure functions, Vitest.

**Implementation plan:**
- Define `PhraseExtractor` interface and default config.
- Split speaker notes into sentences using punctuation with decimal/ellipsis guards.
- Extract 2-4 word representative phrases.
- Strip known particles only once and only when at least 2 syllables remain.
- Apply symmetric normalization to script and transcript inputs.

**Acceptance criteria:**
- Empty notes produce no crash.
- Last sentence phrase is marked for final-trigger use.
- Config can be swapped without changing SpeechTracker.

**Verification:**
- `pnpm --filter @orbit/web test -- phraseExtractor`

**Dependencies:** None

**Files likely touched:**
- `apps/web/src/features/rehearsal/speech/phraseExtractor.ts`
- `apps/web/src/features/rehearsal/speech/phraseExtractor.test.ts`

**Estimated scope:** Small

### Task P3.2: Implement SpeechTracker

**Description:** Track sentence coverage, final sentence, and keyword hits from Live STT results.

**Feature/spec:** D3-D5, keyword hit/missing, hybrid correction near threshold.

**Tech stack:** TypeScript event emitter or callback port, Vitest fixtures.

**Implementation plan:**
- Consume `LiveSttResult` events.
- Match representative phrases with fuzzy normalization.
- Compute sentence coverage.
- Compute auxiliary word coverage only inside threshold ±10 percentage points.
- Emit `sentence-covered`, `coverage-updated`, `last-sentence-spoken`, `keyword-hit`, `keyword-missing`.

**Acceptance criteria:**
- Transcript fixtures produce expected sentence and keyword events.
- Hybrid correction only applies near threshold.
- Slide exit emits missing keywords.

**Verification:**
- `pnpm --filter @orbit/web test -- speechTracker`

**Dependencies:** Task P2.1, Task P3.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/speech/speechTracker.ts`
- `apps/web/src/features/rehearsal/speech/speechTracker.test.ts`

**Estimated scope:** Medium

### Task P3.3: Add Presenter Settings Store

**Description:** Add global presenter settings for STT engine, advance policy, pace advice, and recording.

**Feature/spec:** D15, `orbit:presenter:global:v1`.

**Tech stack:** localStorage, Zod or defensive parse, React hook.

**Implementation plan:**
- Implement settings schema and default values.
- Store under `orbit:presenter:global:v1`.
- Reserve but do not use deck override namespace.
- Add defensive fallback for corrupt localStorage values.

**Acceptance criteria:**
- Settings survive reload.
- Bad localStorage content resets to defaults without crashing.

**Verification:**
- `pnpm --filter @orbit/web test -- presenterSettings`

**Dependencies:** None

**Files likely touched:**
- `apps/web/src/features/rehearsal/settings/presenterSettings.ts`
- `apps/web/src/features/rehearsal/settings/presenterSettings.test.ts`

**Estimated scope:** Small

### Task P3.4: Replace Rehearsal Panel Internals

**Description:** Rework the current rehearsal side panel around SpeechTracker events.

**Feature/spec:** Timer, keyword checklist, sentence state script, rehearsal-only advice.

**Tech stack:** React, existing `RehearsalWorkspace`, extracted components.

**Implementation plan:**
- Render current slide keywords and hit state.
- Render speaker notes split by sentence with covered state.
- Add full countdown timer using `targetDurationMinutes`.
- Add per-slide elapsed/target timer using `estimatedSeconds` or equal fallback.
- Add rehearsal-only pace and slide overtime badges.

**Acceptance criteria:**
- Live mode hides advice and keeps timer/keyword checklist.
- Rehearsal mode shows advice badges.
- Script panel does not auto-scroll.

**Verification:**
- `pnpm --filter @orbit/web test -- RehearsalPanel`
- Manual rehearsal UI smoke test.

**Dependencies:** Task C0.1, Task P3.2, Task P3.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx`
- `apps/web/src/features/rehearsal/panel/RehearsalPanel.test.tsx`

**Estimated scope:** Medium

### Checkpoint: P3

- [ ] Transcript fixtures drive sentence and keyword state.
- [ ] Rehearsal/live mode differences are visible and tested.
- [ ] Timing fallback works without `estimatedSeconds`.

## P4: Auto Advance

### Task P4.1: Implement PauseDetector

**Description:** Detect speech pauses using RMS and transcript inactivity.

**Feature/spec:** D6, default pause 700ms with config.

**Tech stack:** Web Audio API, existing audio-level utilities, Vitest.

**Implementation plan:**
- Reuse existing audio level calculations where possible.
- Combine RMS silence and no transcript update windows.
- Emit `pause-started` and `speech-resumed`.
- Keep Recorder and Live STT independent of PauseDetector.

**Acceptance criteria:**
- Silence alone does not falsely pause while transcript is actively updating.
- Speech resume cancels pause state.

**Verification:**
- `pnpm --filter @orbit/web test -- pauseDetector`

**Dependencies:** Task P2.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/speech/pauseDetector.ts`
- `apps/web/src/features/rehearsal/speech/pauseDetector.test.ts`

**Estimated scope:** Small

### Task P4.2: Implement AdvanceController

**Description:** Add the auto-advance state machine.

**Feature/spec:** tracking -> ready -> countdown -> advance/cancel, manual override.

**Tech stack:** TypeScript pure state machine, Vitest.

**Implementation plan:**
- Model states and transitions as pure functions.
- Consume coverage, last sentence, pause, resume, manual override, previous slide, last slide.
- Output commands for presenter state store.
- Do not auto-advance when coverage is below threshold.

**Acceptance criteria:**
- 70% plus final sentence plus pause starts countdown.
- Speech resume cancels countdown.
- Manual override always passes immediately.
- Last slide suggests finish instead of advancing.

**Verification:**
- `pnpm --filter @orbit/web test -- advanceController`

**Dependencies:** Task P3.2, Task P4.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/advanceController.ts`
- `apps/web/src/features/rehearsal/advance/advanceController.test.ts`

**Estimated scope:** Small

### Task P4.3: Add Auto-Advance UI and Settings

**Description:** Add presenter-visible countdown, cancel behavior, threshold settings, and manual guidance.

**Feature/spec:** D2, D3, D6.

**Tech stack:** React, presenter settings.

**Implementation plan:**
- Add mode-specific toggles for rehearsal and live.
- Add threshold control from 50 to 95.
- Show countdown only in presenter view.
- Show manual guidance badge when coverage remains low for a configured duration.

**Acceptance criteria:**
- Slide window never shows countdown UI.
- Threshold settings persist globally.
- Guidance badge never forces automatic advance.

**Verification:**
- `pnpm --filter @orbit/web test -- AutoAdvancePanel`
- Manual countdown/cancel smoke test.

**Dependencies:** Task P3.3, Task P4.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/AutoAdvancePanel.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

**Estimated scope:** Medium

### Checkpoint: P4

- [ ] State machine path coverage is complete.
- [ ] Countdown advances and cancels correctly.
- [ ] Manual controls retain priority.

## P5: Speech Cues and Animation Execution

### Task P5.1: Define CueProvider and Internal Config

**Description:** Provide the W1-compatible internal cue source for development, demos, and E2E.

**Feature/spec:** D17.

**Tech stack:** TypeScript schema/validation, Vitest.

**Implementation plan:**
- Define `CueProvider.getCues(slideId)`.
- Mirror the W1 proposed subset:
  `{ slideId, trigger: { phrases }, action: { type, animationId | elementId } }`.
- Validate config at load time.
- Provide empty config as the production default before W1 ships.

**Acceptance criteria:**
- Empty config causes all animations to be entry auto-play by D13.
- Fixture config can mark selected animations as trigger steps.
- W1 loader can replace internal config without changing CueEngine.

**Verification:**
- `pnpm --filter @orbit/web test -- cueProvider`

**Dependencies:** Task P0.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/cues/cueProvider.ts`
- `apps/web/src/features/rehearsal/cues/internalCueConfig.ts`
- `apps/web/src/features/rehearsal/cues/cueProvider.test.ts`

**Estimated scope:** Small

### Task P5.2: Implement CueEngine

**Description:** Execute highlight, animation, and advance cue actions from speech tracker matches.

**Feature/spec:** Highlight toggle, `next-step`, advance AND condition.

**Tech stack:** TypeScript event handling, presenter state store.

**Implementation plan:**
- Consume cue phrases through the same matching normalization as SpeechTracker.
- Emit highlight state changes for `highlight`.
- Emit `next-step` for `animation`.
- Notify AdvanceController for `advance-slide`; never advance on cue alone.

**Acceptance criteria:**
- CueEngine has no dependency on internal config implementation.
- Highlight and animation actions can be tested with a fixture config.
- Advance action remains gated by AdvanceController policy.

**Verification:**
- `pnpm --filter @orbit/web test -- cueEngine`

**Dependencies:** Task P3.2, Task P4.2, Task P5.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/cues/cueEngine.ts`
- `apps/web/src/features/rehearsal/cues/cueEngine.test.ts`

**Estimated scope:** Medium

### Task P5.3: Integrate Cue IDs with Slideshow Step Model

**Description:** Connect cue-referenced animation IDs to P0's trigger step classification.

**Feature/spec:** D13, D17.

**Tech stack:** TypeScript integration tests.

**Implementation plan:**
- Pass `CueProvider` output into the slideshow model.
- Derive the cue-referenced animation ID set per slide.
- Add fixture deck/config with both auto-play and trigger animations.
- Verify config-empty behavior.

**Acceptance criteria:**
- Auto-play animations render on slide entry.
- Cue-referenced animations wait for step execution.
- Empty config behaves as all auto-play.

**Verification:**
- `pnpm --filter @orbit/web test -- slideshowCueIntegration`

**Dependencies:** Task P0.2, Task P5.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/slideshowStepModel.ts`
- `apps/web/src/features/rehearsal/cues/*.test.ts`

**Estimated scope:** Small

### Checkpoint: P5

- [ ] Fixture cue config drives highlight and animation E2E.
- [ ] CueProvider implementation can be swapped without CueEngine changes.
- [ ] W1 absence does not block production playback.

## P6: Recording and Chunk Upload

### Task P6.1: FLAC Encoder Selection Spike

**Description:** Pick the browser FLAC encoding implementation before building Recorder.

**Feature/spec:** FLAC 16kHz mono, Worklet/Worker only, no main-thread blocking.

**Tech stack:** short spike doc, prototype benchmark if needed.

**Implementation plan:**
- Evaluate browser WASM FLAC encoder options.
- Check bundling, worker compatibility, licensing, and memory behavior.
- Record chosen encoder and fallback risks.
- Keep PCM fallback out of P6 MVP.

**Acceptance criteria:**
- A specific encoder path is selected.
- Known limitations and performance risks are documented.
- Implementation can proceed without further library choice.

**Verification:**
- Human review of spike note.

**Dependencies:** None

**Files likely touched:**
- `docs/spikes/presenter-flac-encoder.md`

**Estimated scope:** Small

### Task P6.2: Implement Recorder and IndexedDB Chunk Buffer

**Description:** Capture microphone audio, encode FLAC chunks, and persist them locally until upload.

**Feature/spec:** 16kHz mono FLAC, 30s chunks, tab crash resilience.

**Tech stack:** MediaStream, AudioWorklet, Web Worker/WASM FLAC, IndexedDB.

**Implementation plan:**
- Fork microphone stream independently from Live STT.
- Capture PCM in AudioWorklet.
- Encode FLAC in Worker/WASM.
- Write chunks to IndexedDB with run ID, index, byte size, sha256, and duration.
- Surface encoder errors clearly and stop the recording flow.

**Acceptance criteria:**
- Chunks persist across page reload before upload.
- Main thread is not used for encoding.
- Encoder failure does not produce partial complete requests.

**Verification:**
- `pnpm --filter @orbit/web test -- recorder`
- Manual 2 minute recording smoke test.

**Dependencies:** Task P6.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/recording/recorder.ts`
- `apps/web/src/features/rehearsal/recording/flacEncoder.worker.ts`
- `apps/web/src/features/rehearsal/recording/recordingStore.ts`
- `apps/web/src/features/rehearsal/recording/*.test.ts`

**Estimated scope:** Medium

### Task P6.3: Implement Chunk Upload Client

**Description:** Replace the web upload-url flow with begin/chunk/complete and retry/resume behavior.

**Feature/spec:** New `RecordingUploadPort`.

**Tech stack:** Fetch API, IndexedDB, SHA-256 Web Crypto.

**Implementation plan:**
- Call `POST /api/v1/rehearsals/:runId/audio-begin`.
- Upload each chunk as raw `audio/flac` with `x-orbit-sha256`.
- Call `POST /api/v1/rehearsals/:runId/audio-complete`.
- Handle 409 missing index response by retrying missing chunks.
- Leave run meta upload to the separate meta API task.

**Acceptance criteria:**
- Chunk upload is idempotent.
- Retry resumes from local IndexedDB.
- Old upload-url client path is no longer used for new recordings.

**Verification:**
- `pnpm --filter @orbit/web test -- recordingUpload`

**Dependencies:** Task C0.2, Task P6.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/recording/recordingUploadPort.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P6.4: Implement API Chunk Storage

**Description:** Store incoming chunks as temporary S3/MinIO objects.

**Feature/spec:** temp object storage, sha256 verification, 1 day TTL.

**Tech stack:** NestJS, TypeORM, `StoragePort`, S3/MinIO key conventions.

**Implementation plan:**
- Add `audio-begin` endpoint that claims the run and records upload metadata.
- Add `audio-chunks/:index` endpoint that reads raw body, verifies `x-orbit-sha256`, and stores a temp object.
- Use temp keys under a predictable rehearsal prefix.
- Treat duplicate chunks with matching hash as success.
- Document S3 lifecycle TTL of 1 day for temp chunk prefix; complete success deletes chunks immediately.

**Acceptance criteria:**
- Wrong hash is rejected.
- Duplicate matching chunk is idempotent.
- Chunk size/total size cannot exceed `REHEARSAL_AUDIO_MAX_BYTES`.
- Server logs contain no raw audio or transcript.

**Verification:**
- `pnpm --filter @orbit/api test -- rehearsals`

**Dependencies:** Task C0.2, Task C0.3

**Files likely touched:**
- `apps/api/src/rehearsals/rehearsals.controller.ts`
- `apps/api/src/rehearsals/rehearsals.service.ts`
- `apps/api/src/rehearsals/rehearsal-run.entity.ts`
- `apps/api/src/rehearsals/rehearsals.service.spec.ts`
- `packages/storage/src/index.ts` if direct object read/list helpers are needed

**Estimated scope:** Medium

### Task P6.5: Implement Complete Assembly and Job Trigger

**Description:** Assemble chunks into a final rehearsal audio asset and enqueue `rehearsal-stt`.

**Feature/spec:** `audio-complete`, final `fileId`, run `processing`, existing job path.

**Tech stack:** NestJS, `StoragePort`, TypeORM, Job service.

**Implementation plan:**
- Validate complete manifest and all expected chunk indexes.
- Return 409 with missing indexes when incomplete.
- Assemble chunks into one FLAC object.
- Create/update final `project_assets` row with purpose `rehearsal-audio`.
- Delete temp chunks after successful final storage.
- Enqueue existing `rehearsal-stt` job.

**Acceptance criteria:**
- Complete response is `{ run, job }`.
- Missing chunks return 409 with missing index list.
- Final audio asset is accepted by worker report STT.
- Temp chunks are deleted on success.

**Verification:**
- `pnpm --filter @orbit/api test -- rehearsals`
- `pnpm --filter @orbit/worker test -- rehearsal-stt`

**Dependencies:** Task P6.4, Task P2.5

**Files likely touched:**
- `apps/api/src/rehearsals/rehearsals.service.ts`
- `apps/api/src/files/files.service.ts`
- `apps/worker/src/rehearsal-stt.processor.ts`
- `apps/worker/src/rehearsal-stt.processor.spec.ts`

**Estimated scope:** Medium

### Task P6.6: Add Run Meta API

**Description:** Store slide timeline, missed keywords, and advice events separately from audio completion.

**Feature/spec:** W2 input boundary, no W2 implementation.

**Tech stack:** NestJS, TypeORM JSONB, shared schema.

**Implementation plan:**
- Add `PATCH /api/v1/rehearsals/:runId/meta`.
- Persist run meta in `rehearsal_runs` JSONB column or equivalent migration.
- Validate payload through shared schema.
- Allow repeated calls to update the latest run meta before/after audio complete.

**Acceptance criteria:**
- Meta payload excludes transcript and speaker notes.
- Run report pipeline can read the stored meta later.
- Existing report flow still works when meta is absent.

**Verification:**
- `pnpm --filter @orbit/api test -- rehearsals`
- Migration run/revert test if a DB migration is added.

**Dependencies:** Task C0.2

**Files likely touched:**
- `apps/api/src/database/migrations/*`
- `apps/api/src/rehearsals/rehearsal-run.entity.ts`
- `apps/api/src/rehearsals/rehearsals.controller.ts`
- `apps/api/src/rehearsals/rehearsals.service.ts`
- `apps/api/src/rehearsals/rehearsals.service.spec.ts`

**Estimated scope:** Medium

### Checkpoint: P6

- [ ] 10 minute recording round trip succeeds under 200MB.
- [ ] Chunk missing/duplicate/retry paths pass.
- [ ] Final FLAC is processed by the report STT worker.
- [ ] Temp chunks are deleted on success and have 1 day TTL policy.

## P7: Integration and Handoff

### Task P7.1: Implement PresentationStateBus

**Description:** Emit local presenter state events for downstream consumers and rehearsal logs.

**Feature/spec:** `slide-changed`, `highlight-changed`, `animation-step-changed`, session-relative timestamps.

**Tech stack:** TypeScript event bus, shared realtime schemas where available.

**Implementation plan:**
- Emit local events from presenter state changes.
- Keep network broadcasting out of scope.
- Keep `animation-step-changed` internal until W3 payload agreement.
- Feed slide timeline collection from the same bus.

**Acceptance criteria:**
- Event ordering matches presenter state changes.
- Events contain no transcript, raw audio, or speaker notes.
- Adding a test subscriber does not require state store changes.

**Verification:**
- `pnpm --filter @orbit/web test -- presentationStateBus`

**Dependencies:** P0, P5

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/presentationStateBus.ts`
- `apps/web/src/features/rehearsal/presenter/presentationStateBus.test.ts`

**Estimated scope:** Small

### Task P7.2: Wire Start/Stop Atomic Flow

**Description:** Integrate presenter state, Live STT, recorder, timer, run creation, meta upload, and upload completion.

**Feature/spec:** Rehearsal start/stop controls with rollback on partial failure.

**Tech stack:** React, new ports, API clients.

**Implementation plan:**
- On start, request microphone once and fork to Live STT, PauseDetector, and Recorder.
- Create run before recording begins.
- Start timer and SpeechTracker only after microphone and run are ready.
- On stop, stop Live STT/Recorder, upload run meta, then upload chunks.
- Roll back UI state on microphone/run/encoder begin failure.

**Acceptance criteria:**
- Partial failure leaves no active timer or microphone stream.
- Stopping recording eventually reaches either succeeded or failed state with a clear message.
- Meta upload failure is surfaced without logging sensitive content.

**Verification:**
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual start/stop smoke test.

**Dependencies:** P2, P3, P4, P6

**Files likely touched:**
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/rehearsalApi.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P7.3: Add Integration E2E Scenario

**Description:** Cover the end-to-end presenter path in CI with mocks and small fixtures.

**Feature/spec:** Start -> sentence check -> cue highlight -> auto advance -> animation step -> stop -> upload complete.

**Tech stack:** Playwright or Vitest component tests, mocked Live STT and API where needed.

**Implementation plan:**
- Use a fixture deck with animations, speaker notes, keywords, and internal cue config.
- Mock Live STT result sequence.
- Mock recording chunks or use a tiny committed fixture.
- Assert UI state, presenter state events, upload API calls, and final success state.

**Acceptance criteria:**
- Scenario runs without large STT models.
- It proves the P0/P3/P4/P5/P6 integration path.
- No transcript or speaker notes appear in slide-only route assertions.

**Verification:**
- `pnpm test`
- `pnpm test:smoke` if Playwright is used.

**Dependencies:** Task P7.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/__fixtures__/`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`
- `tests/*` if Playwright smoke is added

**Estimated scope:** Medium

### Task P7.4: Documentation and Final Contract Alignment

**Description:** Bring docs in line with the implemented behavior.

**Feature/spec:** Presenter screen runbook, contracts, local development notes.

**Tech stack:** Markdown.

**Implementation plan:**
- Update `docs/contracts.md` with final audio chunk, meta, state event, and timing fields.
- Update `docs/runbooks/local-development.md` with model/fixture requirements and manual HDMI check.
- Update `docs/conventions/environment.md` with WhisperX and rehearsal audio limit settings.
- Note explicitly that W1/W2/W3 network features are separate.

**Acceptance criteria:**
- A developer can run the feature locally from docs.
- Docs do not imply W1 editor UI or W3 audience gateway is implemented by this PR set.

**Verification:**
- Manual doc review.

**Dependencies:** P0-P7 implementation complete

**Files likely touched:**
- `docs/contracts.md`
- `docs/runbooks/local-development.md`
- `docs/conventions/environment.md`

**Estimated scope:** Small

### Checkpoint: P7

- [ ] Integrated mocked E2E passes in CI.
- [ ] Manual HDMI/display test evidence captured.
- [ ] 10 minute recording/upload/report path succeeds locally.
- [ ] No decision-pending items remain in this implementation plan.

## Parallelization Plan

**Safe to parallelize after Contract Baseline**
- P0 renderer tasks and P2 STT abstractions.
- P6 recorder/API work after chunk schemas are merged.
- P3 PhraseExtractor can start before real Live STT adapters are complete using mocked `LiveSttPort`.

**Must be sequential**
- Contract Baseline before API/web implementation that consumes new schemas.
- P0 step model before P1 slide window and P5 cue animation integration.
- P3 SpeechTracker before P4 AdvanceController.
- P6 API chunk storage before complete assembly.

**Needs coordination**
- C0.1 deck timing schema should be committed first because another owner will populate those fields.
- W1 owner can later replace internal cue config with `deck.slides[].speechCues` without changing CueEngine.
- W3 owner can subscribe to `PresentationStateBus` events later; this work does not broadcast them.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Monolithic `RehearsalWorkspace.tsx` becomes harder to change | High | Extract ports and pure modules first; keep UI rewrites scoped by task |
| Moonshine adapter runtime complexity | Medium | CI uses contract mocks; real engine harness remains local/manual |
| WhisperX hosted API mismatch | High | Require P2.4 contract spike before provider implementation |
| FLAC encoder performance | High | Run P6.1 before Recorder; keep encoding off the main thread |
| Chunk temp object leaks | Medium | Delete on success; use 1 day S3/MinIO TTL for incomplete/failed chunks |
| Auto advance false positives | High | Keep pause + countdown + resume cancel; never advance on cue alone |
| W1 schema changes after internal cue config | Medium | Mirror W1 subset now so later loader swap avoids CueEngine changes |

## Open Questions

None. New ambiguity discovered during implementation should be added to the source spec as a new D# decision before code proceeds.
