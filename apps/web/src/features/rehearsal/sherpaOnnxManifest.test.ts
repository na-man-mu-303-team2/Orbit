import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  defaultSherpaOnnxModelId,
  resolveSherpaOnnxModelManifest,
  type SherpaOnnxModelManifest
} from "./sherpaOnnxManifest";

describe("sherpaOnnxManifest", () => {
  it("resolves runtime and model asset URLs relative to manifest baseUrl", () => {
    const manifest = manifestFixture();

    const resolved = resolveSherpaOnnxModelManifest(
      manifest,
      "http://localhost:5173/models/live-stt/korean/manifest.json"
    );

    expect(resolved.runtime.script).toBe(
      "http://localhost:5173/models/live-stt/korean/sherpa-onnx-wasm-main-asr.js"
    );
    expect(resolved.runtime.wasm).toBe(
      "http://localhost:5173/models/live-stt/korean/sherpa-onnx-wasm-main-asr.wasm"
    );
    expect(resolved.runtime.helpers).toEqual([
      "http://localhost:5173/models/live-stt/korean/sherpa-onnx-asr.js"
    ]);
    expect(resolved.model.encoder).toBe(
      "http://localhost:5173/models/live-stt/korean/encoder.onnx"
    );
    expect(resolved.model.tokens).toBe(
      "http://localhost:5173/models/live-stt/korean/tokens.txt"
    );
    expect(resolved.model.bpeVocab).toBe(
      "http://localhost:5173/models/live-stt/korean/bpe.vocab"
    );
  });

  it("rejects binary SentencePiece model paths for hotword BPE vocab", () => {
    const manifest = manifestFixture({
      model: { ...manifestFixture().model, bpeVocab: "bpe.model" }
    });

    expect(() =>
      resolveSherpaOnnxModelManifest(
        manifest,
        "http://localhost:5173/models/live-stt/korean/manifest.json"
      )
    ).toThrow(/model\.bpeVocab.*bpe\.vocab.*bpe\.model/i);
  });

  it("keeps the checked-in Korean model manifest pointed at a text bpe.vocab", () => {
    const modelDir = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../public/models/live-stt",
      defaultSherpaOnnxModelId
    );
    const manifest = JSON.parse(
      readFileSync(join(modelDir, "manifest.json"), "utf8")
    ) as SherpaOnnxModelManifest;

    if (!manifest.model.bpeVocab) {
      throw new Error("Checked-in Live STT manifest must include model.bpeVocab.");
    }

    expect(manifest.model.bpeVocab).toBe("bpe.vocab");
    const vocab = readFileSync(
      join(modelDir, manifest.model.bpeVocab),
      "utf8"
    );
    expect(vocab).toMatch(/^<blk>\t0\.0/m);
    expect(vocab).not.toMatch(/^<!doctype html>/i);
  });
});

function manifestFixture(
  overrides: Partial<SherpaOnnxModelManifest> = {}
): SherpaOnnxModelManifest {
  return {
    provider: "sherpa-onnx",
    modelId: defaultSherpaOnnxModelId,
    version: "2024-06-16",
    baseUrl: ".",
    sampleRate: 16000,
    runtime: {
      helpers: ["sherpa-onnx-asr.js"],
      script: "sherpa-onnx-wasm-main-asr.js",
      wasm: "sherpa-onnx-wasm-main-asr.wasm",
      data: "sherpa-onnx-wasm-main-asr.data"
    },
    model: {
      encoder: "encoder.onnx",
      decoder: "decoder.onnx",
      joiner: "joiner.onnx",
      tokens: "tokens.txt",
      bpeVocab: "bpe.vocab"
    },
    ...overrides
  };
}
