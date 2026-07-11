# Implementation Plan: Semantic Cue NLI Runtime

**Status:** Planning draft  
**Date:** 2026-07-09  
**Owner:** Web rehearsal / ML runtime  
**User decisions captured in planning:**

- Semantic cues live on `slide.semanticCues`.
- First-class NLI target is browser-direct inference.
- Debug decision events stay in React memory only, with JSON copy/export.
- Cue extraction runs as a separate preparation/analysis job.
- Browser PoC starts from the upstream ONNX artifact for `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`.
- Rehearsal report may persist bounded NLI evidence including premise.

## 1. Current Codebase Analysis Summary

### Shared deck, slide, keyword, action schema

- `packages/shared/src/deck/deck.schema.ts`
  - `slideSchema` currently owns `slideId`, `title`, `speakerNotes`, `elements`, `keywords`, `animations`, `actions`, and optional `aiNotes`.
  - `keywordSchema` defines `keywordId`, `text`, `synonyms`, `abbreviations`, `required`, and `requiredOccurrenceIds`.
  - `slideSchema.superRefine` validates slide-local action IDs, keyword action targets, keyword occurrence targets from `deriveKeywordOccurrences`, and animation effect targets.
  - Extension point: add `semanticCues: z.array(semanticCueSchema).default([])` to `slideSchema` and validate `targetElementIds` / `triggerActionIds` against the same slide.
- `packages/shared/src/deck/slide-action.schema.ts`
  - `DeckSlideActionTrigger` supports `cue`, `keyword`, and `keyword-occurrence`.
  - Existing `cue` trigger is a free string, not linked to structured semantic cue IDs.
  - Extension point: keep existing `cue` trigger for legacy/manual actions, and add optional semantic cue references through `SemanticCue.triggerActionIds` before changing action trigger contracts.
- `packages/shared/src/deck/keyword-occurrences.ts`
  - `deriveKeywordOccurrences(slide)` derives occurrence IDs from `speakerNotes`.
  - This remains lexical and should not be overloaded for semantic cue coverage.

### STT, keyword, phrase, and semantic matching flow

- `apps/web/src/features/rehearsal/stt/liveSttPort.ts`
  - `LiveSttResult` carries `text`, `isFinal`, `timestampMs`, `confidence`, and `alternatives`.
  - Bias phrase sources include keywords, synonyms, abbreviations, representative phrases, speaker notes, and nearby slide text.
- `apps/web/src/features/rehearsal/stt/liveSttEngineRegistry.ts`
  - `createLiveSttPort` chooses the live STT engine; `web-speech` is wrapped by `RerankingLiveSttPort`.
- `apps/web/src/features/rehearsal/stt/rerankingLiveSttPort.ts`
  - Runs only on final results with alternatives, then strips alternatives before passing the selected result downstream.
- `apps/web/src/features/rehearsal/stt/alternativeReranker.ts`
  - `rerankAlternatives(alternatives, phrases)` scores bias phrase matches and only replaces the original alternative when the best score is high enough.
- `apps/web/src/features/rehearsal/stt/koreanTextSimilarity.ts`
  - `scoreBiasMatch` and Korean jamo edit similarity are used for STT alternative reranking.
- `apps/web/src/features/rehearsal/speech/speechMatcher.ts`
  - `matchPhraseCandidate` uses substring, then Dice score fallback.
  - `matchKeywordAliases` detects final keyword hits.
  - `calculateWordMultisetRecall` is used for lexical overlap.
- `apps/web/src/features/rehearsal/speech/speechTracker.ts`
  - `createSpeechTracker` applies lexical sentence matching on partial/final transcript and keyword hits only on final transcript.
  - `acceptSemanticSentenceMatch` is the existing extension point for semantic coverage mutation.
- `apps/web/src/features/rehearsal/speech/semanticSentenceSplitter.ts`
  - `splitSpeakerNotesIntoSemanticSentences` already splits `.`, `?`, `!`, CJK punctuation, and ellipsis, with decimal-period protection.
- `apps/web/src/features/rehearsal/speech/e5EmbeddingService.ts`
  - Uses `@huggingface/transformers` with `Xenova/multilingual-e5-small`.
  - Current prefix mode is `query-query`, based on `docs/spikes/e5-prefix-mode-calibration.md`.
