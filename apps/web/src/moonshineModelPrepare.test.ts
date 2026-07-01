import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requiredRootFiles = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json"
];

describe("prepare Moonshine Live STT model script", () => {
  it("copies the default fp32/q4 Transformers.js asset set into the self-hosted model path", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "orbit-moonshine-model-"));
    const sourceDir = join(tempDir, "source");
    const outDir = join(tempDir, "public-models");
    await writeMoonshineSnapshot(sourceDir);

    await execFileAsync("node", [
      "scripts/prepare-moonshine-live-stt-model.mjs",
      "--source",
      sourceDir,
      "--out",
      outDir
    ], { cwd: webRoot });

    const modelDir = join(
      outDir,
      "onnx-community",
      "moonshine-tiny-ko-ONNX"
    );
    for (const fileName of requiredRootFiles) {
      await expect(stat(join(modelDir, fileName))).resolves.toMatchObject({
        size: expect.any(Number)
      });
    }
    await expect(stat(join(modelDir, "onnx", "encoder_model.onnx"))).resolves.toMatchObject({
      size: expect.any(Number)
    });
    await expect(
      stat(join(modelDir, "onnx", "decoder_model_merged_q4.onnx"))
    ).resolves.toMatchObject({ size: expect.any(Number) });

    const manifest = JSON.parse(
      await readFile(join(modelDir, "orbit-local-model-manifest.json"), "utf8")
    );
    expect(manifest).toMatchObject({
      provider: "transformers.js",
      modelId: "onnx-community/moonshine-tiny-ko-ONNX",
      localModelPath: "/models/live-stt/",
      dtype: {
        encoder_model: "fp32",
        decoder_model_merged: "q4"
      },
      requiredFiles: expect.arrayContaining([
        "config.json",
        "onnx/encoder_model.onnx",
        "onnx/decoder_model_merged_q4.onnx"
      ])
    });
    expect(manifest.files["onnx/decoder_model_merged_q4.onnx"]).toMatchObject({
      bytes: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });
});

async function writeMoonshineSnapshot(sourceDir: string) {
  await mkdir(join(sourceDir, "onnx"), { recursive: true });
  for (const fileName of requiredRootFiles) {
    await writeFile(join(sourceDir, fileName), JSON.stringify({ fileName }));
  }
  await writeFile(join(sourceDir, "onnx", "encoder_model.onnx"), "encoder");
  await writeFile(
    join(sourceDir, "onnx", "decoder_model_merged_q4.onnx"),
    "decoder"
  );
}
