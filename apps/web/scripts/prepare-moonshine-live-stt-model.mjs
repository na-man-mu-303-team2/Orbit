#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const defaultModelId = "onnx-community/moonshine-tiny-ko-ONNX";
const defaultLocalModelPath = "/models/live-stt/";
const requiredRootFiles = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json"
];
const dtypeSuffixes = {
  fp32: "",
  fp16: "_fp16",
  q8: "_quantized",
  q4: "_q4",
  q4f16: "_q4f16"
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = resolve(requireArg(args, "source"));
  const outRoot = resolve(
    args.out ?? join("public", "models", "live-stt")
  );
  const modelId = args.modelId ?? defaultModelId;
  const encoderDtype = args.encoderDtype ?? "fp32";
  const decoderDtype = args.decoderDtype ?? "q4";
  const requiredFiles = [
    ...requiredRootFiles,
    onnxFileName("encoder_model", encoderDtype),
    onnxFileName("decoder_model_merged", decoderDtype)
  ];
  const outDir = join(outRoot, ...modelId.split("/"));

  await mkdir(outDir, { recursive: true });
  const copiedFiles = [];
  for (const fileName of requiredFiles) {
    const sourcePath = join(sourceDir, fileName);
    const outPath = join(outDir, fileName);
    await mkdir(dirname(outPath), { recursive: true });
    await copyFile(sourcePath, outPath);
    copiedFiles.push({ fileName, path: outPath });
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
    provider: "transformers.js",
    modelId,
    localModelPath: args.localModelPath ?? defaultLocalModelPath,
    dtype: {
      encoder_model: encoderDtype,
      decoder_model_merged: decoderDtype
    },
    requiredFiles,
    files
  };

  await writeFile(
    join(outDir, "orbit-local-model-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(`Prepared Moonshine Live STT model assets at ${outDir}`);
}

function onnxFileName(baseName, dtype) {
  if (!Object.hasOwn(dtypeSuffixes, dtype)) {
    throw new Error(
      `Unsupported dtype "${dtype}". Expected one of: ${Object.keys(dtypeSuffixes).join(", ")}.`
    );
  }

  return `onnx/${baseName}${dtypeSuffixes[dtype]}.onnx`;
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

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
