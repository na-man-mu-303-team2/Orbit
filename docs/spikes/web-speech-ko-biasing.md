# Spike: Chrome Stable ko-KR Web Speech(SODA) biasing

**Date:** 2026-07-03
**Machine:** macOS, local Chrome Stable
**Chrome:** Google Chrome 149.0.7827.201
**Execution:** Playwright launched `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` with headless Chrome. Chrome execution required sandbox escalation.
**Origin:** `https://example.com`
**Secure context:** `true`

## Summary

Chrome Stable exposes the Web Speech on-device API surface needed by the implementation:

- `SpeechRecognition`: present
- `webkitSpeechRecognition`: present
- `SpeechRecognitionPhrase`: present
- `recognition.processLocally`: present
- `recognition.phrases`: present
- `SpeechRecognition.available({ langs: ["ko-KR"], processLocally: true, quality: "command" })`: `"downloadable"`
- `SpeechRecognition.install({ langs: ["ko-KR"], processLocally: true, quality: "command" })`: `true`
- `recognition.phrases = [new SpeechRecognitionPhrase("오르빗", 5)]`: succeeded
- `recognition.start(audioTrack)` with fake live audio track: succeeded

Final recognition results were not produced in headless fake-audio execution. The recognition session emitted `onerror` with `error: "network"` before any `onresult`, so the actual Chrome Stable final alternatives count could not be observed in automation.

## API Surface Probe Result

```json
{
  "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36",
  "secureContext": true,
  "hasSpeechRecognition": true,
  "hasWebkitSpeechRecognition": true,
  "hasSpeechRecognitionPhrase": true,
  "constructorName": "SpeechRecognition",
  "instance": {
    "hasProcessLocally": true,
    "hasPhrases": true,
    "initialPhrasesType": "[object Array]",
    "maxAlternativesBefore": 1
  },
  "available": "downloadable",
  "install": true,
  "phrasesAssignment": {
    "ok": true,
    "length": 1,
    "firstPhrase": "오르빗",
    "firstBoost": 5
  },
  "startWithTrack": {
    "ok": true,
    "trackKind": "audio",
    "trackReadyState": "live",
    "maxAlternatives": 3
  }
}
```

## Final Alternatives Probe

Input audio was generated with macOS Korean TTS:

```bash
say -v Yuna -o /tmp/orbit-stt.aiff "오르빗 결제 승인"
afconvert /tmp/orbit-stt.aiff /tmp/orbit-stt.wav -f WAVE -d LEI16@16000
```

Chrome was launched with:

```bash
--use-fake-ui-for-media-stream
--use-file-for-fake-audio-capture=/tmp/orbit-stt.wav
```

Observed result:

```json
{
  "timedOut": false,
  "error": {
    "error": "network",
    "message": ""
  },
  "events": []
}
```

## Implementation Impact

- T5/T6 phrases implementation remains valid: API surface supports `SpeechRecognitionPhrase` and `recognition.phrases`, and assignment succeeds.
- T9 audio track routing remains valid: `recognition.start(audioTrack)` accepted a live audio track.
- T13/T14 alternatives implementation remains defensive: if Chrome returns no final alternatives, or only one alternative, reranking naturally no-ops.
- Manual non-headless verification is still useful before claiming product-level recognition improvement, but no code change is required for the current implementation plan.