- `apps/web/src/features/rehearsal/speech/semanticUtteranceMatcher.ts`
  - `createSemanticUtteranceMatcher` prepares slide sentence embeddings and `matchFinalTranscript` ranks top 3 current-slide script sentences.
  - It runs on final STT only.
- `apps/web/src/features/rehearsal/speech/semanticUtteranceDecision.ts`
  - `decideSemanticUtteranceOutcome` classifies final utterances as accepted exact/paraphrase, ad-lib, ambiguous, low-score, or already-covered.
  - Existing outcomes are `covered`, `paraphrased`, `ad-lib`, and `missed`.

### Runtime/session/report flow

- `apps/web/src/features/rehearsal/speech/p3RehearsalSession.ts`
  - `createP3RehearsalSession` is the current live orchestration point.
  - `processSemanticFinalResult` waits for slide index preparation, calls `semanticMatcher.matchFinalTranscript`, emits debug state, then mutates coverage only if `isSemanticMatchingEnabled()` is true.
  - Extension point: introduce `semanticCueRuntime` here after existing lexical/embedding decisions, before `tracker.acceptSemanticSentenceMatch`.
- `apps/web/src/features/rehearsal/speech/rehearsalLogCollector.ts`
  - Records `sentence-covered`, `ad-lib`, `missed`, keyword, slide timeline, and advice events into `RehearsalRunMeta`.
  - Extension point: add bounded `semanticCueDecisions` or extend `utteranceOutcomes` with cue/NLI evidence.
- `packages/shared/src/rehearsals/rehearsal.schema.ts`
  - `rehearsalRunMetaSchema` and `rehearsalReportSchema` already include `utteranceOutcomes`.
  - Existing comment says run meta may include bounded report facts, but not full transcript, speaker notes, or raw audio.
  - Because the user selected premise persistence, the plan must add strict length limits and log redaction for premise/hypothesis.
- `apps/api/src/rehearsals/rehearsals.service.ts`
  - `updateRunMeta` parses shared schema and stores `metaJson`.
- `apps/worker/src/rehearsal-stt.processor.ts`
  - `loadRehearsalRunMeta` parses run meta and passes it into `buildRehearsalReport`.
- `apps/worker/src/logging.ts`
  - Redacts `script`, `transcript`, `rawAudio`, and `audioBase64`.
  - Must be extended to redact NLI `premise`, `hypothesis`, and semantic debug/report evidence fields.

### Action and advance flow

- `apps/web/src/features/rehearsal/speech/keywordOccurrenceRuntime.ts`
  - `matchKeywordOccurrenceTriggers` gates occurrence action playback with confidence and estimated speaker progress.
- `apps/web/src/features/rehearsal/playback/triggeredActionPlayback.ts`
  - Resolves keyword, keyword-occurrence, and cue-triggered actions.
- `apps/web/src/features/rehearsal/advance/advanceController.ts`
  - `evaluateAdvanceController` advances only when mode is enabled, `effectiveCoverage >= threshold`, final sentence is spoken, remaining build steps are clear, pause/cooldown is satisfied, and slide is not last.
  - NLI must not call `advance-slide` directly; it can only add cue/sentence coverage evidence.
- `apps/web/src/features/rehearsal/advance/autoAdvanceConfig.ts`
  - `AutoAdvancePolicy.semanticMatching` defaults to `false`.
  - NLI coverage must remain gated behind this semantic matching setting plus its own NLI feature flag.

### UI and debug flow

- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
  - Owns semantic matcher creation, E5 loading, `semanticDebugState`, P3 session wiring, action playback, and advance controller evaluation.
  - Extension point: wire `SemanticCueDebugPanel` and `SemanticCueRuntime` here.
- `apps/web/src/features/rehearsal/panel/SemanticSpeechDebugPanel.tsx`
  - Existing floating panel shows semantic STT top matches and decision.
  - Extension point: keep this panel for sentence/E5 debugging, add a separate `SemanticCueDebugPanel` for cue/NLI/action-gate explanation.
