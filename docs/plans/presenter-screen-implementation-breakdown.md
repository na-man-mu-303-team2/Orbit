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
  - `REPORT_STT_PROVIDER=openai`
  - `REHEARSAL_AUDIO_MAX_BYTES=25000000`
- A WhisperX external API contract spike before implementation.

**Out of scope**
- W1 editor cue-authoring UI. The editor animation feature and cue editing are owned separately.
- W2 report v2 analytics beyond receiving run meta and preserving the report STT pipeline.
- W3 network broadcasting/audience gateway. This work emits local `PresentationStateBus` events only.
- PCM upload fallback. FLAC is the P6 MVP; PCM fallback remains a follow-up.

## Resolved Implementation Decisions

- `SttPort` is split into `LiveSttPort` for browser live control and `ReportSttProvider` for server report transcription.
- Live STT engines: Sherpa, Moonshine, Web Speech. WhisperX is not selectable for live control.
- Report STT provider: OpenAI. WhisperX calls an external hosted API only after Task P2.11 lands.
- WhisperX implementation starts with a contract spike defining endpoint, auth, audio input, transcript, and segment response shape, but is not selectable in the current runtime config.
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
- P0 manual controls: Space, ArrowRight, PageDown, Enter, and clicker-equivalent key events run `nextStep`; ArrowLeft and PageUp go to the previous slide and restore `stepIndex=0`; the last slide's final step is a no-op until a separate finish UI is added.
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

**Feature/spec:** FLAC upload, future chunk storage cap, begin/chunk/complete APIs, run meta API.

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

**Description:** Add report STT provider validation and rehearsal upload limits.

**Feature/spec:** `REPORT_STT_PROVIDER=openai`, `REHEARSAL_AUDIO_MAX_BYTES`.

**Tech stack:** `packages/shared`, `packages/config`, Python `pydantic`, env docs.

**Implementation plan:**
- Keep `reportSttProviderSchema` openai-only until the WhisperX provider is implemented.
- Add `REHEARSAL_AUDIO_MAX_BYTES` with default/example `25000000`.
- Keep WhisperX env keys out of runtime config until Task P2.11.
- Mirror validation in `services/python-worker/app/config.py`.
- Update `.env.example` and `docs/conventions/environment.md`.

**Acceptance criteria:**
- Existing local config with `REPORT_STT_PROVIDER=openai` still passes.
- `REPORT_STT_PROVIDER=whisperx` fails validation.
- Values above the current OpenAI 25MB limit fail validation.

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
- On slide entry, play cue-unreferenced entry animations once in `order -> delayMs -> array index` order, including the first presenter mount unless a restore-only consumer opts out.
- On trigger step change, play only animations in the newly completed step group.
- Cap each animation duration at `min(animation.durationMs, 500)` while preserving group-relative `delayMs`.
- If state jumps by more than one step, or slide changes during an active transition, cancel intermediate transitions and render the target settled state.
- If `prefers-reduced-motion` is active, bypass transition frames and render the target settled state immediately.

**Acceptance criteria:**
- Transition runtime can be disabled without changing settled output.
- Rapid jumps never leave an element stuck in an intermediate opacity, scale, or rotation.
- Reduced-motion users see immediate final states.
- `rotate` animates transiently and settles to base rotation.
- Entry animation order groups run sequentially; animations with the same order run together.

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
- Render grouped child highlights inside the parent group coordinate space.
- Keep overlay non-listening so it never captures pointer events.
- Keep highlight styling outside the pure settled-state function.
- Ensure hidden elements do not show runtime highlight overlays.
- Keep active highlights visible until the caller sends inactive state.

**Acceptance criteria:**
- Active highlight appears for the target element and remains visible across re-renders.
- Active highlight appears for grouped child elements as well as top-level elements.
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
- `nextStep` increments `stepIndex` until `maxStepIndex`, then requests `nextSlide` unless already on the final slide.
- `nextSlide`, `previousSlide`, and `setSlide` reset `stepIndex=0`.
- Clamp slide index and step index at the command boundary.
- Map Space, ArrowRight, PageDown, Enter, and clicker-equivalent key events to `nextStep`.
- Map ArrowLeft and PageUp to `previousSlide`.
- Ignore keyboard commands when focus is inside editable form controls or interactive controls.

**Acceptance criteria:**
- Manual commands work without Live STT or CueEngine.
- Last step on a non-final slide moves to the next slide and resets `stepIndex=0`; the final slide's last step is a no-op.
- Previous slide restores with `stepIndex=0`.
- Keyboard shortcuts do not fire while focus is in an input, textarea, select, button, link, summary, role-based interactive control, or contenteditable target.

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

### P1 Resolved Decisions

- The slide window uses `/present/:deckId?sessionId=<sessionId>`. `deckId` remains the path identity from the spec, while `sessionId` scopes the BroadcastChannel so two presenter sessions for the same deck do not collide.
- BroadcastChannel payloads use a sanitized render snapshot. The presenter window must not send `speakerNotes`, transcript text, run meta, raw audio references, or presenter-only UI state to the slide window.
- The sanitized deck snapshot keeps only render-required deck shape. `slides[].speakerNotes` is replaced with `""`; `slides[].keywords` is replaced with `[]`; slide elements, animations, style, title, order, canvas, theme, and deck timing fields are preserved.
- If multiple external screens are available, P1 includes a screen picker instead of auto-selecting.
- Fullscreen placement uses an attempt-plus-CTA flow: try automatic placement/fullscreen from the presenter action, then show a slide-window fullscreen CTA if the browser blocks it.
- Connection health uses a 1 second heartbeat and marks the peer stale after 5 seconds without a heartbeat or ready acknowledgement.
- Single-screen fallback overlay shows only total presentation timer and current-slide elapsed/target timer.

### P1 Scope Boundary

**In scope**
- Presenter window controls for opening, placing, monitoring, and recovering the slide-only window.
- Slide-only `/present/:deckId` route with full-viewport `SlideshowRenderer` in `slide-window` mode.
- Session-scoped BroadcastChannel synchronization from presenter window to slide window.
- Sanitized render snapshot generation and tests proving speaker notes/transcript data do not cross the slide-window boundary.
- Window Management API screen picker, placement attempt, fullscreen attempt, and unsupported/denied fallback guidance.
- Single-screen fallback using `SlideshowRenderer` in `single-screen` mode and a timer-only overlay.

**Out of scope**
- Network broadcasting or W3 audience gateway integration.
- Any slide-window input that changes presenter state. The slide window is receive-only in P1.
- STT, auto advance, CueProvider, run meta upload, recording, or report integration.
- Persistent multi-session storage after browser reload. P1 recovers live windows through current in-memory state and channel snapshot replay only.

### Task P1.1: Define Slide Window Channel Contract

**Description:** Define the browser-local contract between the presenter window and the slide-only window before adding UI integration.

**Feature/spec:** D1 BroadcastChannel sync; slide window is render-only; sanitized render snapshot; session-scoped channel.

**Tech stack:** TypeScript, browser `BroadcastChannel`, Vitest, existing `Deck` and presenter state types.

**Implementation plan:**
- Add `presentationChannel.ts` under `apps/web/src/features/rehearsal/presenter`.
- Add `createPresentationSessionId()` using browser-safe randomness.
- Add `getPresentationChannelName({ deckId, sessionId })`.
- Add `createSlideWindowDeckSnapshot(deck)` that preserves render-required deck fields but replaces `slides[].speakerNotes` with `""` and `slides[].keywords` with `[]`.
- Define message types:
  - `presenter-snapshot`: `{ deckId, sessionId, deck, state, triggerAnimationIds, sentAt }`
  - `presenter-state`: `{ deckId, sessionId, state, triggerAnimationIds, sentAt }`
  - `presenter-heartbeat`: `{ deckId, sessionId, sentAt }`
  - `slide-window-ready`: `{ deckId, sessionId, sentAt }`
  - `slide-window-heartbeat`: `{ deckId, sessionId, sentAt }`
- Ignore messages whose `deckId` or `sessionId` does not match the current route/session.
- Keep the channel module free of React so it can be unit-tested with a fake channel.

