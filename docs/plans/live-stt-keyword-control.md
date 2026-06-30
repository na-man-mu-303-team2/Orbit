# Implementation Plan: Live STT Rehearsal Keyword Control

## Objective

Implement the approved Live STT keyword-control spec with minimal, localized changes in `apps/web`. The plan keeps shared contracts unchanged and avoids server logging of transcript or raw audio.

## Scope

Primary code area:

- `apps/web/src/features/rehearsal`

Likely files:

- `liveStt.ts`
- `sherpaOnnxLiveSttAdapter.ts`
- `sherpaOnnxWorker.ts`
- `RehearsalWorkspace.tsx`
- rehearsal STT and workspace tests

Out of scope:

- API server changes.
- Worker server changes.
- Deck JSON schema changes.
- `packages/shared` contract changes.
- ASR model fine-tuning.

## Architecture Decisions

- Keep command configuration web-internal for this iteration.
- Represent commands generically with action IDs and phrase lists.
- Include current slide text, speaker notes, key terms, and command phrases in the Live STT bias context.
- Update bias context on current-slide changes.
- Treat command detection as a conservative supporting signal for rehearsal behavior.
- Keep content coverage as the primary automatic slide-progress gate.
- Use browser debug logging for transcript inspection only behind `orbit.liveStt.debugLatency`.

## Initial Command Defaults

```ts
[
  {
    action: "advance-slide",
    phrases: ["다음 슬라이드", "다음으로", "넘어가"]
  },
  {
    action: "animation-cue",
    cue: "emphasis",
    phrases: ["강조", "강조해", "하이라이트"]
  }
]
```

## Task Breakdown

### 1. Add Live STT Bias Types

- Add browser-side bias context types in `liveStt.ts`.
- Include typed sources for slide text, speaker notes, key terms, and control phrases.
- Add optional start/update methods without breaking existing adapters.

Checkpoint:

- Existing Live STT callers compile without changing behavior.

### 2. Add Sherpa ONNX Bias Support

- Extend `SherpaOnnxLiveSttAdapter` to pass bias context into the worker on start.
- Add `updateBiasContext` support for slide changes.
- Extend `sherpaOnnxWorker.ts` to apply hotword buffers and hotword scores from bias terms.
- Keep stale `sessionId` handling unchanged.

Checkpoint:

- Worker initialization and transcript handling still work when no bias context is supplied.

### 3. Add Transcript Debug Logging

- Log transcript payloads from `partial` and `final` worker messages only when `orbit.liveStt.debugLatency` is enabled.
- Use prefix `[orbit-live-stt-transcript]`.
- Include `{ sessionId, isFinal, confidence, transcript }`.
- Do not log stale session transcripts.
- Preserve existing latency, audio, and worker metrics logs.

Checkpoint:

- Debug off produces no transcript console log.

### 4. Add Command Configuration and Detector

- Add a small internal command config module or local helper under rehearsal code.
- Normalize transcripts and command phrases.
- Return structured command candidates with action ID, phrase, normalized transcript, final status, confidence, and timestamp.
- Keep matching conservative to avoid false positives.

Checkpoint:

- Arbitrary Korean speech containing similar words does not produce a confirmed command unless confirmation rules are met.

### 5. Integrate Commands into Rehearsal Workspace

- Build bias context from current slide text, speaker notes, key terms, and command phrases.
- Pass bias context when starting Live STT.
- Update bias context when the current slide changes.
- Feed partial/final transcripts into command detection.
- Let confirmed `advance-slide` act only as a supporting signal for existing coverage-based progress.
- Emit or handle sample `animation-cue` internally without breaking decks that have no compatible target.

Checkpoint:

- Command phrases alone do not auto-advance slides when coverage is insufficient.

### 6. Add Focused Tests

Add or update tests for:

- Bias context is sent when Live STT starts.
- Bias context updates when the slide changes.
- Debug transcript logs appear only when `orbit.liveStt.debugLatency` is enabled.
- Transcript debug logs include transcript, `isFinal`, and `confidence`.
- Stale session transcripts are ignored and not logged.
- `안녕하세요. 다음 슬라이드는.` does not produce false-positive auto-advance.
- Confirmed final or repeated command candidate contributes to progression only within the coverage policy.

Checkpoint:

- Tests cover both recall-enabling bias behavior and false-positive prevention.

### 7. Verify Locally

Run the focused checks first:

```bash
apps/web/node_modules/.bin/vitest run apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx apps/web/src/features/rehearsal/sherpaOnnxLiveSttAdapter.test.ts --passWithNoTests
apps/web/node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
```

If relevant files expand beyond rehearsal code, broaden verification to the matching package or app test commands.

## Risk Controls

- Do not log transcript text outside browser debug mode.
- Do not modify API, Worker server, or shared schema for this iteration.
- Keep phrase defaults small.
- Prefer missed command over accidental slide advance.
- Add tests around negative examples before broadening phrase lists.

## Future Work

- Move command configuration to Deck metadata if users need per-deck command customization.
- Add UI controls for command phrase management.
- Collect opt-in local debug fixtures for Korean rehearsal command tuning.
- Evaluate ASR fine-tuning only after bias and keyword-control behavior are measured.
