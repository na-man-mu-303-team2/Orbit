import { dirname, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const adapterEntryPath =
  "/src/features/rehearsal/sherpaOnnxLiveSttAdapter.ts";
const workerFilePath =
  "/src/features/rehearsal/sherpaOnnxWorker.ts?worker_file&type=classic";
const audioWorkletPath =
  "/src/features/rehearsal/liveSttPcmCapture.worklet.js?no-inline";

describe("sherpaOnnxWorker classic worker output", () => {
  let server: ViteDevServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("lets Vite own the default worker URL in the adapter entry", async () => {
    server = await createTestServer();
    const source = await readFile(
      resolve(webRoot, "src/features/rehearsal/sherpaOnnxLiveSttAdapter.ts"),
      "utf8"
    );

    const result = await server.transformRequest(adapterEntryPath);
    const executableCode = stripInlineSourceMap(result?.code ?? "");

    expect(source).toContain('new URL("./sherpaOnnxWorker.ts", import.meta.url)');
    expect(source).not.toContain(
      "./sherpaOnnxWorker.ts?worker_file&type=classic"
    );
    expect(result).not.toBeNull();
    expect(executableCode).toContain("new Worker(");
    expect(executableCode).not.toContain(
      "./sherpaOnnxWorker.ts?worker_file&type=classic"
    );
  });

  it("does not leave ESM static syntax in the classic worker response", async () => {
    server = await createTestServer();
    const response = await fetchDevServerText(server, workerFilePath);
    const executableCode = stripViteDevEnvBootstrap(
      stripInlineSourceMap(response.body)
    );

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("javascript");
    expect(response.body).toContain('importScripts("/@vite/env")');
    expect(response.body).not.toMatch(/^\s*<!doctype html>/i);
    expect(executableCode).toContain("class SherpaAudioFrameBatcher");
    expect(executableCode).not.toMatch(/(^|\n)\s*import\s+(?!Scripts\b)/);
    expect(executableCode).not.toMatch(/(^|\n)\s*export\s+/);
    expect(executableCode).not.toContain("/src/");
    expect(executableCode).not.toContain("/@vite/");
  });

  it("serves the audio worklet as JavaScript instead of fallback HTML", async () => {
    server = await createTestServer();
    const response = await fetchDevServerText(server, audioWorkletPath);
    const executableCode = stripInlineSourceMap(response.body);

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("javascript");
    expect(response.body).not.toMatch(/^\s*<!doctype html>/i);
    expect(executableCode).toContain("registerProcessor(");
    expect(executableCode).not.toMatch(/(^|\n)\s*import\s+/);
    expect(executableCode).not.toMatch(/(^|\n)\s*export\s+/);
  });
});

function createTestServer() {
  return createServer({
    root: webRoot,
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: 0
    },
    worker: {
      format: "iife"
    }
  });
}

async function fetchDevServerText(server: ViteDevServer, path: string) {
  const request = new MockRequest(path);
  const response = new MockResponse();

  await new Promise<void>((resolve, reject) => {
    response.on("finish", resolve);
    response.on("error", reject);
    server.middlewares(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }

        if (!response.writableEnded) {
          response.statusCode = 404;
          response.end();
        }
      }
    );
  });
  return {
    status: response.status,
    contentType: response.header("content-type"),
    body: response.text()
  };
}

function stripInlineSourceMap(code: string) {
  return code.replace(/\n\/\/# sourceMappingURL=.*$/s, "");
}

function stripViteDevEnvBootstrap(code: string) {
  return code.replace(/^\s*importScripts\("\/@vite\/env"\)\s*;\s*/, "");
}

class MockRequest extends Readable {
  method = "GET";
  headers = { host: "127.0.0.1" };

  constructor(readonly url: string) {
    super();
  }

  override _read() {
    this.push(null);
  }
}

class MockResponse extends Writable {
  private readonly chunks: Buffer[] = [];
  private readonly headers = new Map<string, string>();

  statusCode = 200;

  get status() {
    return this.statusCode;
  }

  setHeader(name: string, value: number | string | readonly string[]) {
    this.headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? value.join(", ") : String(value)
    );
    return this;
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase());
  }

  removeHeader(name: string) {
    this.headers.delete(name.toLowerCase());
  }

  writeHead(
    statusCode: number,
    headers?: Record<string, number | string | readonly string[]>
  ) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.setHeader(name, value);
    }
    return this;
  }

  header(name: string) {
    return this.headers.get(name.toLowerCase()) ?? "";
  }

  text() {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    this.chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
    );
    callback();
  }

  override end(
    chunk?: Buffer | string | (() => void),
    encoding?: BufferEncoding | (() => void),
    callback?: () => void
  ) {
    if (typeof chunk === "function") {
      return super.end(chunk);
    }

    if (chunk) {
      this.chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(
              chunk,
              typeof encoding === "string" ? encoding : "utf8"
            )
      );
    }

    return super.end(typeof encoding === "function" ? encoding : callback);
  }
}