**Acceptance criteria:**
- Channel names are deterministic for a given `{deckId, sessionId}` and distinct across session IDs.
- Sanitized snapshots preserve slide rendering inputs and remove speaker notes/keywords.
- Message guards reject wrong deck/session messages.
- No transcript, run meta, raw audio, or speaker notes field is present in channel payload tests.

**Verification:**
- `pnpm --filter @orbit/web test -- presentationChannel`

**Dependencies:** P0 checkpoint

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.test.ts`

**Estimated scope:** Small

### Task P1.2: Add `/present/:deckId` Slide Window Route

**Description:** Create the slide-only route that waits for a matching presenter session, renders the sanitized deck snapshot, and exposes only slide-window-safe states.

**Feature/spec:** `/present/:deckId?sessionId=<sessionId>`; slide window receive-only; full-viewport slideshow.

**Tech stack:** Existing `App.tsx` route union, React, `SlideshowRenderer`, BroadcastChannel wrapper from Task P1.1, Testing Library/Vitest.

**Implementation plan:**
- Extend `Route` and `getRoute()` in `App.tsx` with `{ name: "present"; deckId; sessionId? }`.
- Exclude the `present` route from `AppFrame`.
- Add `PresentWindow.tsx`.
- Parse `sessionId` from query string. If missing, render a waiting/error state that says the route must be opened from presenter mode.
- On mount, open the matching channel and send `slide-window-ready`.
- Render waiting state until the first `presenter-snapshot` arrives.
- Render `SlideshowRenderer` with `renderMode="slide-window"`, `scale` sized to the viewport, received `state.slideId`, `state.stepIndex`, received `triggerAnimationIds`, and received `state.highlights`.
- Add a fullscreen CTA that is visible only when automatic fullscreen fails or has not yet been granted.
- Do not render notes, transcript, checklist, controls, debug transcript, run IDs, or presenter panel content.

**Acceptance criteria:**
- Direct route open without `sessionId` does not render a deck or any presenter data.
- Route open with a matching session renders the received slide and step state.
- Wrong-session messages do not update the route.
- The route has no presenter controls and no notes/transcript output.
- Fullscreen CTA calls `requestFullscreen()` only from a user action.

**Verification:**
- `pnpm --filter @orbit/web test -- PresentWindow`
- `pnpm --filter @orbit/web test -- App`
- Manual route smoke test from a presenter-opened window.

**Dependencies:** Task P1.1

**Files likely touched:**
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.test.tsx`
- `apps/web/src/styles.css`

**Estimated scope:** Medium

### Task P1.3: Publish Presenter State to the Slide Window

**Description:** Wire the existing P0 presenter state into the channel so slide-window rendering stays synchronized with manual presenter navigation.

**Feature/spec:** BroadcastChannel state sync; renderer is a function of `{slideId, stepIndex, highlights}`; slide-window recovery uses snapshot replay.

**Tech stack:** React hooks, `presentationChannel.ts`, existing `presenterStateStore`, existing `createSlideshowAnimationPlan`.

**Implementation plan:**
- Add `usePresentationChannelPublisher` or an equivalent small hook under `features/rehearsal/presenter`.
- In `RehearsalWorkspace`, create one `sessionId` per presenter-screen lifecycle after a deck is loaded.
- Broadcast an initial `presenter-snapshot` whenever the slide window reports ready.
- Broadcast `presenter-state` whenever `slideId`, `slideIndex`, `stepIndex`, `highlights`, or `triggerAnimationIds` changes.
- Keep the current manual controls as the only state mutators in P1.
- Do not send live transcript buffer, `speakerNotes`, checklist state, run state, audio state, or report state.
- Add a small presenter-side status model: `idle`, `opening`, `connected`, `stale`, `closed`, `unsupported`, `failed`.

**Acceptance criteria:**
- Slide window updates after manual next-step, next-slide, previous-slide, and thumbnail slide selection.
- A newly opened slide window receives the latest full snapshot, not just subsequent deltas.
- Presenter state messages contain only sanitized deck/state fields.
- Existing P0 manual keyboard behavior is unchanged.

**Verification:**
- `pnpm --filter @orbit/web test -- presentationChannel`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual two-window sync smoke test.

**Dependencies:** Tasks P1.1, P1.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.ts`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.test.tsx`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P1.4: Implement `DisplayManager` Browser Port

**Description:** Implement the browser API boundary that opens the slide window, detects Window Management support, requests screen details, attempts placement/fullscreen, and reports recoverable failure states.

**Feature/spec:** D1 `window.open`, Fullscreen API, Chrome Window Management API, unsupported/denied fallback.

**Tech stack:** TypeScript, injectable browser port for tests, `window.open`, structural types for `getScreenDetails`, `ScreenDetailed`, `moveTo`, `resizeTo`, `focus`, and `requestFullscreen`.

**Implementation plan:**
- Add `displayManager.ts` with an injected `DisplayBrowserPort` so unit tests do not rely on real browser windows.
- Add capabilities detection:
  - `canOpenWindow`
  - `canUseWindowManagement`
  - `canRequestFullscreen`
- Add `openSlideWindow({ deckId, sessionId })` that builds `/present/:deckId?sessionId=<sessionId>`.
- Add `listExternalScreens()` that requests `getScreenDetails()` only after a presenter user action.
- Return screen descriptors for the UI picker: stable index, label if available, `isPrimary`, `left`, `top`, `width`, `height`.
- Add `placeOnScreen(windowRef, screen)` that attempts `moveTo`, `resizeTo`, `focus`, then reports success/failure without throwing to the UI.
- Add `requestSlideWindowFullscreen(windowRef)` as best effort. If blocked, the slide route's CTA remains the fallback.
- Normalize errors into user-safe codes: `popup-blocked`, `window-management-unsupported`, `permission-denied`, `placement-failed`, `fullscreen-blocked`.

**Acceptance criteria:**
- Popup-blocked, unsupported, permission-denied, placement-failed, and fullscreen-blocked paths are distinguishable.
- Browser API calls happen only from presenter-initiated actions.
- No hard dependency on Chrome-only types breaks TypeScript in non-Chrome environments.
- DisplayManager never logs secrets, transcripts, speaker notes, or raw deck payloads.

**Verification:**
- `pnpm --filter @orbit/web test -- displayManager`

**Dependencies:** Task P1.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/displayManager.ts`
- `apps/web/src/features/rehearsal/presenter/displayManager.test.ts`

**Estimated scope:** Medium

### Task P1.5: Add Presenter Display Controls and Screen Picker

**Description:** Add presenter-visible controls for opening the slide window, selecting an external display when multiple screens are available, and showing actionable fallback guidance.

**Feature/spec:** Window Management API permission flow; multiple external screens use a picker; Safari/Firefox/manual fallback guide.

**Tech stack:** React, lucide icons, existing rehearsal topbar/layout styles, `DisplayManager`.

**Implementation plan:**
- Add `DisplayControls.tsx`.
- Add an "open slide window" button in `RehearsalWorkspace` near existing presenter controls.
- On click, create/reuse the session ID, open the slide window, and publish a snapshot.
- If Window Management is supported, request screen details and render a screen picker when more than one external screen is available.
- For a single external screen, allow one-click placement without rendering the picker.
- For unsupported/denied browsers, show inline guidance to move the opened slide window to the presentation monitor and enter fullscreen manually.
- Keep controls outside the slide-window route.
- Avoid a decorative or card-heavy layout; this is an operational control surface.

**Acceptance criteria:**
- User can open a slide window from presenter mode.
- If multiple external screens are detected, the user can choose the target screen before placement.
- Unsupported or denied browser path shows manual placement guidance.
- Closing/reopening controls do not reset the current slide or `stepIndex`.
- Display controls do not expose notes, transcript, or run data.

**Verification:**
- `pnpm --filter @orbit/web test -- DisplayControls`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual Chrome display picker smoke test with mocked or real multiple screens.
- Manual Safari/Firefox fallback check.

**Dependencies:** Tasks P1.3, P1.4

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`
- `apps/web/src/features/rehearsal/presenter/DisplayControls.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`
- `apps/web/src/styles.css`

**Estimated scope:** Medium

### Task P1.6: Add Heartbeat, Stale Detection, and Recovery

