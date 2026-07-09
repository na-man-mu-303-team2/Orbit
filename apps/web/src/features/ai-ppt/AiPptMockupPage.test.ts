import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAiPptGenerateDeckPayload,
  getAiPptWizardValidationMessage,
  pollJob,
  type PaletteOption
} from "./AiPptMockupPage";

const palette: PaletteOption = {
  optionId: "resort-blue",
  name: "Resort Blue",
  rationale: "trust",
  palette: {
    primary: "#0EA5E9",
    secondary: "#0369A1",
    background: "#F0F9FF",
    surface: "#FFFFFF",
    muted: "#E0F2FE",
    border: "#BAE6FD",
    text: "#0F172A",
    accentColor: "#F472B6"
  }
};

describe("AI PPT wizard payload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("compiles wizard answers into GenerateDeckRequest", () => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: " JSON-first AI PPT ",
        purpose: "Deck JSON source of truth",
        context: "internal review",
        audience: "PM and engineers",
        presentationType: "planning proposal",
        successCriteria: "agree on phase 1",
        duration: "15",
        slides: "8",
        tone: "professional",
        colorMood: "calm blue",
        referencePolicy: "references-first"
      },
      palette,
      ["file_reference_1"]
    );

    expect(payload).toMatchObject({
      topic: "JSON-first AI PPT",
      brief: {
        presentationContext: "internal review",
        audienceText: "PM and engineers",
        presentationType: "planning proposal",
        successCriteria: "agree on phase 1",
        durationMinutes: 15,
        referencePolicy: "references-first"
      },
      slideCountRange: {
        min: 8,
        max: 8
      },
      design: {
        stylePackId: "brandlogy-modern",
        paletteOverride: {
          primary: "#0EA5E9",
          accentColor: "#F472B6"
        }
      },
      references: [{ fileId: "file_reference_1" }]
    });
    expect(payload.designPrompt).toContain("base=brandlogy-modern");
    expect(payload.designPrompt).toContain("output=Deck JSON first");
  });

  it("blocks references-only generation without a reference file", () => {
    const message = getAiPptWizardValidationMessage({
      topic: "AI PPT",
      purpose: "planning",
      context: "review",
      audience: "team",
      presentationType: "proposal",
      successCriteria: "alignment",
      duration: "10",
      slides: "6",
      tone: "professional",
      colorMood: "blue",
      referencePolicy: "references-only"
    });

    expect(message).toBe("참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요.");
  });

  it("polls generated deck jobs through the existing job route", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jobId: "job_1",
          projectId: "project_1",
          type: "generate-deck",
          status: "succeeded",
          progress: 100,
          message: "done",
          result: null,
          error: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(pollJob("job_1")).resolves.toMatchObject({
      jobId: "job_1",
      status: "succeeded"
    });
    expect(String(fetcher.mock.calls[0][0])).toBe("/api/jobs/job_1");
  });
});
