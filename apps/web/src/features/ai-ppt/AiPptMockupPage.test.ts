import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAiPptAdvisorSuggestions,
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
        fontMood: "professional Korean sans",
        mediaPolicy: "minimal",
        referencePolicy: "references-first"
      },
      palette,
      ["file_reference_1"]
    );

    expect(payload).toMatchObject({
      generationMode: "design-pack",
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
        colorIntent: {
          mood: "calm",
          energyLevel: "low",
          preferredHue: "blue"
        },
        constraints: {
          canvasBackground: "auto",
          forbiddenStyles: []
        },
        paletteOverride: {
          primary: "#0EA5E9",
          accentColor: "#F472B6"
        }
      },
      references: [{ fileId: "file_reference_1" }]
    });
    expect(payload.designPrompt).toContain("base=brandlogy-modern");
    expect(payload.designPrompt).toContain("font=Pretendard");
    expect(payload.designPrompt).toContain("output=Deck JSON first");
    expect(payload.design.fontOverride).toMatchObject({
      fontId: "pretendard",
      bodyFontFamily: "Pretendard",
      recommendedBodySize: 22,
      overflowRisk: "low"
    });
    expect(payload.design.mediaPolicy).toBe("minimal");
    expect(payload.visualPlanPolicy).toEqual({ mediaPolicy: "minimal" });
    expect(payload.referencePolicy).toBe("references-first");
    expect(payload.referenceFileIds).toEqual(["file_reference_1"]);
  });

  it("derives design-pack constraints and slide count from natural language intent", () => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "서비스 신뢰도 개선",
        purpose: "사용자에게 신뢰를 주는 발표",
        context: "임원 회의",
        audience: "회사 임원",
        presentationType: "기획 발표",
        successCriteria: "3분 안에 핵심 합의",
        duration: "3",
        slides: "",
        tone: "professional",
        colorMood: "흰 색 배경, 사용자들에게 신뢰를 줄 수 있는 포인트 색상. 그라데이션 금지, 파스텔톤 금지",
        fontMood: "formal trustworthy Korean sans",
        mediaPolicy: "minimal",
        referencePolicy: "topic-only"
      },
      palette
    );

    expect(payload.slideCountRange).toEqual({ min: 4, max: 4 });
    expect(payload.design.colorIntent).toMatchObject({
      mood: "trustworthy",
      trustLevel: "high",
      formality: "formal",
      preferredHue: "blue",
      backgroundPreference: "white",
      forbiddenStyles: ["gradient", "pastel"]
    });
    expect(payload.design.constraints).toEqual({
      canvasBackground: "white",
      forbiddenStyles: ["gradient", "pastel"]
    });
  });

  it("derives seven slides for a 7 minute friendly easy-read deck", () => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "1차 MVP 회고",
        purpose: "자유롭게 토의하는 발표",
        context: "직급 관계 없이 의견을 나누는 자리",
        audience: "PM and engineers",
        presentationType: "discussion",
        successCriteria: "agree on next actions",
        duration: "7",
        slides: "",
        tone: "friendly",
        colorMood: "black background with readable accents",
        fontMood: "funny easy read Korean sans font",
        mediaPolicy: "ai-generated",
        referencePolicy: "references-first"
      },
      palette
    );

    expect(payload.slideCountRange).toEqual({ min: 7, max: 7 });
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
      fontMood: "professional Korean sans",
      mediaPolicy: "minimal",
      referencePolicy: "references-only"
    });

    expect(message).toBe("참고자료만으로 구성하려면 파일을 1개 이상 첨부하세요.");
  });

  it("builds side advisor suggestions without mutating the form", () => {
    const form = {
      topic: "Short deck",
      purpose: "planning",
      context: "review",
      audience: "team",
      presentationType: "proposal",
      successCriteria: "alignment",
      duration: "3",
      slides: "",
      tone: "professional" as const,
      colorMood: "blue",
      fontMood: "professional Korean sans",
      mediaPolicy: "minimal" as const,
      referencePolicy: "references-first" as const
    };

    const suggestions = buildAiPptAdvisorSuggestions(form);

    expect(suggestions[0]).toMatchObject({
      field: "slides",
      value: "4"
    });
    expect(form.slides).toBe("");
  });

  it("polls generated deck jobs through the existing job route", async () => {
    const fetcher = vi.fn(async (_input: string) =>
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
