# Moonshine live STT local assets

P2 keeps Moonshine as a local, manifest-based live STT engine. Large model and
runtime files are intentionally not committed.

Expected local layout:

```text
apps/web/public/models/live-stt/moonshine/moonshine-korean-local/
  manifest.json
  moonshine-worker.js
  moonshine.onnx
  moonshine.wasm        # optional
  tokens.txt            # optional
```

The default manifest URL is:

```text
/models/live-stt/moonshine/moonshine-korean-local/manifest.json
```

Minimal manifest:

```json
{
  "provider": "moonshine",
  "modelId": "moonshine-korean-local",
  "version": "2026-07-03",
  "baseUrl": ".",
  "sampleRate": 16000,
  "language": "ko",
  "runtime": {
    "worker": "moonshine-worker.js"
  },
  "model": {
    "model": "moonshine.onnx",
    "tokens": "tokens.txt"
  }
}
```
