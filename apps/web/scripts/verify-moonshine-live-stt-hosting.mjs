#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..", "..");
const defaultBaseUrl = "http://127.0.0.1:5173";
const defaultModelId = "onnx-community/moonshine-tiny-ko-ONNX";
const defaultLocalModelPath = "/models/live-stt/";
const requiredIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin"
};
const requiredRootFiles = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "special_tokens_map.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "orbit-local-model-manifest.json"
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
  const report = await verifyMoonshineHosting({
    baseUrl: args.baseUrl ?? defaultBaseUrl,
    modelId: args.modelId ?? defaultModelId,
    localModelPath: args.localModelPath ?? defaultLocalModelPath,
    encoderDtype: args.encoderDtype ?? "fp32",
    decoderDtype: args.decoderDtype ?? "q4"
  });

  if (args.out) {
    await writeText(resolveFromRepo(args.out), `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

export async function verifyMoonshineHosting(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultBaseUrl);
  const modelId = options.modelId ?? defaultModelId;
  const localModelPath = options.localModelPath ?? defaultLocalModelPath;
  const encoderDtype = options.encoderDtype ?? "fp32";
  const decoderDtype = options.decoderDtype ?? "q4";
  const headerChecks = await verifyHeaders(fetchImpl, baseUrl);
  const assetPaths = requiredMoonshineAssetPaths({
    modelId,
    localModelPath,
    encoderDtype,
    decoderDtype
  });
  const assets = await Promise.all(
    assetPaths.map((path) => verifyAsset(fetchImpl, baseUrl, path))
  );
  const headerPassed = Object.values(headerChecks).every((check) => check.passed);
  const assetsPassed = assets.every((asset) => asset.passed);

  return {
    status: headerPassed && assetsPassed ? "pass" : "fail",
    baseUrl,
    modelId,
    localModelPath,
    dtype: {
      encoder_model: encoderDtype,
      decoder_model_merged: decoderDtype
    },
    headers: headerChecks,
    assets
  };
}

export function requiredMoonshineAssetPaths(options = {}) {
  const modelId = options.modelId ?? defaultModelId;
  const localModelPath = options.localModelPath ?? defaultLocalModelPath;
  const encoderDtype = options.encoderDtype ?? "fp32";
  const decoderDtype = options.decoderDtype ?? "q4";
  const modelBasePath = joinUrlPath(localModelPath, modelId);

  return [
    ...requiredRootFiles.map((fileName) => joinUrlPath(modelBasePath, fileName)),
    joinUrlPath(modelBasePath, onnxFileName("encoder_model", encoderDtype)),
    joinUrlPath(modelBasePath, onnxFileName("decoder_model_merged", decoderDtype))
  ];
}

async function verifyHeaders(fetchImpl, baseUrl) {
  const response = await fetchWithHeadFallback(fetchImpl, baseUrl);
  return Object.fromEntries(
    Object.entries(requiredIsolationHeaders).map(([header, expected]) => {
      const actual = response.headers.get(header);
      return [
        header,
        {
          expected,
          actual,
          passed:
            response.ok &&
            typeof actual === "string" &&
            actual.trim().toLowerCase() === expected
        }
      ];
    })
  );
}

async function verifyAsset(fetchImpl, baseUrl, path) {
  const url = new URL(path, baseUrl).toString();
  const response = await fetchWithHeadFallback(fetchImpl, url);
  const contentLength = parseContentLength(response.headers.get("content-length"));
  return {
    path,
    url,
    status: response.status,
    contentLength,
    passed: response.ok
  };
}

async function fetchWithHeadFallback(fetchImpl, url) {
  const response = await fetchImpl(url, { method: "HEAD" });
  if (response.status !== 405) {
    return response;
  }

  return fetchImpl(url, { method: "GET" });
}

function onnxFileName(baseName, dtype) {
  if (!Object.hasOwn(dtypeSuffixes, dtype)) {
    throw new Error(
      `Unsupported dtype "${dtype}". Expected one of: ${Object.keys(dtypeSuffixes).join(", ")}.`
    );
  }

  return `onnx/${baseName}${dtypeSuffixes[dtype]}.onnx`;
}

function parseContentLength(value) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function joinUrlPath(...parts) {
  const joined = parts
    .flatMap((part) => String(part).split("/"))
    .filter(Boolean)
    .join("/");
  return `/${joined}`;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function resolveFromRepo(path) {
  return isAbsolute(path) ? path : resolve(repoRoot, path);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
