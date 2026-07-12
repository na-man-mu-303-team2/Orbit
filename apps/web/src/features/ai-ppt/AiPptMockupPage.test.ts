import type { Job } from "@orbit/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAiPptAdvisorSuggestions,
  buildAiPptGenerateDeckPayload,
  buildBrandKitValues,
  buildReferenceGrounding,
  briefFieldPlaceholders,
  getAiPptGenerationStatus,
  getAiPptWizardValidationMessage,
  getAiPptQualityFailure,
  getReferenceExtractionValidationMessage,
  miniSlideFontStyles,
  initialAiPptWizardState,
  pollJob,
  removeAppliedAdvisorSuggestion,
  requestPptAdvisor,
  startReferenceExtraction,
  toAiPptUserErrorMessage,
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

  it("keeps Brief examples as placeholders instead of submitted state", () => {
    expect(initialAiPptWizardState).toMatchObject({
      topic: "",
      purpose: "",
      context: "",
      audience: "",
      presentationType: "",
      successCriteria: "",
      duration: "",
      slides: ""
    });
    expect(Object.values(briefFieldPlaceholders).every(Boolean)).toBe(true);
    expect(JSON.stringify(initialAiPptWizardState)).not.toContain(
      briefFieldPlaceholders.successCriteria
    );
  });

  it("parses quality-gate issues without treating them as a network error", () => {
    const issues = Array.from({ length: 6 }, (_, index) => ({
      code: `QUALITY_${index + 1}`,
      scope: "slide" as const,
      severity: "warning" as const,
      blocking: false,
      path: `slides.${index}.elements`,
      message: `quality issue ${index + 1}`
    }));
    const job: Job = {
      jobId: "job-quality",
      projectId: "project-quality",
      type: "ai-deck-generation",
      status: "failed",
      progress: 90,
      message: "AI deck generation failed.",
      result: {
        validation: {
          passed: false,
          layoutIssues: issues,
          contentIssues: [],
          designIssues: [],
          presentationIssues: []
        }
      },
      error: {
        code: "GENERATE_DECK_QUALITY_GATE_FAILED",
        message: "quality gate failed"
      },
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:01.000Z"
    };

    expect(getAiPptQualityFailure(job)).toEqual({
      issues: issues.slice(0, 5).map((issue, index) => ({
        code: issue.code,
        message: issue.message,
        slide: index + 1
      })),
      remainingCount: 1
    });
    expect(
      getAiPptQualityFailure({
        ...job,
        error: { code: "NETWORK_ERROR", message: "network" }
      })
    ).toBeNull();
  });

  it("shows visual QA unavailability as a retryable quality failure", () => {
    const job: Job = {
      jobId: "job-visual",
      projectId: "project-visual",
      type: "ai-deck-generation",
      status: "failed",
      progress: 90,
      message: "AI deck generation failed.",
      result: {
        validation: {
          passed: true,
          layoutIssues: [],
          contentIssues: [],
          designIssues: [],
          presentationIssues: []
        }
      },
      error: {
        code: "GENERATE_DECK_VISUAL_QA_UNAVAILABLE",
        message: "Vision QA provider unavailable."
      },
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:01.000Z"
    };

    expect(getAiPptQualityFailure(job)).toEqual({
      issues: [
        {
          code: "GENERATE_DECK_VISUAL_QA_UNAVAILABLE",
          message: "Vision QA provider unavailable."
        }
      ],
      remainingCount: 0
    });
  });

  it("maps worker progress to the seven visual generation stages", () => {
    const job = {
      jobId: "job-progress",
      projectId: "project-progress",
      type: "ai-deck-generation" as const,
      status: "running" as const,
      progress: 85,
      message: "repair",
      result: null,
      error: null,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:01.000Z"
    };

    expect(getAiPptGenerationStatus(job)).toBe("6/7 시각 품질 보정");
  });

  it.each([
    ["purpose", "발표 목적을 입력하세요."],
    ["context", "발표 맥락을 입력하세요."],
    ["audience", "청중을 입력하세요."],
    ["presentationType", "발표 유형을 입력하세요."],
    ["successCriteria", "성공 기준을 입력하세요."]
  ] as const)("requires the %s Brief field", (field, expected) => {
    expect(
      getAiPptWizardValidationMessage({
        topic: "AI PPT",
        purpose: "목적",
        context: "맥락",
        audience: "청중",
        presentationType: "제안",
        successCriteria: "합의",
        duration: "10",
        slides: "",
        tone: "professional",
        colorMood: "blue",
        fontMood: "professional",
        mediaPolicy: "minimal",
        referencePolicy: "topic-only",
        [field]: ""
      })
    ).toBe(expected);
  });

  it("applies the selected heading and body fonts to slide previews", () => {
    expect(
      miniSlideFontStyles({
        headingFontFamily: "Gowun Dodum",
        bodyFontFamily: "Noto Sans KR",
        fallbackFamily: "Arial"
      })
    ).toEqual({
      heading: { fontFamily: '"Gowun Dodum", Arial, sans-serif' },
      body: { fontFamily: '"Noto Sans KR", Arial, sans-serif' }
    });
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
        min: 6,
        max: 10
      },
      design: {
        stylePackId: "brandlogy-modern",
        engineVersion: "program-v2",
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
    expect(payload.designPrompt).toContain("mediaPolicy=minimal");
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

  it("keeps hybrid official and AI image policy in the program-v2 request", () => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "제품 공개",
        purpose: "신제품 특징 소개",
        context: "공개 발표",
        audience: "예비 사용자",
        presentationType: "product launch",
        successCriteria: "출시 기대 형성",
        duration: "10",
        slides: "10",
        tone: "confident",
        colorMood: "energetic",
        fontMood: "bold Korean sans",
        mediaPolicy: "hybrid",
        referencePolicy: "research-first"
      },
      palette
    );

    expect(payload.design).toMatchObject({
      engineVersion: "program-v2",
      mediaPolicy: "hybrid"
    });
    expect(payload.visualPlanPolicy).toEqual({ mediaPolicy: "hybrid" });
    expect(payload.designPrompt).toContain("mediaPolicy=hybrid");
  });

  it("pins the selected Saved Design Pack version in the generation request", () => {
    const savedSelection = {
      id: "design_pack_user_1",
      version: 4,
      name: "Must not leak"
    };
    const brandSelection = {
      id: "brand_kit_org_1",
      version: 2,
      values: { mustNotLeak: true }
    };
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "Reusable report",
        purpose: "Monthly review",
        context: "leadership meeting",
        audience: "executives",
        presentationType: "report",
        successCriteria: "approve next actions",
        duration: "10",
        slides: "8",
        tone: "professional",
        colorMood: "trusted blue",
        fontMood: "professional Korean sans",
        mediaPolicy: "minimal",
        referencePolicy: "topic-only"
      },
      palette,
      [],
      undefined,
      undefined,
      savedSelection,
      brandSelection
    );

    expect(payload.savedDesignPack).toEqual({
      id: "design_pack_user_1",
      version: 4
    });
    expect(payload.brandKit).toEqual({
      id: "brand_kit_org_1",
      version: 2
    });
    expect(Object.keys(payload.savedDesignPack ?? {})).toEqual(["id", "version"]);
    expect(Object.keys(payload.brandKit ?? {})).toEqual(["id", "version"]);
  });

  it("builds a locked Brand Kit from the current session style", () => {
    const values = buildBrandKitValues(
      {
        topic: "Brand",
        purpose: "Launch",
        context: "All hands",
        audience: "team",
        presentationType: "launch",
        successCriteria: "understand",
        duration: "10",
        slides: "8",
        tone: "confident",
        colorMood: "blue",
        fontMood: "professional",
        mediaPolicy: "public-assets",
        referencePolicy: "research-first"
      },
      palette,
      {
        fontId: "brand-font",
        name: "Brand Font",
        headingFontFamily: "Brand Sans",
        bodyFontFamily: "Brand Sans",
        fallbackFamily: "Arial",
        weights: [400, 700],
        supportsKorean: true,
        pptxEmbeddable: false,
        moodTags: [],
        license: "",
        sourceUrl: "",
        recommendedTitleSize: 48,
        recommendedBodySize: 22,
        lineHeight: 1.24,
        widthFactor: 1,
        overflowRisk: "medium",
        rationale: "brand",
        score: 100
      }
    );

    expect(values).toMatchObject({
      palette: palette.palette,
      typography: {
        headingFontFamily: "Brand Sans",
        fallbackFamily: "Arial"
      },
      tone: "confident",
      mediaPolicy: "public-assets",
      lockedFields: ["palette", "typography", "tone", "mediaPolicy"]
    });
  });

  it("keeps a one-slide request within the valid lower bound", () => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "Short update",
        purpose: "Share one update",
        context: "standup",
        audience: "team",
        presentationType: "briefing",
        successCriteria: "understand the update",
        duration: "1",
        slides: "1",
        tone: "concise",
        colorMood: "blue",
        fontMood: "professional",
        mediaPolicy: "minimal",
        referencePolicy: "topic-only"
      },
      palette
    );

    expect(payload.slideCountRange).toEqual({ min: 1, max: 3 });
  });

  it.each([
    ["19", { min: 17, max: 20 }],
    ["20", { min: 18, max: 20 }]
  ])("keeps a %s-slide request within the valid upper bound", (slides, expected) => {
    const payload = buildAiPptGenerateDeckPayload(
      {
        topic: "Large deck",
        purpose: "Detailed review",
        context: "workshop",
        audience: "team",
        presentationType: "training",
        successCriteria: "shared understanding",
        duration: "20",
        slides,
        tone: "professional",
        colorMood: "blue",
        fontMood: "professional",
        mediaPolicy: "minimal",
        referencePolicy: "topic-only"
      },
      palette
    );

    expect(payload.slideCountRange).toEqual(expected);
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
        colorMood: "흰 색 배경, 사용자들에게 신뢰를 줄 수 있는 포인트 색상. 그라데이션과 파스텔톤은 사용하지 않기",
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
    expect(payload.design.mediaPolicy).toBe("ai-generated");
    expect(payload.visualPlanPolicy).toEqual({ mediaPolicy: "ai-generated" });
    expect(payload.designPrompt).toContain("mediaPolicy=ai-generated");
  });

  it("includes only usable extraction context and de-duplicated keywords", () => {
    const result = {
      files: [
        {
          projectId: "project-1",
          referenceDocumentId: "file-1",
          fileId: "file-1",
          fileName: "brief.pdf",
          kind: "pdf" as const,
          status: "succeeded" as const,
          message: "",
          rawText: "raw brief",
          cleanedText: "clean brief",
          cleanupStatus: "succeeded",
          cleanupMessage: "",
          keywords: [
            { keyword: "MVP", reason: "core", priority: "high" },
            { keyword: "mvp", reason: "duplicate", priority: "medium" }
          ],
          keywordStatus: "succeeded",
          keywordMessage: "",
          indexingStatus: "unavailable",
          indexingMessage: "",
          chunkCount: 0,
          sections: [],
          usable: true
        },
        {
          projectId: "project-1",
          referenceDocumentId: "file-2",
          fileId: "file-2",
          fileName: "blank.pdf",
          kind: "pdf" as const,
          status: "failed" as const,
          message: "blank",
          rawText: "",
          cleanedText: "",
          cleanupStatus: "failed",
          cleanupMessage: "",
          keywords: [],
          keywordStatus: "skipped",
          keywordMessage: "",
          indexingStatus: "skipped",
          indexingMessage: "",
          chunkCount: 0,
          sections: [],
          usable: false
        }
      ]
    };

    expect(buildReferenceGrounding(result)).toEqual({
      referenceKeywords: [{ text: "MVP" }],
      referenceContext: [
        { fileId: "file-1", title: "brief.pdf", content: "clean brief" }
      ]
    });
    expect(
      getReferenceExtractionValidationMessage(
        "references-only",
        ["file-1", "file-2"],
        result
      )
    ).toContain("모든 파일");
    expect(
      getReferenceExtractionValidationMessage(
        "references-first",
        ["file-1", "file-2"],
        result
      )
    ).toBe("");
  });

  it("starts project-scoped extraction before deck generation", async () => {
    const job = {
      jobId: "job_extract_1",
      projectId: "project-1",
      type: "reference-extract" as const,
      status: "queued" as const,
      progress: 0,
      message: "queued",
      result: null,
      error: null,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z"
    };
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ fileIds: ["file-1"], job }))
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      startReferenceExtraction("project-1", ["file-1"])
    ).resolves.toEqual(job);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/references/extractions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ fileIds: ["file-1"] })
      })
    );
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
      value: 4
    });
    expect(form.slides).toBe("");
  });

  it("removes an applied side advisor suggestion", () => {
    const suggestions = [
      { field: "slides" as const, value: 7, label: "7 slides", reason: "fit" },
      {
        field: "fontMood" as const,
        value: "friendly",
        label: "Friendly font",
        reason: "tone"
      }
    ];

    expect(removeAppliedAdvisorSuggestion(suggestions, suggestions[0])).toEqual([
      suggestions[1]
    ]);
  });

  it("converts research quality failures into an actionable message", () => {
    expect(
      toAiPptUserErrorMessage(
        JSON.stringify({
          detail:
            "WEB_RESEARCH_QUALITY_FAILED: official and independent sources missing"
        })
      )
    ).toBe(
      "주제와 직접 관련된 공식 출처와 독립 출처를 충분히 확인하지 못했습니다. 주제명을 더 구체적으로 입력하거나 잠시 후 다시 시도해 주세요."
    );
  });

  it("keeps ai-generated media policy out of advisor override suggestions", () => {
    const suggestions = buildAiPptAdvisorSuggestions({
      topic: "Visual planning",
      purpose: "planning",
      context: "review",
      audience: "team",
      presentationType: "proposal",
      successCriteria: "alignment",
      duration: "7",
      slides: "",
      tone: "friendly",
      colorMood: "black background with readable accents",
      fontMood: "funny easy read Korean sans font",
      mediaPolicy: "ai-generated",
      referencePolicy: "references-first"
    });

    expect(suggestions).not.toContainEqual(
      expect.objectContaining({
        field: "mediaPolicy",
        value: "minimal"
      })
    );
  });

  it("sends bounded session state to the authenticated advisor route", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "7장이 적당합니다.",
          suggestions: [
            {
              field: "slides",
              value: 7,
              label: "7장 구성",
              reason: "토론 시간을 확보합니다."
            }
          ]
        })
      )
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      requestPptAdvisor(
        {
          topic: "MVP 회고",
          purpose: "다음 행동 합의",
          context: "팀 토론",
          audience: "제품팀",
          presentationType: "discussion",
          successCriteria: "합의",
          duration: "7",
          slides: "",
          tone: "friendly",
          colorMood: "신뢰감 있는 파랑",
          fontMood: "둥근 한글 고딕",
          mediaPolicy: "ai-generated",
          referencePolicy: "references-first"
        },
        "몇 장이 적당해?",
        Array.from({ length: 8 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `message-${index}`
        }))
      )
    ).resolves.toMatchObject({
      suggestions: [expect.objectContaining({ field: "slides", value: 7 })]
    });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/ai/ppt-advisor",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.history).toHaveLength(6);
    expect(body.design.mediaPolicy).toBe("ai-generated");
    expect(body.brief.duration).toBe(7);
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
    const onUpdate = vi.fn();

    await expect(pollJob("job_1", onUpdate)).resolves.toMatchObject({
      jobId: "job_1",
      status: "succeeded"
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job_1", progress: 100 })
    );
    expect(String(fetcher.mock.calls[0][0])).toBe("/api/jobs/job_1");
  });
});