**Description:** Detect slide-window close/stale states within the P1 gate and provide one-click recovery that restores the current slide and step.

**Feature/spec:** Window close or monitor detach detection; warning plus one-click reopen; state jump restoration within 5 seconds.

**Tech stack:** BroadcastChannel heartbeat, `windowRef.closed` polling as a secondary signal, React status state, fake timers in Vitest.

**Implementation plan:**
- Send `presenter-heartbeat` every 1 second while a slide window session is active.
- Send `slide-window-heartbeat` every 1 second after `PresentWindow` has joined a session.
- Mark peer stale if no ready/heartbeat message has been seen for 5 seconds.
- Poll `windowRef.closed` as an additional immediate closed signal when a `Window` reference exists.
- Show a recoverable warning in presenter mode for stale or closed slide windows.
- Add a "reopen slide window" action that reuses the existing `sessionId` and immediately publishes a full sanitized snapshot.
- Keep stale state recoverable; do not stop the presenter state store or reset current slide state.
- If monitor placement fails after reopen, keep the slide window open and show manual placement guidance.

**Acceptance criteria:**
- Closing the slide window produces a recoverable warning within 5 seconds.
- Reopening restores the latest `{slideId, stepIndex, highlights}`.
- Heartbeat timers are cleaned up on unmount.
- Wrong-session heartbeats are ignored.

**Verification:**
- `pnpm --filter @orbit/web test -- presentationChannel`
- `pnpm --filter @orbit/web test -- DisplayControls`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual close-and-reopen smoke test.

**Dependencies:** Tasks P1.3, P1.5

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.ts`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`

**Estimated scope:** Medium

### Task P1.7: Add Single-Screen Fallback Mode

**Description:** Provide a presenter-safe fallback when no second display is available or the user chooses not to open a slide window.

**Feature/spec:** Single screen fallback = slide fullscreen plus timer-only mini overlay.

**Tech stack:** React, Fullscreen API, existing timer state, `SlideshowRenderer` `renderMode="single-screen"`.

**Implementation plan:**
- Add `SingleScreenPresenter.tsx`.
- Add a presenter control to enter single-screen mode without opening a second window.
- Render the current slide with `SlideshowRenderer` in `single-screen` mode.
- Request fullscreen from the user action and keep a visible CTA if fullscreen is blocked.
- Render only:
  - total presentation elapsed/remaining timer
  - current slide elapsed/target timer
- Hide speaker notes, transcript, keyword checklist, advice, run state, recording state, and presenter controls while in slide fullscreen.
- Exit single-screen mode on Escape/fullscreen exit and return to the normal presenter layout without resetting current slide state.

**Acceptance criteria:**
- Single-screen mode works without BroadcastChannel or a second window.
- Overlay contains only the approved timer fields.
- Exiting fullscreen restores the normal presenter view and preserves slide/step state.
- No notes/transcript/advice/checklist content is mounted in single-screen mode.

**Verification:**
- `pnpm --filter @orbit/web test -- SingleScreenPresenter`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- Manual fullscreen fallback smoke test.

