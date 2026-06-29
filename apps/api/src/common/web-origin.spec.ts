import { describe, expect, it } from "vitest";
import { normalizeHttpOrigin, resolveAllowedWebOrigins } from "./web-origin";

describe("web origin helpers", () => {
  it("normalizes valid http origins", () => {
    expect(normalizeHttpOrigin("http://localhost:5173/path?q=1")).toBe(
      "http://localhost:5173",
    );
    expect(normalizeHttpOrigin("https://orbit.example.com/editor")).toBe(
      "https://orbit.example.com",
    );
  });

  it("rejects invalid or unsupported origins", () => {
    expect(normalizeHttpOrigin("")).toBeNull();
    expect(normalizeHttpOrigin("ftp://localhost:5173")).toBeNull();
    expect(normalizeHttpOrigin("not-a-url")).toBeNull();
  });

  it("allows both localhost and 127.0.0.1 for local web origins", () => {
    expect(resolveAllowedWebOrigins("http://localhost:5173")).toEqual([
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
    expect(resolveAllowedWebOrigins("http://127.0.0.1:4173")).toEqual([
      "http://127.0.0.1:4173",
      "http://localhost:4173",
    ]);
  });

  it("keeps remote origins unchanged", () => {
    expect(resolveAllowedWebOrigins("https://orbit.example.com")).toEqual([
      "https://orbit.example.com",
    ]);
  });
});