- `apps/web/src/features/rehearsal/presenter/presenterStateStore.ts`
  - `PresenterSpeechState` carries `semanticDebug`, coverage IDs, and snapshot.
  - Extension point: add optional semantic cue debug snapshot only for presenter remote debug mode, not slide display.
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
  - `createSlideWindowDeckSnapshot` strips `speakerNotes`, `keywords`, and `actions` from slide display snapshots.
  - Keep semantic cue debug out of slide-window snapshots.

## 2. Proposed Architecture

```text
Preparation Layer
  - LLM cue extraction job
  - shared schema validation
  - slide.semanticCues storage

Runtime Matching Layer
  - existing lexical/keyword/phrase matcher
  - existing E5 embedding matcher and ad-lib/ambiguous detector
  - semantic cue candidate selector
  - browser NLI worker/provider
  - score combiner

Action/State Layer
  - cue coverage state
  - sentence coverage bridge
  - action gate
  - advance controller policy

Reporting Layer
  - bounded NLI decision evidence
  - ad-lib 인정 근거
  - false positive / false negative analysis facts
```

The key design choice is to keep `createP3RehearsalSession` as the live orchestration point and add a small semantic cue runtime beside the existing sentence semantic matcher. That runtime should not own slide advance. It produces coverage evidence and debug events; `SpeechTracker`, action playback, and `evaluateAdvanceController` continue to make state/action decisions.

### Module boundary and file-size policy

Do not concentrate this feature into one growing file. If adding NLI/cue logic would materially increase `RehearsalWorkspace.tsx`, `p3RehearsalSession.ts`, or any existing large runtime file, split the work into focused modules first.

Preferred boundaries:

- `semanticCueRuntime.ts`: orchestration of lexical/embedding/NLI cue decisions.
- `semanticCueCandidateSelector.ts`: top-k cue selection and skip reasons.
- `semanticCueNliProvider.ts` / `semanticCueNliWorker.ts`: browser NLI provider and Web Worker boundary.
- `semanticCueScoreCombiner.ts`: final score and decision reason codes.
- `semanticCueDebugEvents.ts`: debug event construction and ring-buffer helpers.
- `SemanticCueDebugPanel.tsx`: debug UI only.
- `semanticCueReportEvidence.ts`: bounded report evidence shaping.

`RehearsalWorkspace.tsx` should only wire dependencies, feature flags, and React state. `p3RehearsalSession.ts` should only call the semantic cue runtime at the existing final-STT extension point and apply returned speech events. If a task starts adding several unrelated helpers to one of these files, split the helper into a module with focused unit tests before continuing.

## 3. Schema Changes

### Deck schema

Add a new schema file:

- `packages/shared/src/deck/semantic-cue.schema.ts`

Proposed type:

```ts
export type SemanticCuePriority = 1 | 2 | 3;

export type SemanticCue = {
  cueId: string;
  slideId: string;
  meaning: string;
  required: boolean;
  priority: SemanticCuePriority;
  candidateKeywords: string[];
  aliases: Record<string, string[]>;
  requiredConcepts: string[];
  nliHypotheses: string[];
  negativeHints?: string[];
  targetElementIds?: string[];
  triggerActionIds?: string[];
};
```

Then extend `slideSchema`:

```ts
semanticCues: z.array(semanticCueSchema).default([])
```

Validation rules:

- `cueId` unique within slide.
- `slideId` must equal containing `slide.slideId`.
- `nliHypotheses` min 1, max 3.
- `candidateKeywords`, alias values, and `requiredConcepts` should be compact and deduplicated.
- `targetElementIds` must exist in `slide.elements`.
- `triggerActionIds` must exist in `slide.actions`.
- Do not require every keyword to become a cue; cues are meaning units, keywords remain lexical hints.

### Rehearsal report/run meta

Add bounded decision evidence without turning run meta into a transcript log:

```ts
type RehearsalSemanticCueDecision = {
  slideId: string;
  cueId: string;
  label: "covered" | "partial" | "not_covered" | "contradicted";
  finalScore: number;
  embeddingScore?: number;
  lexicalScore?: number;
  conceptCoverage?: number;
  entailmentScore?: number;
  neutralScore?: number;
  contradictionScore?: number;
  premise?: string; // max 600, normalized final stable window only
  hypothesis?: string; // max 300
  provider: "browser-transformersjs" | "browser-onnx" | "mock";
  modelId?: string;
  reasonCodes: string[];
  at?: string;
};
```