**Dependencies:** Task P1.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/SingleScreenPresenter.tsx`
- `apps/web/src/features/rehearsal/presenter/SingleScreenPresenter.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/styles.css`

**Estimated scope:** Medium

### Task P1.8: Add P1 Verification Harness and Manual Gate Checklist

**Description:** Add automated coverage for the two-window contract and a manual checklist for real HDMI/browser behavior that cannot be fully proven in unit tests.

**Feature/spec:** P1 gate: presenter and slide windows synchronized, Chrome automatic placement with picker, Safari/Firefox fallback, slide window close recovery within 5 seconds.

**Tech stack:** Vitest, Testing Library, existing Playwright smoke setup in `tests/e2e`, manual QA notes.

**Implementation plan:**
- Add route/channel integration tests that simulate presenter and slide-window messages.
- Add privacy regression tests asserting slide-window DOM and channel payloads do not contain fixture `speakerNotes` or transcript strings.
- Add stale/recovery tests with fake timers.
- Add a manual checklist under the P1 checkpoint for:
  - Chrome + one external display
  - Chrome + multiple external displays and screen picker
  - Safari or Firefox fallback
  - popup blocked path
  - slide window forced close and recovery within 5 seconds
- Add `tests/e2e/presenter-screen.spec.ts` with one focused multi-page synchronization test: open presenter mode, open slide window, assert the slide-window page receives the current slide, advance one step/slide, and assert the slide-window page updates.

**Acceptance criteria:**
- Automated tests cover route boot, channel sync, stale detection, recovery, and privacy boundaries.
- Manual checklist is explicit enough for a reviewer to repeat.
- For this implementation pass, automated tests are the required gate; real HDMI and Safari/Firefox fallback checks remain explicit but are deferred for user-run validation.

**Verification:**
- `pnpm --filter @orbit/web test -- presentationChannel`
- `pnpm --filter @orbit/web test -- PresentWindow`
- `pnpm --filter @orbit/web test -- DisplayControls`
- `pnpm --filter @orbit/web test -- SingleScreenPresenter`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- `pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts`
- Manual P1 gate checklist.

**Dependencies:** Tasks P1.1-P1.7

**Files likely touched:**
- `apps/web/src/features/rehearsal/presenter/*.test.ts`
- `apps/web/src/features/rehearsal/presenter/*.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`
- `tests/e2e/presenter-screen.spec.ts`
- `docs/plans/presenter-screen-implementation-breakdown.md`

**Estimated scope:** Small

### Checkpoint: P1

- [ ] `/present/:deckId?sessionId=<sessionId>` renders only after receiving a matching sanitized presenter snapshot.
- [ ] BroadcastChannel payload tests prove `speakerNotes`, transcript text, run meta, and raw audio references do not cross into the slide window.
- [ ] Presenter and slide windows stay synchronized across next-step, next-slide, previous-slide, thumbnail selection, and highlight state changes.
- [ ] Chrome automatic placement works after selecting an external display from the screen picker.
- [ ] Fullscreen attempt falls back to a slide-window CTA when blocked.
- [ ] Safari/Firefox or unsupported API paths show manual placement/fullscreen guidance.
- [ ] Slide window close/stale state is detected within 5 seconds and one-click reopen restores the latest slide and step.
- [ ] Single-screen fallback works without opening a second window and shows only total plus current-slide timer information.
- [ ] Manual HDMI/browser gate notes are deferred for later user-run validation.

### P1 Implementation Notes

- The slide-window route is implemented in `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx` and is routed from `apps/web/src/App.tsx` as `/present/:deckId?sessionId=<sessionId>`.
- Browser-local sync is implemented in `presentationChannel.ts` and `usePresentationChannelPublisher.ts`. The channel is session-scoped and sends sanitized deck snapshots where `slides[].speakerNotes` is `""` and `slides[].keywords` is `[]`.
- Display opening, screen discovery, placement, fullscreen attempts, and typed fallback errors are isolated in `displayManager.ts`; presenter UI controls live in `DisplayControls.tsx`.
- Slide-window recovery uses presenter and slide-window heartbeat messages. The presenter marks the peer `stale` after 5 seconds without a matching ready/heartbeat message and exposes a recoverable reopen action.
- Single-screen fallback is implemented in `SingleScreenPresenter.tsx`. It replaces the normal presenter layout while active and renders only total time plus current-slide elapsed/target time over the slide.
- Automated P1 coverage now includes `presentationChannel`, `PresentWindow`, `usePresentationChannelPublisher`, `displayManager`, `DisplayControls`, `SingleScreenPresenter`, `RehearsalWorkspace`, and `tests/e2e/presenter-screen.spec.ts`.
- `tests/e2e/presenter-screen.spec.ts` covers real browser popup synchronization, slide changes, slide-window privacy guards, unsupported/manual-placement fallback guidance, injected multi-display screen picker behavior, forced close detection, and one-click reopen restoration to the latest slide.
- Manual HDMI/browser gate is intentionally deferred for later user-run validation. Automated verification currently covers popup synchronization, privacy guards, unsupported/manual-placement fallback guidance, injected multi-display picker behavior, forced close detection, and one-click reopen restoration.

## P2: STT Abstractions

### P2 Scope Clarifications

- This milestone follows the resolved split in this breakdown: browser live control uses `LiveSttPort`; server report transcription uses `ReportSttProvider`.
- WhisperX is report-only. It is not selectable for live control and does not appear in presenter STT engine settings.
- New browser STT files live under `apps/web/src/features/rehearsal/stt`. Existing root-level rehearsal STT files move only when a task explicitly requires it.
- Browser live engine selection is modeled as `presenterSettings.sttEngine`; this milestone defines the engine ids and factory boundary, while the P3 presenter settings store owns localStorage persistence.
- `LIVE_STT_PROVIDER` remains server/runtime config with the current `sherpa` value; P2 does not expand it to Web Speech or Moonshine.
- `LiveSttSessionConfig.audioSource` is a `MediaStream`, matching the current Sherpa adapter and the later microphone fork used by Live STT, PauseDetector, and Recorder.
- `LiveSttPort.updateBiasPhrases(phrases)` is required. Engines without native keyword biasing keep the method as a no-op and rely on SpeechTracker client-side matching.
- Web Speech is treated as `onDevice: false` for consent purposes because browser implementations can use remote recognition. Selecting it must pass the same user consent gate as any non-local live engine.
- Moonshine is a new manifest-based local model adapter under `/models/live-stt/moonshine/.../manifest.json`. CI uses mocked runtime output; real model execution is local/manual.
- WhisperX uses an Orbit-defined hosted API contract with `WHISPERX_API_URL`, `WHISPERX_API_KEY`, `WHISPERX_MODEL`, and `WHISPERX_TIMEOUT_MS`; auth is `Authorization: Bearer ...`; audio is sent as `multipart/form-data`.

### Task P2.1: Define `LiveSttPort` Contract

**Description:** Replace the current ad hoc Live STT adapter surface with a stable port for browser live control engines.

**Feature/spec:** Browser-only live STT: Sherpa, Moonshine, Web Speech. `LiveSttPort` is not used by report transcription.

**Tech stack:** TypeScript interfaces, Vitest, existing `LiveSttAdapter` event shapes.

**Implementation plan:**
- Create `apps/web/src/features/rehearsal/stt/liveSttPort.ts`.
- Define `LiveSttEngineId = "sherpa" | "web-speech" | "moonshine"`.
- Define `LiveSttCapabilities = { onDevice, streaming, keywordBiasing, languages }`.
- Define `LiveSttSessionConfig = { language: "ko"; audioSource: MediaStream; biasPhrases?: string[] }`.
- Define `LiveSttResult = { text, isFinal, timestampMs, confidence? }` where `timestampMs` is session-relative `[startMs, endMs]`.
- Define `LiveSttError` with typed codes for unsupported runtime, missing model, permission/consent, start failure, and provider runtime failure.
- Define the port methods: `start(config)`, `stop()`, `updateBiasPhrases(phrases)`, `onResult(cb)`, `onError(cb)`, and `dispose()`.
- Add a small result mapper so current `LiveSttPartialTranscriptEvent` payloads can be converted without changing shared schemas in this task.
- Keep transcript/debug logging rules from `live-stt-keyword-control.md`.

**Acceptance criteria:**
- The port can represent partial and final Korean recognition results without exposing engine-specific objects.
- Bias phrases are part of the contract and can be updated after `start`.
- The contract does not include raw audio, transcript storage, or report STT fields.
- SpeechTracker can be implemented against `LiveSttPort` only.

**Verification:**
- `pnpm --filter @orbit/web test -- liveSttPort`

**Dependencies:** None

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/liveSttPort.test.ts`
- `apps/web/src/features/rehearsal/liveStt.ts`

**Estimated scope:** Small

### Task P2.2: Bridge Sherpa to `LiveSttPort`

**Description:** Wrap the existing Sherpa implementation so the current live STT path works through the new port before adding engines.

**Feature/spec:** Existing Sherpa live recognition, current bias context behavior, current debug/privacy rules.

**Tech stack:** TypeScript, current `SherpaOnnxLiveSttAdapter`, Vitest.

**Implementation plan:**
- Add `sherpaLiveSttPort.ts` that adapts `SherpaOnnxLiveSttAdapter` to `LiveSttPort`.
- Map `LiveSttSessionConfig.biasPhrases` into the existing `LiveSttBiasContext` shape.
- Map `updateBiasPhrases` to the current `updateBiasContext` path.
- Map `LiveSttAdapterError` codes into `LiveSttError`.
- Preserve existing debug latency, transcript debug gate, PCM debug, and audio level internals without adding them to the public port.
- Keep `SherpaOnnxLiveSttAdapter` available for old tests until the consumer migration task removes direct usage.

**Acceptance criteria:**
- The existing Sherpa start/stop path still works through the bridge.
- Sherpa declares `onDevice: true`, `streaming: true`, `keywordBiasing: true`, and Korean language support.
- Existing transcript debug logging remains gated behind `orbit.liveStt.debugLatency`.
- No server request is introduced for live control.

**Verification:**
- `pnpm --filter @orbit/web test -- sherpaLiveSttPort`
- `pnpm --filter @orbit/web test -- sherpaOnnxLiveSttAdapter`

**Dependencies:** Task P2.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/sherpaOnnxLiveSttAdapter.ts`
- `apps/web/src/features/rehearsal/liveStt.ts`

**Estimated scope:** Small

### Task P2.3: Add Live STT Contract Test Kit

**Description:** Create reusable contract tests that every `LiveSttPort` implementation must pass.

**Feature/spec:** Same result semantics, stop behavior, bias update behavior, and typed error behavior across Sherpa, Web Speech, and Moonshine.

**Tech stack:** Vitest, fake `MediaStream`, mocked engine outputs.

**Implementation plan:**
- Add `liveSttPortContract.ts` test helper that accepts a port factory and scripted engine output.
- Cover `start`, `stop`, `onResult` unsubscribe, `onError` unsubscribe, `updateBiasPhrases`, and post-stop stale result suppression.
- Cover partial-to-final ordering and session-relative timestamps.
- Cover unsupported runtime and missing model errors without requiring real browser APIs or models.
- Keep fixture transcripts small and free of speaker notes or private script text.

**Acceptance criteria:**
- Sherpa bridge passes the shared contract tests.
- New adapters can opt into the same test helper with adapter-specific mocked runtime.
- CI does not require microphone access, Web Speech support, ONNX files, or Moonshine model files.

**Verification:**
- `pnpm --filter @orbit/web test -- liveSttPortContract`

**Dependencies:** Task P2.1, Task P2.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/liveSttPortContract.test.ts`
- `apps/web/src/features/rehearsal/stt/testDoubles.ts`
- `apps/web/src/features/rehearsal/stt/sherpaLiveSttPort.test.ts`

**Estimated scope:** Small

### Task P2.4: Add Engine Registry and Rehearsal Consumer Seam

**Description:** Route the current rehearsal live STT consumer through `LiveSttPort` while keeping the default Sherpa behavior.

**Feature/spec:** Engine ids for `presenterSettings.sttEngine`, default `sherpa`, no `LIVE_STT_PROVIDER` expansion.

**Tech stack:** React, TypeScript, current `RehearsalWorkspace`, Vitest/Testing Library.

**Implementation plan:**
- Add `liveSttEngineRegistry.ts` with `createLiveSttPort(engineId)` and default `sherpa`.
- Export the engine id type for the P3 presenter settings store.
- Keep browser live engine selection separate from `packages/shared` runtime config and Python `LIVE_STT_PROVIDER`.
- Update `RehearsalWorkspace` or its start-live-STT seam to accept a `LiveSttPort` test double.
- Convert current callbacks to `onResult`/`onError` subscriptions and call `updateBiasPhrases` when the active slide changes.
- Keep UI copy and existing manual live demo behavior unchanged in this task.

**Acceptance criteria:**
- Rehearsal live STT starts through `LiveSttPort`, not directly through `LiveSttAdapter`.
- Existing tests can inject a fake `LiveSttPort`.
- Default runtime behavior remains Sherpa.
- No API, Worker, or env config changes are required for live engine switching.

**Verification:**
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- `pnpm --filter @orbit/web test -- liveSttEngineRegistry`

**Dependencies:** Task P2.1, Task P2.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts`
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P2.5: Add Web Speech Live Adapter

**Description:** Implement Web Speech behind `LiveSttPort` with explicit browser support and consent handling.

**Feature/spec:** Web Speech live adapter, Korean language, non-local consent gate.

**Tech stack:** Browser `SpeechRecognition` / `webkitSpeechRecognition`, TypeScript browser API guards, Vitest with mocked recognition object.

**Implementation plan:**
- Add `webSpeechLiveSttPort.ts`.
- Detect `SpeechRecognition` or `webkitSpeechRecognition`; report `unsupported_runtime` when absent.
- Declare capabilities `{ onDevice:false, streaming:true, keywordBiasing:false, languages:["ko"] }`.
- Require an explicit consent flag in adapter construction or start options before starting because `onDevice:false`.
- Set recognition language to Korean and emit `LiveSttResult` for interim/final results.
- Treat `updateBiasPhrases` as a no-op and rely on SpeechTracker matching.
- Map browser recognition errors to typed `LiveSttError` without logging transcript text.

**Acceptance criteria:**
- Unsupported browsers fail gracefully before attempting recognition.
- Starting without the required consent fails with a typed permission/consent error.
- Interim and final mocked recognition events produce normalized `LiveSttResult` values.
- Web Speech passes the common `LiveSttPort` contract tests.

**Verification:**
- `pnpm --filter @orbit/web test -- webSpeechLiveSttPort`
- Manual Chrome smoke test with Korean recognition when available.

**Dependencies:** Task P2.1, Task P2.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/webSpeechLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/browserSpeechRecognition.ts`

**Estimated scope:** Medium

### Task P2.6: Define Moonshine Manifest and Runtime Loader

**Description:** Add the local model manifest contract and loader boundary needed by the Moonshine adapter.

**Feature/spec:** Manifest-based local Moonshine model under `/models/live-stt/moonshine/.../manifest.json`.

**Tech stack:** TypeScript manifest parser, Zod or defensive validation, Web Worker loader test doubles.

**Implementation plan:**
- Add `moonshineManifest.ts` with a manifest shape for model id, runtime files, model files, sample rate, supported language, and version.
- Add default manifest URL under `/models/live-stt/moonshine/korean/manifest.json`.
- Add `apps/web/public/models/live-stt/moonshine/README.md` explaining that large model/runtime assets are not committed.
- Add a loader that fetches and validates the manifest without instantiating the real model.
- Mirror the existing Sherpa manifest test pattern for missing fields, invalid URLs, and unsupported language/sample rate.

**Acceptance criteria:**
- The adapter can load a valid manifest and reject malformed ones before starting recognition.
- Large Moonshine model artifacts are not committed.
- The README gives the exact local asset directory and manifest filename expected by the adapter.

**Verification:**
- `pnpm --filter @orbit/web test -- moonshineManifest`

**Dependencies:** Task P2.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/moonshineManifest.ts`
- `apps/web/src/features/rehearsal/stt/moonshineManifest.test.ts`
- `apps/web/public/models/live-stt/moonshine/README.md`

**Estimated scope:** Small

### Task P2.7: Add Moonshine Live Adapter

**Description:** Implement the Moonshine live adapter against the manifest loader and `LiveSttPort`.

**Feature/spec:** Local Moonshine live recognition, mocked in CI, real model only in local/manual harness.

**Tech stack:** TypeScript, Web Worker boundary, local model manifest from Task P2.6, Vitest mocked runtime.

**Implementation plan:**
- Add `moonshineLiveSttPort.ts`.
- Use the manifest loader from Task P2.6.
- Run recognition inside a worker-like boundary so the main thread is not blocked.
- Declare capabilities `{ onDevice:true, streaming:false, keywordBiasing:false, languages:["ko"] }` for the first implementation.
- Implement pseudo-streaming by emitting final segment results for short buffered windows; leave native streaming as a future adapter optimization.
- Treat `updateBiasPhrases` as a no-op and rely on SpeechTracker matching.
- Map model missing, worker load, and runtime failures to typed `LiveSttError`.
- Register the adapter in `liveSttEngineRegistry`.

**Acceptance criteria:**
- Moonshine passes common contract tests with mocked runtime output.
- Missing local model assets produce a typed missing-model error.
- The adapter does not require server audio upload or remote STT calls.
- Registry can create Moonshine by `sttEngine="moonshine"`.

**Verification:**
- `pnpm --filter @orbit/web test -- moonshineLiveSttPort`
- Manual local Moonshine model harness from Task P2.8

**Dependencies:** Task P2.1, Task P2.3, Task P2.6

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/moonshineLiveSttPort.ts`
- `apps/web/src/features/rehearsal/stt/moonshineLiveSttPort.test.ts`
- `apps/web/src/features/rehearsal/stt/moonshineWorker.ts`
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts`

**Estimated scope:** Medium

### Task P2.8: Build Live STT Evaluation Harness

**Description:** Create a repeatable fixture harness for live STT adapters.

**Feature/spec:** Small committed WAV/FLAC fixtures; CI mocked adapters; real Sherpa/Web Speech/Moonshine execution local/manual.

**Tech stack:** Vitest, committed fixtures under the web feature, optional local harness script, JSON metrics output.

**Implementation plan:**
- Add small Korean fixture metadata and expected phrases. Audio fixtures must be short and safe to commit; if real audio is not committed, use deterministic mocked transcript fixtures in CI.
- Add a harness runner that accepts any `LiveSttPort` factory.
- Record metrics: phrase recall, keyword hit rate, first partial latency, first final latency, and error code.
- Add mocked adapter runs in CI.
- Add an optional local script/test mode that runs actual Sherpa/Moonshine/WebSpeech when model/browser support exists.
- Document how to place local model assets before running the real-engine harness.

**Acceptance criteria:**
- CI does not require large ONNX models.
- Fixture data is small enough to commit.
- The same expected scenario can run against all adapters.
- Harness output is deterministic for mocked adapters.
- Real-engine harness is clearly marked local/manual and does not block CI.

**Verification:**
- `pnpm --filter @orbit/web test -- liveSttHarness`
- Manual local harness documented.

**Dependencies:** Task P2.3, Task P2.5, Task P2.7

**Files likely touched:**
- `apps/web/src/features/rehearsal/stt/__fixtures__/`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.ts`
- `apps/web/src/features/rehearsal/stt/liveSttHarness.test.ts`
- `apps/web/src/features/rehearsal/stt/README.md`
- `apps/web/package.json`

**Estimated scope:** Medium

### Task P2.9: Write WhisperX Report STT API Contract

**Description:** Define the external WhisperX hosted API contract before implementing the provider.

**Feature/spec:** Report STT only; no live-control UI selection.

**Tech stack:** Markdown spec, Python worker provider protocol, no external call in CI.

**Implementation plan:**
- Add `docs/specs/whisperx-report-stt-provider.md`.
- Define env keys: `WHISPERX_API_URL`, `WHISPERX_API_KEY`, `WHISPERX_MODEL`, `WHISPERX_TIMEOUT_MS`.
- Define auth: `Authorization: Bearer <WHISPERX_API_KEY>`.
- Define request: `multipart/form-data` with `file`, `language`, `model`, and optional `diarization=false`.
- Define response: `transcript`, `language`, `provider`, `model`, `durationSeconds`, and `segments[{ text, startSeconds, endSeconds }]`.
- Define error mapping to existing `AudioTranscriptionError`.
- Document privacy and logging constraints.
- Document that this provider never receives live-control microphone streams; it only receives assembled rehearsal audio from P6.

**Acceptance criteria:**
- Provider implementation can be written from the contract without further product decisions.
- Contract excludes live STT usage.
- No secrets or transcript payloads are logged.
- Timeout, auth failure, malformed response, empty transcript, and provider 5xx mappings are specified.

**Verification:**
- Human review of the contract before provider implementation.

**Dependencies:** Task C0.3

**Files likely touched:**
- `docs/specs/whisperx-report-stt-provider.md`
- `docs/conventions/environment.md`

**Estimated scope:** Small

### Task P2.10: Formalize `ReportSttProvider` and Preserve OpenAI Behavior

**Description:** Rename/formalize the existing Python worker report STT provider contract without changing OpenAI runtime behavior.

**Feature/spec:** Report transcription is separate from browser live STT.

**Tech stack:** Python worker, `Protocol`, Pydantic, pytest.

**Implementation plan:**
- Rename or alias `SpeechToTextProvider` to `ReportSttProvider` in `services/python-worker/app/audio/transcribe.py`.
- Keep OpenAI behavior unchanged.
- Keep `REPORT_STT_PROVIDER=openai` as the only accepted config value in this task.
- Update tests and dependency injection names to the report-provider terminology.
- Ensure `audio/flac` remains accepted by the worker request model.
- Keep all error messages free of transcript text, raw audio, speaker notes, scripts, API keys, and tokens.

**Acceptance criteria:**
- OpenAI report transcription tests pass unchanged in behavior.
- `REPORT_STT_PROVIDER=whisperx` is still rejected until Task P2.11.
- Worker API response still normalizes to `AudioTranscribeResponse`.

**Verification:**
- `cd services/python-worker && uv run pytest tests/test_audio_transcribe.py tests/test_config.py`

**Dependencies:** Task C0.3

**Files likely touched:**
- `services/python-worker/app/audio/transcribe.py`
- `services/python-worker/tests/test_audio_transcribe.py`
- `services/python-worker/tests/test_config.py`

**Estimated scope:** Small

### Task P2.11: Add WhisperX `ReportSttProvider` Selection

**Description:** Extend server report STT to support OpenAI or the hosted WhisperX provider contract from Task P2.9.

**Feature/spec:** `REPORT_STT_PROVIDER=openai | whisperx`, report-only WhisperX provider.

**Tech stack:** Python worker, Pydantic, `urllib` or existing HTTP client pattern, pytest.

**Implementation plan:**
- Extend Python config validation to allow `REPORT_STT_PROVIDER=whisperx`.
- Add `WHISPERX_API_URL`, `WHISPERX_API_KEY`, `WHISPERX_MODEL`, and `WHISPERX_TIMEOUT_MS` validation.
- Keep `REHEARSAL_AUDIO_MAX_BYTES` capped at `25000000` for OpenAI; add a separate WhisperX max-size rule only if the contract doc defines one.
- Add `WhisperXSpeechToTextProvider` using the spike contract.
- Send audio as `multipart/form-data` with Bearer auth.
- Normalize WhisperX response to `ProviderTranscription` / `AudioTranscribeResponse`.
- Add tests for provider selection, missing config, successful response, malformed response, empty transcript, provider failure, auth failure, and timeout.
- Update `.env.example` and environment docs.

**Acceptance criteria:**
- `REPORT_STT_PROVIDER=openai` remains backward compatible.
- `REPORT_STT_PROVIDER=whisperx` calls only the configured external endpoint.
- Provider responses normalize to the existing `AudioTranscribeResponse`.
- No API key, transcript, raw audio, or script content is logged.

**Verification:**
- `cd services/python-worker && uv run pytest tests/test_audio_transcribe.py tests/test_config.py`

**Dependencies:** Task P2.9, Task P2.10

**Files likely touched:**
- `services/python-worker/app/audio/transcribe.py`
- `services/python-worker/app/config.py`
- `services/python-worker/tests/test_audio_transcribe.py`
- `services/python-worker/tests/test_config.py`
- `.env.example`
- `docs/conventions/environment.md`

**Estimated scope:** Medium

### Checkpoint: P2

- [ ] Live STT consumers use `LiveSttPort`.
- [ ] Sherpa, Moonshine, and Web Speech have common contract tests.
- [ ] `presenterSettings.sttEngine` engine ids are defined, while persistence remains in P3.
- [ ] Web Speech requires explicit consent because it is treated as non-local.
- [ ] WhisperX is implemented only as a report provider.
- [ ] Large model tests are local/manual, not required in CI.
- [ ] `LIVE_STT_PROVIDER` remains unchanged and is not used for browser engine selection.

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

### P4 Resolved Decisions

- `PauseDetector` owns its own config. `pauseDetector.silenceThresholdDb` defaults to `-55` but must not import the Live STT silence constant directly.
- Pause activity uses partial and final STT updates. Any transcript activity resets the pause timer; P3 content decisions still use final-only transcripts.
- If auto-advance becomes `ready` while silence has already lasted at least `pauseMs`, countdown starts immediately.
- `pauseMs` and `countdownMs` are persisted in schema/localStorage but are not exposed in P4 UI.
- Threshold UI uses a 5% stepper from 50% to 95%.
- Manual guidance appears when the final sentence was spoken more than 5 seconds ago and auto-advance is still not eligible.
- Manual commands cancel countdown and pass through immediately. Manual `nextStep` executes the step and returns auto-advance tracking to the current slide.
- Auto-advance eligibility requires no remaining trigger steps on the current slide. If build steps remain, show a "remaining builds" badge instead of advancing.
- The last slide never starts countdown. When ready, presenter UI shows a non-blocking finish suggestion and highlights the finish button; no modal and no automatic finish.

### P4 Scope Boundary

**In scope**
- Browser-local pause/activity detection from audio level events and Live STT result activity.
- Pure `AdvanceController` policy/state machine.
- Presenter-only countdown, manual guidance, remaining-build, and finish-suggestion UI.
- Global presenter settings for mode enablement, threshold, hidden timing values, and pause detector config.
- Wiring to existing P0 manual commands and P3 `SpeechTracker` snapshots/events.

**Out of scope**
- Recorder/run atomic start-stop and upload lifecycle, owned by P7.
- Cue-triggered advance, owned by P5 and still gated by `AdvanceController`.
- Slide-window or audience countdown UI. P4 UI is presenter-only.
- Exposing `pauseMs`, `countdownMs`, `manualGuidanceDelayMs`, or `silenceThresholdDb` controls in the UI.

### Task P4.1: Define Auto-Advance Config and Settings Extensions

**Description:** Add the P4 policy and pause detector defaults before implementing detection or UI. This keeps STT audio-level tuning, auto-advance timing, and user-visible threshold settings separated.

**Feature/spec:** D2, D3, D6, P4-D1, P4-D4, P4-D5, P4-D6.

**Tech stack:** TypeScript config module, existing `presenterSettings` localStorage store, Vitest.

**Implementation plan:**
- Add `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.ts`.
- Define defaults:
  - `advancePolicy.pauseMs = 700`
  - `advancePolicy.countdownMs = 2000`
  - `autoAdvance.manualGuidanceDelayMs = 5000`
  - `pauseDetector.silenceThresholdDb = -55`
- Extend `PresenterAdvancePolicySettings` with persisted hidden fields `pauseMs` and `countdownMs`.
- Add top-level persisted `pauseDetector: { silenceThresholdDb }` to `PresenterSettings`.
- Clamp persisted settings defensively:
  - `threshold`: `0.5..0.95`
  - `pauseMs`, `countdownMs`: positive integers
  - `silenceThresholdDb`: finite dB number
- Validate P4 config-only `manualGuidanceDelayMs` as a positive integer.
- Keep `manualGuidanceDelayMs` in P4 config only unless a later decision makes it user-persisted.
- Update tests for corrupt localStorage, partial settings migration, clamping, and 5% threshold step helper.

**Acceptance criteria:**
- Existing `orbit:presenter:global:v1` values without P4 fields load with defaults.
- `pauseDetector.silenceThresholdDb` default equals `-55` without importing Live STT constants.
- `pauseMs` and `countdownMs` persist but no UI task exposes controls for them.
- Threshold normalization still accepts only `0.5..0.95`, and UI helpers expose 5% increments.

**Verification:**
- `pnpm --filter @orbit/web test -- presenterSettings`
- `pnpm --filter @orbit/web test -- autoAdvanceConfig`

**Dependencies:** Task P3.7

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.ts`
- `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.test.ts`
- `apps/web/src/features/rehearsal/settings/presenterSettings.ts`
- `apps/web/src/features/rehearsal/settings/presenterSettings.test.ts`

**Estimated scope:** Small

### Task P4.2: Implement `PauseDetector`

**Description:** Detect speech pause and speech resume from two activity sources: microphone RMS silence and transcript activity. The detector is independent from Recorder and Live STT engine implementations.

**Feature/spec:** D6, P4-D1, P4-D2, P4-D3.

**Tech stack:** TypeScript pure reducer/state machine, existing `LiveSttAudioLevelEvent` shape, Vitest fake clock.

**Implementation plan:**
- Add `apps/web/src/features/rehearsal/speech/pauseDetector.ts`.
- Model inputs as explicit events:
  - `audio-level` with `rmsDb`, `atMs`
  - `transcript-activity` with `isFinal`, `atMs`
  - `tick` with `atMs`
  - `reset`
- Treat partial and final STT results as `transcript-activity`.
- Track the latest non-silent audio timestamp and latest transcript activity timestamp separately.
- Consider the user paused only when audio has been silent for `pauseMs` and no transcript activity has occurred during the same window.
- Expose current silence duration so `AdvanceController` can start countdown immediately when it enters `ready` after an already-long pause.
- Emit logical events `pause-started` and `speech-resumed` once per state transition; do not emit repeated pause events on every tick.
- Keep the module free of React, `LiveSttPort` concrete adapters, Recorder, and Web Audio node ownership.

**Acceptance criteria:**
- Silence alone does not start pause while partial or final transcript updates are still arriving.
- Partial transcript activity resets the pause timer even though P3 content tracking ignores partials.
- Existing silence duration is available when auto-advance enters `ready`.
- Speech resume is emitted when audio becomes non-silent or transcript activity resumes.
- Reset clears pause state and timestamps on slide changes or session stop.

**Verification:**
- `pnpm --filter @orbit/web test -- pauseDetector`

**Dependencies:** Task P2.1, Task P4.1

**Files likely touched:**
- `apps/web/src/features/rehearsal/speech/pauseDetector.ts`
- `apps/web/src/features/rehearsal/speech/pauseDetector.test.ts`

**Estimated scope:** Small

### Task P4.3: Implement `AdvanceController` State Machine

**Description:** Implement the pure policy layer that converts P3 speech coverage, P4 pause state, trigger-step state, mode settings, and manual override events into presenter commands.

**Feature/spec:** D2, D3, D6, P4-D3, P4-D7, P4-D8, P4-D9.

**Tech stack:** TypeScript pure state machine, Vitest fixture tables.

**Implementation plan:**
- Add `apps/web/src/features/rehearsal/advance/advanceController.ts`.
- Model states:
  - `disabled`
  - `tracking`
  - `ready`
  - `countdown`
  - `blocked-by-builds`
  - `finish-suggested`
- Define input snapshot:
  - `mode`
  - `slideId`
  - `isLastSlide`
  - `effectiveCoverage`
  - `threshold`
  - `finalSentenceSpoken`
  - `remainingTriggerSteps`
  - `pauseState`
  - `nowMs`
  - `policy`
- Ready eligibility is: mode enabled, coverage `>= threshold`, final sentence spoken, and `remainingTriggerSteps === 0`.
- If `remainingTriggerSteps > 0`, return `blocked-by-builds` and never emit auto-advance.
- If `isLastSlide`, return `finish-suggested` and never enter countdown.
- On `ready`, enter `countdown` immediately when `pauseState.silenceDurationMs >= pauseMs`; otherwise wait for `pause-started`.
- During `countdown`, emit `advance-slide` only after `countdownMs` elapses without `speech-resumed`.
- Manual commands cancel countdown and pass through. Manual `nextStep` returns state to `tracking`; manual slide changes reset to `tracking` for the destination slide.
- Keep command output abstract: `advance-slide`, `cancel-countdown`, `show-builds-remaining`, `suggest-finish`; actual state store calls happen in integration.

**Acceptance criteria:**
- 70% coverage + final sentence + no remaining builds + existing pause starts countdown without waiting for a new pause edge.
- Speech resume during countdown cancels countdown and returns to `ready`.
- Manual `nextStep` during countdown cancels countdown, passes through the step command, and returns to `tracking`.
- Remaining trigger steps block auto-advance and expose the remaining count.
- Last slide produces finish suggestion without countdown or automatic finish.
- Disabled rehearsal/live mode never emits auto-advance commands.

**Verification:**
- `pnpm --filter @orbit/web test -- advanceController`

**Dependencies:** Task P0.7, Task P3.5, Task P4.1, Task P4.2

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/advanceController.ts`
- `apps/web/src/features/rehearsal/advance/advanceController.test.ts`

**Estimated scope:** Medium

### Task P4.4: Wire Auto-Advance Runtime Into `RehearsalWorkspace`

**Description:** Connect P3 session snapshots, P0 trigger-step state, live audio level updates, Live STT result activity, and presenter commands to the pure P4 modules.

**Feature/spec:** D2, D3, D6, P4-D2, P4-D3, P4-D7, P4-D8, P4-D9.

**Tech stack:** React hooks/refs, existing `RehearsalWorkspace`, `presenterStateStore`, `SlideshowRenderer` step model, Testing Library.

**Implementation plan:**
- Add a small hook or local adapter such as `useAutoAdvanceRuntime`.
- Feed `PauseDetector` with:
  - existing live audio level events from the active microphone/STT path
  - every Live STT result as transcript activity, including partial results
  - controlled ticks while a P3 session is running
- Feed `AdvanceController` with the latest P3 snapshot, `presenterSettings.advancePolicy`, P4 config, current mode, current slide index, and remaining trigger steps from the slideshow plan.
- Compute `remainingTriggerSteps = maxStepIndex - stepIndex` for the current slide.
- On `advance-slide`, call the existing presenter state command path for next slide and reset P3 transition-gating state for the new slide.
- On manual `nextStep`, `nextSlide`, `previousSlide`, or `setSlide`, notify `AdvanceController` before executing the existing command so countdown state is cancelled.
- Reset `PauseDetector` and `AdvanceController` on P3 stop, slide change, and deck change.
- Do not send countdown, guidance, finish, transcript, or speaker notes to `presentationChannel`.

**Acceptance criteria:**
- Auto-advance works with mocked P3 snapshots and mocked audio/STT activity without Recorder or run APIs.
- Countdown is cancelled before any manual command mutates state.
- A slide with remaining trigger steps never auto-advances; manual step execution is still allowed.
- Slide-window channel payloads are unchanged and do not include P4 presenter-only UI state.
- Session stop leaves no active timer or stale auto-advance state.

**Verification:**
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`
- `pnpm --filter @orbit/web test -- presentationChannel`

**Dependencies:** Task P3.10, Task P4.2, Task P4.3

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/useAutoAdvanceRuntime.ts`
- `apps/web/src/features/rehearsal/advance/useAutoAdvanceRuntime.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P4.5: Add Presenter-Only Auto-Advance Status UI

**Description:** Add the presenter UI that explains auto-advance state without leaking anything to the slide window: countdown, countdown cancellation state, manual guidance, remaining builds, and final-slide finish suggestion.

**Feature/spec:** D2, D3, D6, P4-D6, P4-D8, P4-D9.

**Tech stack:** React, Testing Library, existing rehearsal panel/topbar styles, lucide icons where buttons need icons.

**Implementation plan:**
- Add `apps/web/src/features/rehearsal/advance/AutoAdvanceStatus.tsx`.
- Render countdown only in presenter layout, never in `PresentWindow` or `SingleScreenPresenter`.
- Render manual guidance when final sentence was spoken and `manualGuidanceDelayMs` has elapsed but auto-advance is not eligible.
- Render remaining-build badge when `remainingTriggerSteps > 0`, using copy that includes the count.
- Render final-slide finish suggestion as a non-blocking badge and expose a prop that allows the existing finish/stop button to be highlighted.
- Keep all status UI free of transcript text, speaker notes, keyword labels, raw audio references, and run metadata.
- Add component tests for each state and a privacy assertion that slide-window components do not import or render `AutoAdvanceStatus`.

**Acceptance criteria:**
- Countdown is visible only in presenter view while the controller is in `countdown`.
- Speech resume or any manual command removes the countdown UI.
- Manual guidance never triggers automatic advance.
- Remaining-build badge blocks only auto-advance; manual controls remain available.
- Last-slide finish suggestion does not open a modal and does not stop the run automatically.
- Slide-window and single-screen fallback do not mount this presenter-only status UI.

**Verification:**
- `pnpm --filter @orbit/web test -- AutoAdvanceStatus`
- `pnpm --filter @orbit/web test -- PresentWindow`
- `pnpm --filter @orbit/web test -- SingleScreenPresenter`

**Dependencies:** Task P4.3, Task P4.4

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/AutoAdvanceStatus.tsx`
- `apps/web/src/features/rehearsal/advance/AutoAdvanceStatus.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** Medium

### Task P4.6: Add Auto-Advance Settings UI

**Description:** Add the small user-facing settings surface for mode enablement and coverage threshold only. Hidden timing and pause detector values stay persisted/configured but not exposed.

**Feature/spec:** D2, D3, P4-D4, P4-D5.

**Tech stack:** React, existing `usePresenterSettings`, Testing Library.

**Implementation plan:**
- Add `apps/web/src/features/rehearsal/advance/AutoAdvanceSettings.tsx`.
- Render rehearsal and live auto-advance on/off toggles backed by `presenterSettings.advancePolicy.rehearsal` and `.live`.
- Render a threshold stepper with values `50, 55, 60, ..., 95`.
- Persist threshold as decimal ratio `0.5..0.95`.
- Do not render controls for `pauseMs`, `countdownMs`, `manualGuidanceDelayMs`, or `pauseDetector.silenceThresholdDb`.
- Keep settings UI in presenter mode only.

**Acceptance criteria:**
- Rehearsal and live toggles persist globally.
- Threshold stepper changes in 5% increments and never writes a value outside `0.5..0.95`.
- Hidden P4 timing and silence settings remain loadable from schema but absent from the UI DOM.
- Changing settings updates the running controller on the next runtime snapshot without restarting STT.

**Verification:**
- `pnpm --filter @orbit/web test -- AutoAdvanceSettings`
- `pnpm --filter @orbit/web test -- presenterSettings`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`

**Dependencies:** Task P4.1, Task P4.4

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/AutoAdvanceSettings.tsx`
- `apps/web/src/features/rehearsal/advance/AutoAdvanceSettings.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/settings/presenterSettings.test.ts`

**Estimated scope:** Small

### Task P4.7: Add P4 Fixture Harness and Regression Gate

**Description:** Add end-to-end-ish P4 fixtures that prove auto-advance behavior across speech coverage, final sentence, pause timing, manual override, remaining builds, and last-slide finish suggestion.

**Feature/spec:** P4 milestone gate.

**Tech stack:** Vitest fake timers, Testing Library, mocked `LiveSttPort`, P3 fixture deck/transcripts, P0 animation fixture deck.

**Implementation plan:**
- Add a P4 fixture deck with:
  - at least two slides
  - Korean speaker notes with final-sentence trigger
  - one slide with no remaining trigger steps
  - one slide with cue-referenced trigger steps still remaining
  - a final slide
- Script mocked STT result activity where partials keep pause from starting, then final coverage and last sentence become true.
- Script audio level events for speech, silence under `pauseMs`, silence over `pauseMs`, and speech resume during countdown.
- Test the happy path: 70%+final sentence+no remaining builds+pause -> countdown -> auto next slide.
- Test cancellation: countdown + speech resume -> no advance.
- Test manual override: countdown + manual `nextStep` -> cancel, step executes, tracking resumes.
- Test blocked builds: ready conditions met but `remainingTriggerSteps > 0` -> remaining-build badge and no advance.
- Test final slide: ready conditions met -> finish suggestion and highlighted finish action, no countdown.
- Add privacy assertions that P4 status does not appear in `/present/:deckId` slide-window output.

**Acceptance criteria:**
- The full P4 gate is covered by deterministic tests without microphone, real STT model, Recorder, or backend APIs.
- There are zero auto-advances while partial transcript activity continues during otherwise silent audio.
- There are zero auto-advances when build steps remain or on the last slide.
- Countdown UI and manual guidance are presenter-only.

**Verification:**
- `pnpm --filter @orbit/web test -- pauseDetector`
- `pnpm --filter @orbit/web test -- advanceController`
- `pnpm --filter @orbit/web test -- AutoAdvanceStatus`
- `pnpm --filter @orbit/web test -- AutoAdvanceSettings`
- `pnpm --filter @orbit/web test -- RehearsalWorkspace`

**Dependencies:** Tasks P4.1-P4.6

**Files likely touched:**
- `apps/web/src/features/rehearsal/advance/__fixtures__/p4AutoAdvanceFixture.ts`
- `apps/web/src/features/rehearsal/advance/*.test.ts`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.test.tsx`

**Estimated scope:** Medium

### Checkpoint: P4

- [ ] P4 decision IDs `P4-D1` through `P4-D9` are reflected in config, controller tests, and presenter UI tests.
- [ ] `PauseDetector` uses separate P4 config and does not import Live STT silence defaults.
- [ ] Partial and final STT activity both reset pause detection.
- [ ] Ready-after-existing-silence enters countdown immediately.
- [ ] Auto-advance requires threshold, final sentence, no remaining trigger steps, and pause/countdown completion.
- [ ] Countdown cancels on speech resume and every manual command.
- [ ] Manual `nextStep` during countdown executes the step and returns tracking to the current slide.
- [ ] Remaining build steps show a presenter-only badge and block only auto-advance.
- [ ] Last slide shows a presenter-only finish suggestion without countdown, modal, or automatic stop.
- [ ] Threshold UI persists in 5% increments from 50% to 95%; `pauseMs`, `countdownMs`, `manualGuidanceDelayMs`, and `silenceThresholdDb` are not exposed in UI.
- [ ] Slide-window and single-screen fallback never render countdown, guidance, build, or finish-suggestion UI.
- [ ] Mocked fixture E2E proves 70%+final sentence+pause -> countdown -> advance and countdown+speech resume -> cancel.

### P4 Implementation Notes

- P4 config and threshold helpers live in `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.ts`.
- `PresenterSettings` now persists `advancePolicy.pauseMs`, `advancePolicy.countdownMs`, and `pauseDetector.silenceThresholdDb`; `manualGuidanceDelayMs` remains code config only and is not persisted.
- `PauseDetector` is implemented in `apps/web/src/features/rehearsal/speech/pauseDetector.ts` and uses P4 config instead of importing Live STT silence constants.
- `AdvanceController` is implemented in `apps/web/src/features/rehearsal/advance/advanceController.ts`; it blocks auto advance while trigger steps remain and never starts countdown on the final slide.
- Presenter-only UI lives in `AutoAdvanceStatus.tsx` and `AutoAdvanceSettings.tsx`; `/present/:deckId` and `SingleScreenPresenter` do not receive countdown, guidance, remaining-build, or finish-suggestion state.
- `RehearsalWorkspace` routes partial and final STT results into `PauseDetector`, routes P3 snapshots into `AdvanceController`, and treats spoken advance commands as manual overrides.
- The P4 fixture harness lives under `apps/web/src/features/rehearsal/advance/__fixtures__/p4AutoAdvanceFixture.ts`.
- Verified commands for this implementation:
  - `pnpm --filter @orbit/web test -- AutoAdvanceStatus AutoAdvanceSettings RehearsalWorkspace PresentWindow SingleScreenPresenter advanceController pauseDetector presenterSettings`
  - `pnpm --filter @orbit/web build`

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

**Dependencies:** Task P6.4, Task P2.11

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

- [ ] 10 minute recording round trip succeeds under the chunk upload storage cap.
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
| WhisperX hosted API mismatch | High | Require Task P2.9 contract spike before provider implementation |
| FLAC encoder performance | High | Run P6.1 before Recorder; keep encoding off the main thread |
| Chunk temp object leaks | Medium | Delete on success; use 1 day S3/MinIO TTL for incomplete/failed chunks |
| Auto advance false positives | High | Keep pause + countdown + resume cancel; never advance on cue alone |
| W1 schema changes after internal cue config | Medium | Mirror W1 subset now so later loader swap avoids CueEngine changes |

## Open Questions

None. New ambiguity discovered during implementation should be added to the source spec as a new D# decision before code proceeds.
