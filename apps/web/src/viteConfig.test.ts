import { describe, expect, it } from "vitest";
import type { UserConfig } from "vite";
import viteConfig, { crossOriginIsolationHeaders } from "../vite.config";

describe("web Vite config", () => {
  it("serves dev and preview responses with cross-origin isolation headers", () => {
    const config = resolveConfig();

    expect(crossOriginIsolationHeaders).toEqual({
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    });
    expect(config.server?.headers).toEqual(crossOriginIsolationHeaders);
    expect(config.preview?.headers).toEqual(crossOriginIsolationHeaders);
  });
});

function resolveConfig() {
  const previousEnv = {
    APP_ENV: process.env.APP_ENV,
    API_BASE_URL: process.env.API_BASE_URL,
    WEB_PORT: process.env.WEB_PORT
  };

  process.env.APP_ENV = "test";
  process.env.API_BASE_URL = "http://127.0.0.1:3000";
  process.env.WEB_PORT = "5173";
  try {
    const configFactory =
      typeof viteConfig === "function" ? viteConfig : () => viteConfig;
    return configFactory({
      command: "serve",
      mode: "test",
      isSsrBuild: false
    }) as UserConfig;
  } finally {
    restoreEnv("APP_ENV", previousEnv.APP_ENV);
    restoreEnv("API_BASE_URL", previousEnv.API_BASE_URL);
    restoreEnv("WEB_PORT", previousEnv.WEB_PORT);
  }
}

function restoreEnv(
  key: "APP_ENV" | "API_BASE_URL" | "WEB_PORT",
  value: string | undefined
) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
