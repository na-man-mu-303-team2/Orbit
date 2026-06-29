# Live STT model assets

This directory is the local static asset root for browser-side Live STT.

Large sherpa-onnx artifacts are intentionally ignored by git. Place a versioned
model directory here when testing locally:

```text
apps/web/public/models/live-stt/
  sherpa-onnx-streaming-zipformer-korean-2024-06-16/
    manifest.json
    sherpa-onnx-wasm-main-asr.js
    sherpa-onnx-wasm-main-asr.wasm
    sherpa-onnx-wasm-main-asr.data
    encoder.onnx
    decoder.onnx
    joiner.onnx
    tokens.txt
```

The web app loads the default manifest from:

```text
/models/live-stt/sherpa-onnx-streaming-zipformer-korean-2024-06-16/manifest.json
```

Live STT runs on device in the browser. Do not route live microphone audio
through the report STT upload APIs.
