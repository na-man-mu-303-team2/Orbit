import { describe, expect, it } from "vitest";
import type { Response } from "express";
import { applyAssetContentSecurityHeaders } from "./asset-content-headers";

function createResponse(): {
  response: Response;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const response = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as Response;
  return { response, headers };
}

describe("applyAssetContentSecurityHeaders", () => {
  it("keeps imported SVG inert when the URL is opened directly", () => {
    const { response, headers } = createResponse();

    applyAssetContentSecurityHeaders(response, "image/svg+xml");

    expect(headers["content-security-policy"]).toContain("sandbox");
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  it("matches SVG regardless of charset parameter or casing", () => {
    const { response, headers } = createResponse();

    applyAssetContentSecurityHeaders(response, "Image/SVG+XML; charset=utf-8");

    expect(headers["content-security-policy"]).toContain("sandbox");
  });

  it("leaves raster assets without a document policy", () => {
    const { response, headers } = createResponse();

    applyAssetContentSecurityHeaders(response, "image/png");

    expect(headers["content-security-policy"]).toBeUndefined();
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