Because the user selected premise persistence, this must be guarded by:

- max length and whitespace normalization;
- no partial transcript storage;
- no full speaker notes;
- API/worker logger redaction for `premise`, `hypothesis`, `semanticCueDecisions`, and nested `nli`;
- report rendering that shows short evidence, not raw full transcript history.

## 4. LLM Cue Extraction Plan

Cue extraction runs in the preparation stage as a separate analysis job, never during live presentation.

### Input

For each slide:

- `slideId`
- `title`
- `speakerNotes`
- visible text from `elements`
- existing `keywords`
- `animations` / `actions` IDs
- element IDs and rough roles, if available
- deck metadata: `audience`, `purpose`, `tone`, locale

### Output

LLM returns compact cue definitions only:

- `meaning`
- `candidateKeywords`
- `aliases`
- `requiredConcepts`
- `nliHypotheses` 1-3
- small `negativeHints`, only for likely false positives
- candidate `targetElementIds`
- candidate `triggerActionIds`
- `priority` and `required`

Policy:

- Do not generate sentence-by-sentence paraphrase datasets.
- Prefer 3-7 cues per content slide.
- Each cue represents one business/semantic obligation, not one wording variant.
- Keywords remain lexical hints; they do not duplicate `requiredConcepts`.

Implementation placement:

- Node worker job owns persistence and deck patching.
- Python worker can host the OpenAI prompt/parser because `services/python-worker/app/ai/generate_deck.py` already has OpenAI response-format patterns.
- Add a new endpoint such as `/ai/extract-semantic-cues`.
- Shared schema validates returned cues before any deck update.

## 5. NLI Runtime Plan

### Research basis

- The candidate model card states the model performs multilingual NLI and zero-shot classification, and its NLI example uses premise/hypothesis tokenization with labels `entailment`, `neutral`, `contradiction`: <https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli>
- The model repository includes an ONNX folder around 450MB, with `model.onnx` around 428MB: <https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli/tree/main/onnx>
- Transformers.js runs models in the browser through ONNX Runtime and supports `text-classification`, `zero-shot-classification`, and `feature-extraction`: <https://huggingface.co/docs/transformers.js/index>
- Transformers.js supports WebGPU via `device: "webgpu"` and falls back to WASM/CPU by default: <https://huggingface.co/docs/transformers.js/guides/webgpu>
- Transformers.js caching/configuration supports remote model loading and browser cache controls: <https://huggingface.co/docs/transformers.js/api/env>
- ONNX Runtime Web supports WASM broadly and WebGPU on Chromium-class browsers, with WebGPU selected through the `webgpu` import/provider: <https://onnxruntime.ai/docs/get-started/with-javascript/web.html>

### Browser-direct provider design

Add a provider interface:

```ts
export type NliProvider = {
  load: () => Promise<NliProviderInfo>;
  evaluate: (input: {
    premise: string;
    hypotheses: Array<{ cueId: string; hypothesis: string }>;
    signal?: AbortSignal;
  }) => Promise<NliDecision[]>;
};
```

Providers:

- `mockNliProvider` for unit/integration tests.
- `browserTransformersNliProvider` using `@huggingface/transformers`.
- `browserOnnxNliProvider` only if Transformers.js cannot load the upstream artifact with the required text-pair API.

The first PoC should try the upstream ONNX artifact directly because the user selected that strategy. The plan still requires a performance gate before enabling it by default because the upstream ONNX artifact is large.

### Worker separation

- Run NLI in a dedicated Web Worker module.
- Main thread sends stable final transcript window and top-k hypotheses.
- Worker owns model loading, tokenizer/model calls, cancellation generation IDs, and cooldown.
- Main thread receives compact scores and latency.
- If worker load fails, set NLI provider status to `disabled-low-capability` and keep lexical/E5 behavior.

### Runtime constraints

- Run only on final STT / stable transcript windows.
- Do not run on partial transcript.
- Max candidate cues: top 3.
- Max hypotheses per cue: 1 primary, optional second only when priority 1/required.
- Max premise length: normalized 600 characters.
- Max hypothesis length: 300 characters.
- Max sequence length: start with 192 or 256 tokens; calibrate in PoC.
- Throttle: no more than one NLI batch every 2-3 seconds.
- Per-cue cooldown: avoid rerunning same cue on near-identical premise for 8-15 seconds.
- Drop stale jobs when slide index, generation, or final transcript changes.
- Never block UI or slide controls while NLI is loading/running.

