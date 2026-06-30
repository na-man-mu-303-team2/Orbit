import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it } from "vitest";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("sherpaOnnxWorker classic worker output", () => {
  let server: ViteDevServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  it("does not leave ESM static syntax in the classic worker response", async () => {
    server = await createServer({
      root: webRoot,
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      server: {
        middlewareMode: true
      },
      worker: {
        format: "iife"
      }
    });

    const result = await server.transformRequest(
      "/src/features/rehearsal/sherpaOnnxWorker.ts?worker_file&type=classic"
    );
    const executableCode = stripInlineSourceMap(result?.code ?? "");

    expect(result).not.toBeNull();
    expect(executableCode).toContain("importScripts(");
    expect(executableCode).not.toMatch(/(^|\n)\s*import\s+(?!Scripts\b)/);
    expect(executableCode).not.toMatch(/(^|\n)\s*export\s+/);
  });
});

function stripInlineSourceMap(code: string) {
  return code.replace(/\n\/\/# sourceMappingURL=.*$/s, "");
}
