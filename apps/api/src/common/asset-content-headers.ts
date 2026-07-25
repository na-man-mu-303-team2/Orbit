import type { Response } from "express";

/**
 * Content types that execute script when a browser treats them as a document.
 * PPTX imports store SVG icons and background art verbatim to keep them
 * editable, so a hostile deck could otherwise smuggle script into an asset URL
 * that is same-origin with the app.
 */
const activeContentTypes = new Set(["image/svg+xml", "image/svg"]);

const inertDocumentPolicy = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/**
 * Harden an asset response so it stays usable as an image but inert as a
 * document. Rendering through `<img>`/canvas ignores these headers; direct
 * navigation to the URL does not.
 */
export function applyAssetContentSecurityHeaders(
  response: Response,
  contentType: string,
): void {
  response.setHeader("x-content-type-options", "nosniff");
  if (!activeContentTypes.has(contentType.split(";")[0].trim().toLowerCase())) {
    return;
  }
  response.setHeader("content-security-policy", inertDocumentPolicy);
  response.setHeader("content-disposition", "inline");
}