### Feature flags

Add web/runtime flags:

- `VITE_SEMANTIC_CUE_NLI_ENABLED`
- `VITE_SEMANTIC_CUE_NLI_PROVIDER=browser-transformersjs|browser-onnx|mock|off`
- `VITE_SEMANTIC_CUE_NLI_MODEL_ID=MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`
- `VITE_SEMANTIC_CUE_DEBUG_PANEL`

For server-provided runtime config, extend `packages/shared/src/config/runtime-config.schema.ts` and `apps/api/src/runtime-config/runtime-config.controller.ts` only if the flag must be centrally controlled. Otherwise keep Vite flags for the browser-only PoC.

### Graceful degradation

- If model download/load exceeds a timeout, disable NLI for the session and show debug-only skipped reason.
- If WebGPU is unavailable, try WASM only when device budget allows.
- If memory/load fails, keep E5 semantic matcher and lexical fallback.
- In live/presenter mode, default to conservative/off until measured.

## 6. Ad-lib Trigger Conditions

NLI should run only after cheaper matchers say the result is not a clear cover.

Proposed API:

```ts
shouldRunNli({
  lexicalScore,
  phraseMatched,
  keywordCoverage,
  embeddingScore,
  embeddingMargin,
  semanticDecisionReason,
  cuePriority,
  isRequired,
  transcriptStability,
  lastNliRunAt,
  deviceTier,
  mode,
  semanticMatchingEnabled,
  nliFeatureEnabled
})
```

Decision states:

- `exact_keyword_match`: lexical keyword/phrase coverage is clear; do not run NLI.
- `phrase_match`: existing substring/Dice sentence match covered; do not run NLI.
- `semantic_embedding_match`: E5 accepted with high margin; do not run NLI unless cue is required and semantic confidence is only partial.
- `ad_lib_candidate`: E5 says ad-lib but cue selector finds a required/high-priority cue above a lower retrieval floor; run NLI.
- `ambiguous_candidate`: E5 top 1/top 2 margin is too small; run NLI only for required/priority 1 cues.
- `partial_coverage`: concepts/keywords partially match but not enough for coverage; run NLI if stable and not throttled.
- `no_match`: no meaningful candidate; do not run NLI.

Top-k cue selection:

1. Filter cues to current slide.
2. Prefer uncovered required cues.
3. Score by embedding similarity, keyword/concept overlap, action relevance, and priority.
4. Exclude cues already covered unless contradiction/retraction support is later added.
5. Pass max 3 cues to NLI.

## 7. UX and Product Policy

Rehearsal mode:

- NLI-based ad-lib/paraphrase recognition may count as cue coverage when feature flag and semantic matching toggle are on.
- UI should show covered/paraphrased state in script surfaces, but should not show “AI judging” live status to the speaker.
- Report can show “대본과 다르게 말했지만 의미상 인정된 발화” with bounded premise evidence.

Presenter/live mode:

- Default NLI off or conservative until browser performance is measured.
- Presenter remote may show debug panel only with debug flag/query.
- Slide display window must never receive transcript, speaker notes, semantic cue debug, or NLI evidence.

Action policy:

- Highlight may use lower combined threshold.
- Reveal/play animation requires higher threshold plus ordering/cooldown.
- Next slide must never be triggered by NLI alone.
- Next slide continues to require required cue/sentence coverage, minimum slide dwell/pause, remaining build state, manual override state, and `evaluateAdvanceController`.

## 8. Implementation Stages

### P0: Contracts and mock data flow

- Add `semantic-cue.schema.ts` and `slide.semanticCues`.
- Add feature flags and runtime config shape for NLI/debug.
- Add `semanticCueRuntime` interfaces:
  - cue candidate selector
  - `shouldRunNli`
  - score combiner
  - mock NLI provider
  - debug event builder
- Wire mock provider into `createP3RehearsalSession` behind flags.
- Ensure exact keyword/phrase matches bypass NLI.
- Ensure NLI evidence cannot advance slide directly.

