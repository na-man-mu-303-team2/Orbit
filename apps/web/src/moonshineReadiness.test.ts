import { describe, expect, it } from "vitest";

const readinessModuleUrl = new URL(
  "../scripts/evaluate-moonshine-readiness.mjs",
  import.meta.url
).href;

describe("Moonshine cutover readiness", () => {
  it("returns ready only when quality gate, hosting, and canary evidence pass", async () => {
    const { evaluateMoonshineReadiness } = await import(readinessModuleUrl);

    const readiness = evaluateMoonshineReadiness({
      qualityGate: {
        source: "docs/spikes/moonshine-korean-asr-gate.json",
        report: {
          status: "go",
          comparisons: [{ status: "go" }]
        }
      },
      hosting: {
        source: "docs/spikes/moonshine-hosting-verification.json",
        report: {
          status: "pass",
          baseUrl: "https://staging.example.test"
        }
      },
      canary: {
        source: "docs/spikes/moonshine-canary-debug-summary.json",
        report: {
          status: "ok",
          segmentCount: 12,
          zeroResultRate: 0.08,
          nonEmptyResultRate: 0.92
        }
      }
    });

    expect(readiness).toMatchObject({
      status: "ready",
      blockers: [],
      checks: {
        qualityGate: {
          status: "pass",
          requiredStatus: "go",
          actualStatus: "go"
        },
        hosting: {
          status: "pass",
          requiredStatus: "pass",
          actualStatus: "pass"
        },
        canary: {
          status: "pass",
          requiredStatus: "ok",
          actualStatus: "ok"
        }
      }
    });
    expect(readiness.generatedAt).toEqual(expect.any(String));
  });

  it("blocks cutover when required evidence is missing or not passing", async () => {
    const { evaluateMoonshineReadiness, renderMoonshineReadinessMarkdown } =
      await import(readinessModuleUrl);

    const readiness = evaluateMoonshineReadiness({
      qualityGate: {
        source: "docs/spikes/moonshine-korean-asr-gate.json",
        report: {
          status: "blocked",
          missingCriteria: ["humanAudioSource"]
        }
      },
      hosting: null,
      canary: {
        source: "docs/spikes/moonshine-canary-debug-summary.json",
        report: {
          status: "empty",
          segmentCount: 0
        }
      }
    });

    expect(readiness).toMatchObject({
      status: "blocked",
      checks: {
        qualityGate: {
          status: "fail",
          requiredStatus: "go",
          actualStatus: "blocked"
        },
        hosting: {
          status: "missing",
          requiredStatus: "pass",
          actualStatus: null
        },
        canary: {
          status: "fail",
          requiredStatus: "ok",
          actualStatus: "empty"
        }
      },
      blockers: [
        "qualityGate: expected go, received blocked",
        "hosting: missing evidence",
        "canary: expected ok, received empty"
      ]
    });

    const markdown = renderMoonshineReadinessMarkdown(readiness);
    expect(markdown).toContain("Status: **blocked**");
    expect(markdown).toContain("- qualityGate: expected go, received blocked");
    expect(markdown).toContain("| hosting | pass | n/a | missing |");
  });
});
