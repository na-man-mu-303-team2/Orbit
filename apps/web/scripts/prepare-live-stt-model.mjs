#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const defaultModelId = "sherpa-onnx-streaming-zipformer-korean-2024-06-16";
const requiredModelFiles = ["encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"];
const bpeVocabFileName = "bpe.vocab";
const binaryBpeModelFileName = "bpe.model";
const requiredRuntimeFiles = [
  "sherpa-onnx-wasm-main-asr.js",
  "sherpa-onnx-wasm-main-asr.wasm",
  "sherpa-onnx-wasm-main-asr.data"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = requireArg(args, "source");
  const runtimeDir = requireArg(args, "runtime");
  const modelId = args.modelId ?? defaultModelId;
  const version = args.version ?? "2024-06-16";
  const sampleRate = Number(args.sampleRate ?? "16000");
  const outDir = resolve(
    args.out ?? join("public", "models", "live-stt", modelId)
  );

  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error("--sample-rate must be a positive integer.");
  }

  await mkdir(outDir, { recursive: true });

  const copiedFiles = [];
  for (const fileName of [...requiredRuntimeFiles, ...requiredModelFiles]) {
    const fromDir = requiredRuntimeFiles.includes(fileName) ? runtimeDir : sourceDir;
    const sourcePath = resolve(fromDir, fileName);
    const outPath = join(outDir, basename(fileName));
    await copyFile(sourcePath, outPath);
    copiedFiles.push({ fileName: basename(fileName), path: outPath });
  }

  const model = {
    encoder: "encoder.onnx",
    decoder: "decoder.onnx",
    joiner: "joiner.onnx",
    tokens: "tokens.txt"
  };
  const bpeVocabSourcePath = resolve(sourceDir, bpeVocabFileName);
  const bpeModelSourcePath = resolve(sourceDir, binaryBpeModelFileName);
  if (await fileExists(bpeVocabSourcePath)) {
    const outPath = join(outDir, bpeVocabFileName);
    await copyFile(bpeVocabSourcePath, outPath);
    copiedFiles.push({ fileName: bpeVocabFileName, path: outPath });
    model.bpeVocab = bpeVocabFileName;
  } else if (await fileExists(bpeModelSourcePath)) {
    throw new Error(
      `BPE hotword bias requires ${bpeVocabFileName}. ${binaryBpeModelFileName} is binary and cannot be used as model.bpeVocab. Generate the text vocab first with script/export_bpe_vocab.py --bpe-model ${bpeModelSourcePath} --output ${bpeVocabSourcePath}.`
    );
  }

  const files = Object.fromEntries(
    await Promise.all(
      copiedFiles.map(async ({ fileName, path }) => {
        const metadata = await stat(path);
        return [
          fileName,
          {
            bytes: metadata.size,
            sha256: await sha256(path)
          }
        ];
      })
    )
  );

  const manifest = {
    provider: "sherpa-onnx",
    modelId,
    version,
    baseUrl: ".",
    sampleRate,
    numThreads: 1,
    decodingMethod: "greedy_search",
    runtime: {
      script: "sherpa-onnx-wasm-main-asr.js",
      wasm: "sherpa-onnx-wasm-main-asr.wasm",
      data: "sherpa-onnx-wasm-main-asr.data"
    },
    model,
    files
  };

  await writeFile(
    join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(`Prepared Live STT model manifest at ${join(outDir, "manifest.json")}`);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase()
    );
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value.`);
    }
    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
  }

  return value;
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function sha256(path) {
  const data = await import("node:fs/promises").then((fs) => fs.readFile(path));
  return createHash("sha256").update(data).digest("hex");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