### P1: Preparation job and persistence

- Add separate semantic cue extraction job/API.
- Add Python worker endpoint for compact cue extraction.
- Validate LLM output with shared schema before patching deck.
- Add bounded `semanticCueDecisions` to run meta/report schema.
- Extend logger redaction for NLI evidence.
- Add report sections for semantic cue coverage and premise-based evidence.

### P2: Browser NLI model PoC

- Add Web Worker provider for `MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli`.
- Try upstream ONNX artifact directly.
- Measure first-load, cached-load, per-batch latency, memory, and UI responsiveness.
- Implement timeout, abort/drop stale jobs, throttle, and cooldown.
- Keep default off until PoC passes defined browser/device thresholds.

### P3: Calibration and product hardening

- Add Korean semantic cue fixtures.
- Tune thresholds for entailment, contradiction, combined score, and action gates.
- Add false positive/false negative review workflow using exported debug snapshots.
- Revisit quantized/mirrored artifact if upstream ONNX is too heavy.
- Consider conservative presenter/live default after measurement.

## 9. Test Plan

Unit tests:

- cue candidate selector picks current-slide required/high-priority cues.
- NLI score combiner handles entailment, neutral, contradiction, and low embedding score.
- `shouldRunNli` skips exact keyword/phrase matches.
- `shouldRunNli` runs only for ad-lib/ambiguous semantic candidates.
- stale NLI jobs are dropped on slide/generation change.

Integration tests:

- final STT -> E5 ambiguous/ad-lib -> NLI entailment -> cue covered.
- keyword exact match does not call NLI.
- next slide is not triggered by NLI alone.
- semantic matching toggle off means NLI/debug may run but coverage does not mutate.
- NLI disabled/failed falls back to existing substring/Dice/E5 behavior.

Performance tests:

- NLI Web Worker does not block UI thread.
- large model load timeout disables provider cleanly.
- low-end fallback keeps rehearsal controls responsive.
- debug panel collapsed state avoids rendering full detail.

Korean examples:

- Script/cue: `CAC가 높은 원인은 초기 영업 비용입니다`
- Utterance: `처음엔 세일즈에 돈이 많이 들어 고객 한 명 데려오는 비용이 컸습니다`
- Expected: ad-lib semantic candidate refined to `covered` / `paraphrased` cue coverage.
- Utterance: `CAC는 중요한 지표입니다`
- Expected: related but `not_covered`.

Debug panel tests:

- flag off: panel absent.
- flag/query on: semantic decision events visible.
- skipped reason visible when NLI is not run.
- action blocked reason visible when NLI covered but action/advance gate denies.
- JSON snapshot copy/export works.
- production flag off: no existing presenter/rehearsal UI regression.

## 10. Risks and Decision Points

### Is browser-direct NLI realistic?

It is plausible but high risk. The upstream model has ONNX files, and Transformers.js/ONNX Runtime Web can run browser inference. However, the upstream ONNX artifact is about 428MB, which is too heavy for default live presentation without measurement. The implementation must treat browser NLI as feature-flagged and performance-gated.

### Should we start with server-side or mock?

The user selected browser direct as the target. The minimum safe path is still to implement the provider interface and mock flow first, then plug in the browser worker. This is not a product decision reversal; it is a staging safety measure so coverage/action/report contracts can be tested before downloading a 428MB model.

### Feature flag and fallback

All NLI behavior must be disabled by default unless:

- semantic matching is enabled;
- NLI feature flag is enabled;
- provider loaded successfully;
- device/browser budget is acceptable;
- current final transcript is stable and eligible.

### Least invasive integration point

The smallest safe integration point is `processSemanticFinalResult` in `p3RehearsalSession.ts`, after existing E5 decision and before `tracker.acceptSemanticSentenceMatch`.

### Minimal schema change

Start with `slide.semanticCues` and optional `rehearsalRunMeta.semanticCueDecisions`. Avoid changing `slide.actions` trigger union in P0. Link cue to actions through `triggerActionIds`.

### Stop/escape points

Abort or defer browser NLI if:

- upstream ONNX load is too slow or fails often;
- per-batch inference blocks or stutters UI;
- false positives remain high after threshold tuning;
- premise persistence creates unacceptable privacy/reporting risk.

