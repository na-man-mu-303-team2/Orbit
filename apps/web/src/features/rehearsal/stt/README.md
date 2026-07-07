# Rehearsal live STT

This directory owns browser live-control STT only.

- `LiveSttPort` is the consumer contract for rehearsal speech tracking.
- `ReportSttProvider` is server-side and lives in the Python worker, not here.
- Sherpa, Web Speech, and Moonshine implement the same port.
- CI tests use contract tests and deterministic mock harness output.
- Real Sherpa/Web Speech/Moonshine model runs are local/manual because large
  browser model assets are not committed.

Web Speech is treated as non-local for consent purposes. MDN documents that
some browsers, including Chrome, can use a server-based recognition engine for
`SpeechRecognition`, sending audio to a web service.
