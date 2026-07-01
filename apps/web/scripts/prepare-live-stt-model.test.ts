import { execFile } from "node:child_process";
import { readFile, rm, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "prepare-live-stt-model.mjs"
);

let tempRoot: string | null = null;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

describe("prepare-live-stt-model", () => {
  it("copies bpe.vocab and records it in the manifest", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.sourceDir, "bpe.vocab"), "<blk>\t0.0\n");

    await execFileAsync(process.execPath, [
      scriptPath,
      "--source",
      fixture.sourceDir,
      "--runtime",
      fixture.runtimeDir,
      "--out",
      fixture.outDir
    ]);

    const manifest = JSON.parse(
      await readFile(join(fixture.outDir, "manifest.json"), "utf8")
    );
    expect(manifest.model.bpeVocab).toBe("bpe.vocab");
    expect(manifest.model.bpeVocab).not.toBe("bpe.model");
    expect(manifest.files["bpe.vocab"].bytes).toBeGreaterThan(0);
    await expect(
      readFile(join(fixture.outDir, "bpe.vocab"), "utf8")
    ).resolves.toMatch(/^<blk>\t0\.0/m);
  });

  it("fails when only the binary bpe.model exists", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.sourceDir, "bpe.model"), "\u0000binary");

    await expect(
      execFileAsync(process.execPath, [
        scriptPath,
        "--source",
        fixture.sourceDir,
        "--runtime",
        fixture.runtimeDir,
        "--out",
        fixture.outDir
      ])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("script/export_bpe_vocab.py --bpe-model")
    });
  });
});

async function createFixture() {
  tempRoot = await mkdtemp(join(tmpdir(), "orbit-live-stt-prepare-"));
  const sourceDir = join(tempRoot, "source");
  const runtimeDir = join(tempRoot, "runtime");
  const outDir = join(tempRoot, "out");
  await mkdir(sourceDir);
  await mkdir(runtimeDir);

  for (const fileName of ["encoder.onnx", "decoder.onnx", "joiner.onnx"]) {
    await writeFile(join(sourceDir, fileName), `${fileName}\n`);
  }
  await writeFile(join(sourceDir, "tokens.txt"), "0 <blk>\n");

  for (const fileName of [
    "sherpa-onnx-wasm-main-asr.js",
    "sherpa-onnx-wasm-main-asr.wasm",
    "sherpa-onnx-wasm-main-asr.data"
  ]) {
    await writeFile(join(runtimeDir, fileName), `${fileName}\n`);
  }

  return { sourceDir, runtimeDir, outDir };
}
