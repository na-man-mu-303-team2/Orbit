import { describe, expect, it } from "vitest";

const requiredAssets = [
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/config.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/generation_config.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/preprocessor_config.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/special_tokens_map.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/tokenizer.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/tokenizer_config.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/orbit-local-model-manifest.json",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/onnx/encoder_model.onnx",
  "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/onnx/decoder_model_merged_q4.onnx"
];
const verifierModuleUrl = new URL(
  "../scripts/verify-moonshine-live-stt-hosting.mjs",
  import.meta.url
).href;

describe("Moonshine self-hosting verifier", () => {
  it("passes when COOP/COEP headers and required Moonshine assets are served", async () => {
    const { verifyMoonshineHosting } = await import(verifierModuleUrl);

    const report = await verifyMoonshineHosting({
      baseUrl: "https://staging.example.test",
      fetchImpl: createFetchFixture({
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin"
        },
        missingAssets: new Set()
      })
    });

    expect(report).toMatchObject({
      status: "pass",
      baseUrl: "https://staging.example.test",
      headers: {
        "Cross-Origin-Opener-Policy": {
          expected: "same-origin",
          actual: "same-origin",
          passed: true
        },
        "Cross-Origin-Embedder-Policy": {
          expected: "require-corp",
          actual: "require-corp",
          passed: true
        },
        "Cross-Origin-Resource-Policy": {
          expected: "same-origin",
          actual: "same-origin",
          passed: true
        }
      }
    });
    expect(report.assets).toHaveLength(requiredAssets.length);
    expect(report.assets.every((asset: { passed: boolean }) => asset.passed)).toBe(true);
    expect(
      report.assets.some((asset: { path: string }) =>
        asset.path.endsWith("orbit-local-model-manifest.json")
      )
    ).toBe(true);
  });

  it("fails when a required isolation header and model asset are missing", async () => {
    const { verifyMoonshineHosting } = await import(verifierModuleUrl);

    const report = await verifyMoonshineHosting({
      baseUrl: "https://staging.example.test",
      fetchImpl: createFetchFixture({
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Resource-Policy": "same-origin"
        },
        missingAssets: new Set([
          "/models/live-stt/onnx-community/moonshine-tiny-ko-ONNX/onnx/decoder_model_merged_q4.onnx"
        ])
      })
    });

    expect(report.status).toBe("fail");
    expect(report.headers["Cross-Origin-Embedder-Policy"]).toMatchObject({
      expected: "require-corp",
      actual: null,
      passed: false
    });
    expect(
      report.assets.find((asset: { path: string }) =>
        asset.path.endsWith("decoder_model_merged_q4.onnx")
      )
    ).toMatchObject({
      status: 404,
      passed: false
    });
  });
});

function createFetchFixture(options: {
  headers: Record<string, string>;
  missingAssets: Set<string>;
}) {
  return async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") {
      return new Response(null, {
        status: 200,
        headers: options.headers
      });
    }
    if (!requiredAssets.includes(url.pathname) || options.missingAssets.has(url.pathname)) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": "8"
      }
    });
  };
}
