# ORBIT Live STT Assets

The active rehearsal Live STT path uses Chrome Web Speech on-device recognition
through `WebSpeechLiveSttAdapter`. It does not require checked-in `.onnx`,
`.wasm`, `.data`, or model manifest files.

## Active Runtime

- Adapter: `apps/web/src/features/rehearsal/webSpeechLiveSttAdapter.ts`
- Public contract: `apps/web/src/features/rehearsal/liveStt.ts`
- Event schema: `packages/shared/src/rehearsals/live-stt.schema.ts`
- Default provider env: `LIVE_STT_PROVIDER=web-speech`

The adapter starts Chrome Web Speech with `processLocally=true`, `lang="ko-KR"`,
`quality="command"`, `continuous=true`, `interimResults=true`, and
`maxAlternatives=1`. If the Korean on-device language pack is downloadable, the
adapter attempts `SpeechRecognition.install()` before starting recognition.

## Legacy Sherpa Notes

Sherpa ONNX code remains in `apps/web/src/features/rehearsal` as legacy
implementation code and test coverage, but it is no longer the default runtime
and no local model preparation script is exposed from `@orbit/web`.

This directory still ignores model-sized files so local experiments do not get
committed accidentally. Do not commit raw model artifacts, generated WASM
runtime files, or local transcripts.