## 11. Debug Floating Panel Plan

### Component location

- Owner rehearsal screen: add `SemanticCueDebugPanel` in `RehearsalWorkspace.tsx`, next to existing `SemanticSpeechDebugPanel`.
- Presenter remote: add optional panel through `PresenterRemoteWindow.tsx`, fed by sanitized presenter speech/debug state.
- Slide display window: no panel and no semantic debug state.

### Feature flag

Enable only when any of these are true:

- `?debugSemanticCue=1`
- `VITE_SEMANTIC_CUE_DEBUG_PANEL=true`
- optional localStorage key such as `orbit.semanticCue.debugPanel=1`

Production bundle policy:

- lazy-load panel component only when debug flag is true;
- keep NLI provider worker lazy-loaded behind NLI flag;
- do not render heavy event detail when collapsed.

### Debug event schema

```ts
type SemanticCueDebugEvent = {
  eventId: string;
  timestamp: number;
  deckId: string;
  slideId: string;
  slideTitle?: string;
  transcript: {
    partial?: string;
    final?: string;
    stableWindow: string;
    stabilityScore?: number;
  };
  candidates: Array<{
    cueId: string;
    meaning: string;
    lexicalScore?: number;
    keywordCoverage?: number;
    conceptCoverage?: number;
    embeddingScore?: number;
    selectedForNli: boolean;
    nliSkippedReason?: string;
  }>;
  nli?: {
    provider: "mock" | "browser-transformersjs" | "browser-onnx";
    modelId?: string;
    premise: string;
    hypotheses: Array<{
      cueId: string;
      hypothesis: string;
      entailmentScore: number;
      neutralScore: number;
      contradictionScore: number;
    }>;
    latencyMs: number;
  };
  decision: {
    cueId?: string;
    finalScore: number;
    label: "covered" | "partial" | "not_covered" | "contradicted" | "no_candidate";
    reasonCodes: string[];
  };
  actionGate?: {
    requestedAction?: string;
    allowed: boolean;
    blockedReasons: string[];
    cooldownUntil?: number;
    requiredCueCoverage?: number;
  };
};
```

### Event generation

- Candidate selector records top-k cue evidence and skip reasons.
- NLI provider records provider/model/latency/raw NLI scores.
- Score combiner records final score and decision reason codes.
- Action gate records allowed/blocked reasons.
- `semanticCueRuntime` aggregates these fragments into one event and pushes it to a React ring buffer.

### React state and persistence

- Keep only last 100 events in React memory.
- No session log persistence for debug events.
- JSON copy/export serializes the current ring buffer on demand.
- Report persistence is separate and bounded through `semanticCueDecisions`, not debug event dumps.

### UI behavior

- Floating panel on right or bottom-right.
- Collapsible.
- Timeline of recent events.
- Current slide cue coverage list.
- Cue click opens detailed evidence.
- Show “NLI skipped” reason explicitly.
- Show “NLI covered but action blocked” separately from model decision.
- Copy current snapshot as JSON.

### Performance

- Batch panel updates with animation frame or microtask queue.
- Keep event list bounded.
- In collapsed mode, render only badge/status counters.
- Avoid rendering premise/hypothesis details until a cue/event is expanded.

## 바로 구현에 들어가도 되는 최소 안전 범위

- Add `slide.semanticCues` schema and validators.
- Add feature flags and provider interfaces.
- Add `shouldRunNli`, candidate selector, score combiner, and mock provider with tests.
- Wire mock semantic cue runtime after existing E5 final-STT path.
- Add debug panel ring buffer and flag-gated UI.
- Ensure exact keyword/phrase match skips NLI.
- Ensure NLI cannot directly trigger `go-to-next-slide`.

## 아직 검증이 필요한 위험 범위

- Upstream ONNX browser load/download performance for a 428MB model.
- Whether Transformers.js can directly use the upstream model for pairwise NLI with the required labels, or whether a custom ONNX provider is needed.
- WebGPU/WASM latency on low-end laptops.
- Combined-score thresholds for Korean presentation paraphrases.
- Premise persistence privacy/logging policy after API/worker redaction is added.
- Whether live/presenter mode should ever default NLI on after performance measurement.
