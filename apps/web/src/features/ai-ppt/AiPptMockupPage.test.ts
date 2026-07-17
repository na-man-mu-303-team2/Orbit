import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAiPptGenerateDeckPayload,
  defaultPaletteOptions,
  fetchDeckColorCustomization,
  getAiPptWizardValidationMessage,
  mergeAiPptContentFormData,
  mergeReferenceFiles,
  miniSlideFontStyles,
  pollJob,
} from "./AiPptMockupPage";

const form = {
  topic: "하반기 제품 전략",
  content: "고객 문제와 핵심 로드맵을 설명한다.",
  audience: "제품·개발 리드",
  tone: "professional" as const,
};

describe("AI PPT simplified input", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates only topic, content, and audience", () => {
    expect(getAiPptWizardValidationMessage({ ...form, topic: "" })).toBe(
      "발표 주제를 입력하세요.",
    );
    expect(getAiPptWizardValidationMessage({ ...form, content: "" })).toBe(
      "발표 내용을 입력하세요.",
    );
    expect(getAiPptWizardValidationMessage({ ...form, audience: "" })).toBe(
      "청중을 입력하세요.",
    );
    expect(getAiPptWizardValidationMessage(form)).toBe("");
  });

  it("restores the three content fields from form data", () => {
    const data = new FormData();
    data.set("topic", "새 주제");
    data.set("content", "새 내용");
    data.set("audience", "새 청중");

    expect(mergeAiPptContentFormData(form, data)).toMatchObject({
      topic: "새 주제",
      content: "새 내용",
      audience: "새 청중",
      tone: "professional",
    });
  });

  it("uses the fixed generation defaults without references", () => {
    const payload = buildAiPptGenerateDeckPayload(
      form,
      defaultPaletteOptions[0],
    );

    expect(payload.prompt).toBe(form.content);
    expect(payload.brief).toMatchObject({
      audienceText: form.audience,
      durationMinutes: 10,
      referencePolicy: "user-input-only",
    });
    expect(payload.targetDurationMinutes).toBe(10);
    expect(payload.slideCountRange).toEqual({ min: 5, max: 8 });
    expect(payload.design.mediaPolicy).toBe("minimal");
    expect(payload.referenceFileIds).toEqual([]);
    expect(payload.coachingContext).toEqual({
      briefRef: { mode: "generic" },
      evaluatorLensRef: { lensId: "general-novice", revision: 1 },
    });
    expect(payload.design.fontOverride?.fontId).toBe("pretendard");
  });

  it("switches to references-first and forwards file ids to the staged job", () => {
    const payload = buildAiPptGenerateDeckPayload(
      form,
      defaultPaletteOptions[0],
      ["file_1", "file_2"],
    );

    expect(payload.referencePolicy).toBe("references-first");
    expect(payload.brief.referencePolicy).toBe("references-first");
    expect(payload.referenceFileIds).toEqual(["file_1", "file_2"]);
    expect(payload.references).toEqual([
      { fileId: "file_1" },
      { fileId: "file_2" },
    ]);
    expect(payload.referenceContext).toEqual([]);
  });

  it("provides the nine approved palettes", () => {
    expect(defaultPaletteOptions.map((option) => option.optionId)).toEqual([
      "brandlogy-blue",
      "executive-slate",
      "modern-violet",
      "resort-blue",
      "calm-green",
      "energetic-coral",
      "warm-amber",
      "editorial-rose",
      "graphite-night",
    ]);
    expect(defaultPaletteOptions[6]?.palette).toMatchObject({
      primary: "#D97706",
      accentColor: "#2563EB",
    });
    expect(defaultPaletteOptions[8]?.palette.background).toBe("#0F172A");
  });

  it("builds the existing font preview stack safely", () => {
    expect(
      miniSlideFontStyles({
        headingFontFamily: 'Heading "Unsafe"',
        bodyFontFamily: "Body Font",
        fallbackFamily: "Arial",
      }),
    ).toEqual({
      heading: { fontFamily: '"Heading Unsafe", Arial, sans-serif' },
      body: { fontFamily: '"Body Font", Arial, sans-serif' },
    });
  });

  it("keeps one copy of duplicate attachments", () => {
    const first = new File(["a"], "brief.pdf", { lastModified: 1 });
    const duplicate = new File(["b"], "brief.pdf", { lastModified: 1 });
    Object.defineProperty(duplicate, "size", { value: first.size });

    expect(mergeReferenceFiles([first], [duplicate])).toHaveLength(1);
  });

  it("posts one strict palette customization request", async () => {
    const option = {
      optionId: "ai-custom",
      name: "따뜻한 포인트",
      palette: defaultPaletteOptions[0].palette,
      rationale: "포인트 색상을 따뜻하게 조정했습니다.",
    };
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ option }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchDeckColorCustomization({
        topic: form.topic,
        instruction: "포인트만 따뜻하게",
        basePalette: defaultPaletteOptions[0].palette,
        stylePackId: "brandlogy-modern",
        tone: form.tone,
      }),
    ).resolves.toEqual({ option });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/ai/deck-color-customization",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("polls through the existing job route", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jobId: "job_1",
            projectId: "project_1",
            type: "ai-deck-generation",
            status: "succeeded",
            progress: 100,
            message: "done",
            result: null,
            error: null,
            createdAt: "2026-07-17T00:00:00.000Z",
            updatedAt: "2026-07-17T00:00:01.000Z",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(pollJob("job_1")).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/jobs/job_1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("does not run standalone extraction or save a Presentation Brief", () => {
    const source = fs.readFileSync(
      new URL("./AiPptMockupPage.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("/references/extractions");
    expect(source).not.toContain("putPresentationBrief");
    expect(source).not.toContain("Saved Design Pack");
    expect(source).not.toContain("referencePolicyOptions");
    expect(source).not.toContain("/generation/${encodeURIComponent(jobId)}/story");
    expect(source).toContain("storyPlanPath(projectId, jobId)");
  });
});
