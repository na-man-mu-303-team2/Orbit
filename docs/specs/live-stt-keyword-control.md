# Live STT Rehearsal Keyword Control Spec

## Status

Approved for planning.

## Context

The rehearsal screen currently receives microphone audio through the browser Live STT path. Audio input works, but Korean streaming ASR often emits no useful transcript for arbitrary speech. The immediate product need is not full dictation. The rehearsal workflow needs reliable command detection for a small set of presentation-control phrases, where false positives are more harmful than missed commands.

This spec narrows the Live STT goal to rehearsal-control keyword detection, using slide content, speaker notes, and configured control phrases as ASR bias inputs while keeping transcript exposure limited to browser debug logging.

## Goals

- Detect rehearsal-control phrases from Korean speech with low false-positive risk.
- Use slide content, speaker notes, and curated control phrases to bias Live STT.
- Keep the command model extensible from day one, instead of hard-coding only one action.
- Avoid shared contract changes for the first implementation.
- Keep transcript and raw audio out of server logs.
- Preserve existing coverage-based slide progress behavior.

## Non-Goals

- General-purpose Korean dictation accuracy.
- ASR model fine-tuning.
- Server-side STT transcript storage.
- Public Deck JSON schema changes.
- Audience-facing exposure of speaker notes, raw audio, or transcript text.

## User Decisions

- Primary use case: rehearsal control keyword detection.
- False positives are worse than missed detections.
- A command phrase alone must not automatically advance slides unless the existing coverage logic also supports progression.
- The first command set includes next-slide phrases and one sample animation cue.
- Configuration starts as web-internal code/config. It may later move to Deck metadata by swapping the config provider or backing store.
- The command model should be generic from the first implementation.

## Initial Command Configuration

The first implementation uses a web-internal default configuration with explicit action IDs.

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

The phrase list is intentionally small. It should be expanded only when test fixtures or real rehearsal logs show that additional phrases improve recall without increasing false positives.

## Bias Context

Live STT bias context should include:

- Current slide title and visible text.
- Current slide speaker notes.
- Extracted key terms from current and nearby slides.
- Configured control phrases.

Bias context is browser-local and session-scoped. It must not be sent to API or Worker server logs.

## Command Detection

The detector should consume Live STT partial and final transcripts and return a structured candidate:

```ts
type RehearsalCommandCandidate = {
  action: string;
  phrase: string;
  normalizedTranscript: string;
  isFinal: boolean;
  confidence?: number;
  matchedAt: number;
};
```

Detection should prefer precision:

- Normalize whitespace and Korean punctuation before matching.
- Match configured command phrases conservatively.
- Do not trigger from unrelated arbitrary speech.
- Ignore stale STT session messages.
- Do not rely on arbitrary dictation text being present.

## Confirmation Policy

A command is confirmed only when one of these conditions is true:

- A matching final transcript is received.
- The same command candidate appears at least twice within a short confirmation window.

The initial confirmation window should be short enough for rehearsal control, but conservative enough to reduce accidental triggers. The exact value can be adjusted during implementation and testing.

## Slide Advancement Policy

Command phrases are a supporting signal, not a replacement for the existing coverage model.

- Existing content-coverage advancement remains the primary gate.
- A confirmed `advance-slide` command may help complete or strengthen the progression decision.
- A command phrase alone must not trigger automatic slide advancement when coverage is insufficient.
- Manual controls remain available regardless of Live STT state.

## Animation Cue Policy

The first animation cue is a sample `emphasis` cue.

- A confirmed `animation-cue` candidate may emit an internal rehearsal event.
- If the current deck has no compatible animation target, the cue should be ignored safely.
- Missing animation support must not break slide progress, microphone input, or transcript logging.

## Logging and Privacy

Browser debug logging may include transcript text only when `orbit.liveStt.debugLatency` is enabled.

The browser transcript log prefix is:

```text
[orbit-live-stt-transcript]
```

Payload shape:

```ts
{
  sessionId: string;
  isFinal: boolean;
  confidence?: number;
  transcript: string;
}
```

Server logs, API logs, Worker server logs, and durable storage must not include raw audio, transcript text, speaker notes, or presentation script content.

## Contract Scope

The first implementation is web-internal.

- No `packages/shared` schema change is required.
- No Deck JSON contract change is required.
- No API request or response contract change is required.
- If command configuration later becomes deck metadata, shared schema and `docs/contracts.md` must be updated together.

## Acceptance Criteria

- Live STT starts with bias context derived from slide content, speaker notes, key terms, and command phrases.
- Bias context updates when the current slide changes.
- The initial command configuration supports `advance-slide` and sample `animation-cue` actions.
- `advance-slide` phrases do not trigger automatic slide advancement by themselves.
- Confirmation requires either final transcript match or repeated matching partials.
- Browser debug logs include transcript text only behind `orbit.liveStt.debugLatency`.
- Stale STT session messages produce no transcript debug log and no command candidate.
- Existing latency, audio, and worker metrics logs are preserved.
- Manual fixture tests include at least one arbitrary Korean utterance such as `안녕하세요. 다음 슬라이드는.` that must not produce a false-positive auto-advance.

## Open Follow-Ups

- Decide whether command configuration should become Deck metadata after the first web-internal iteration.
- Collect real rehearsal examples to tune phrase lists and confirmation windows.
- Evaluate whether ASR model fine-tuning is needed after command-biased detection is measured.
