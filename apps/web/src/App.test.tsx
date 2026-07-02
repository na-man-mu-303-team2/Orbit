import { renderToStaticMarkup } from "react-dom/server";
import type { Job, Project } from "@orbit/shared";
import type { ReactNode } from "react";
import { forwardRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildDesignReferences,
  buildGenerateDeckPayload,
  buildGenerateDeckDesignDirection,
  buildReferenceGenerationInput,
  createGeneratedDeckProject,
  ExtractResultItem,
  GeneratedDeckResult,
  getGeneratedDeckProjectPath,
  getGeneratedDeckProjectTitle,
  getGenerateDeckJobResult,
  getJobResultFiles,
  mergeGeneratedProjectList,
  pollExtractJob,
  resolveGenerateDeckTargetProject,
  shouldRenderAppFrame
} from "./App";

vi.mock("react-konva", () => {
  const Group = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  const Stage = forwardRef<HTMLDivElement, { children?: ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>
  );
  const Text = ({ text }: { text?: string }) => <span>{text}</span>;

  return {
    Arrow: () => <span data-konva-arrow="true" />,
    Circle: () => <span data-konva-circle="true" />,
    Group,
    Image: () => <span data-konva-image="true" />,
    Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Line: () => <span data-konva-line="true" />,
    Rect: () => <span data-konva-rect="true" />,
    RegularPolygon: () => <span data-konva-polygon="true" />,
    Shape: () => <span data-konva-shape="true" />,
    Star: () => <span data-konva-star="true" />,
    Stage,
    Text
  };
});

describe("App shell routing", () => {
  it("keeps the login page outside the shared navigation shell", () => {
    expect(shouldRenderAppFrame({ name: "login" })).toBe(false);
    expect(
      shouldRenderAppFrame({
        name: "rehearsal-report",
        projectId: "project_demo_1",
        runId: "run_demo_1"
      })
    ).toBe(false);
    expect(shouldRenderAppFrame({ name: "home" })).toBe(true);
  });
});

describe("reference extraction upload flow", () => {
  it("builds generate-deck references and keywords from succeeded extraction results", () => {
    const input = buildReferenceGenerationInput([
      {
        referenceDocumentId: " file_1 ",
        fileName: "success.pdf",
        kind: "pdf",
        status: "succeeded",
        rawText: "raw",
        keywords: [
          { keyword: "Deck", reason: "topic", priority: "high" },
          { keyword: " deck ", reason: "duplicate", priority: "medium" }
        ]
      },
      {
        referenceDocumentId: "file_2",
        fileName: "failed.pdf",
        kind: "pdf",
        status: "failed",
        rawText: "",
        keywords: [{ keyword: "ignored", reason: "failed", priority: "low" }]
      },
      {
        referenceDocumentId: "file_1",
        fileName: "duplicate.pdf",
        kind: "pdf",
        status: "succeeded",
        rawText: "raw",
        keywords: [{ keyword: "AI", reason: "topic", priority: "high" }]
      }
    ]);

    expect(input.references).toEqual([{ fileId: "file_1" }]);
    expect(input.referenceKeywords).toEqual([{ text: "Deck" }, { text: "AI" }]);
    expect(input.succeededFiles).toHaveLength(2);
    expect(input.failedFiles.map((file) => file.fileName)).toEqual(["failed.pdf"]);
  });

  it("polls a succeeded job and renders its result", async () => {
    const file = {
      fileName: "sample.pdf",
      kind: "pdf",
      status: "succeeded",
      message: "done",
      rawText: "raw text",
      cleanedText: "cleaned text",
      cleanupStatus: "succeeded",
      keywords: [{ keyword: "deck", reason: "topic", priority: "high" }],
      keywordStatus: "succeeded",
      indexingStatus: "indexed",
      indexingMessage: "stored",
      chunkCount: 2
    };
    const baseJob: Job = {
      jobId: "job-1",
      projectId: "project-a",
      type: "reference-extract",
      status: "running",
      progress: 10,
      message: "Reference extraction running.",
      result: null,
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:00.000Z"
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(baseJob)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...baseJob,
            status: "succeeded",
            progress: 100,
            result: { files: [file] }
          })
        )
      );

    const job = await pollExtractJob("job-1", { delayMs: 0, fetcher });
    const [result] = getJobResultFiles(job);
    const html = renderToStaticMarkup(<ExtractResultItem result={result} />);

    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/jobs/job-1");
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/jobs/job-1");
    expect(html).toContain("sample.pdf");
    expect(html).toContain("cleaned text");
    expect(html).toContain("2 chunks");
  });
});

describe("AI deck generation flow", () => {
  it("builds a generate-deck payload with design direction", () => {
    const payload = buildGenerateDeckPayload({
      topic: "ORBIT",
      prompt: "Generate slides",
      designPrompt: "retro pixel palette",
      duration: 10,
      minSlides: 5,
      maxSlides: 8,
      template: "report",
      metadata: {
        audience: "general",
        purpose: "inform",
        tone: "professional"
      },
      design: {
        profile: "executive-report",
        visualRhythm: "auto",
        densityTarget: "medium",
        mediaPolicy: "balanced",
        layoutDiversity: "varied"
      },
      designReferences: [{ fileId: "file_design_1" }],
      referenceInput: {
        references: [{ fileId: "file_1" }],
        referenceKeywords: [{ text: "Deck" }],
        succeededFiles: [],
        failedFiles: []
      }
    });

    expect(payload).toMatchObject({
      topic: "ORBIT",
      prompt: "Generate slides",
      designPrompt: "retro pixel palette",
      targetDurationMinutes: 10,
      slideCountRange: { min: 5, max: 8 },
      design: {
        profile: "executive-report",
        visualRhythm: "auto",
        densityTarget: "medium",
        mediaPolicy: "balanced",
        layoutDiversity: "varied"
      },
      references: [{ fileId: "file_1" }],
      designReferences: [{ fileId: "file_design_1" }],
      referenceKeywords: [{ text: "Deck" }]
    });
  });

  it("omits a design profile when the profile picker is automatic", () => {
    expect(
      buildGenerateDeckDesignDirection({
        profile: "auto",
        visualRhythm: "auto",
        densityTarget: "medium",
        mediaPolicy: "balanced",
        layoutDiversity: "varied"
      })
    ).toEqual({
      visualRhythm: "auto",
      densityTarget: "medium",
      mediaPolicy: "balanced",
      layoutDiversity: "varied"
    });

    expect(
      buildGenerateDeckDesignDirection({
        profile: "editorial",
        visualRhythm: "auto",
        densityTarget: "medium",
        mediaPolicy: "balanced",
        layoutDiversity: "varied"
      }).profile
    ).toBe("editorial");
  });

  it("defaults an omitted design prompt to an empty string", () => {
    const payload = buildGenerateDeckPayload({
      topic: "ORBIT",
      prompt: "Generate slides",
      duration: 10,
      minSlides: 5,
      maxSlides: 8,
      template: "report",
      metadata: {
        audience: "general",
        purpose: "inform",
        tone: "professional"
      },
      design: {
        profile: "executive-report",
        visualRhythm: "auto",
        densityTarget: "medium",
        mediaPolicy: "balanced",
        layoutDiversity: "varied"
      },
      designReferences: [],
      referenceInput: {
        references: [],
        referenceKeywords: [],
        succeededFiles: [],
        failedFiles: []
      }
    });

    expect(payload.designPrompt).toBe("");
  });

  it("builds design references from PPTX role uploads", () => {
    const pptx = new File(["pptx"], "design.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    });
    const pdf = new File(["pdf"], "content.pdf", { type: "application/pdf" });
    const uploadedFileIds = new Map([
      ["design-only", "file_design"],
      ["both", "file_both"]
    ]);

    expect(
      buildDesignReferences(
        [
          { id: "content", file: pdf, role: "content" },
          { id: "design-only", file: pptx, role: "design" },
          { id: "both", file: pptx, role: "both" }
        ],
        uploadedFileIds
      )
    ).toEqual([{ fileId: "file_design" }, { fileId: "file_both" }]);
  });

  it("keeps a generated project at the top of the project list cache", () => {
    const older: Project = {
      projectId: "project_old",
      workspaceId: "workspace_demo_1",
      title: "Old",
      createdBy: "user_demo_1",
      createdAt: "2026-06-28T00:00:00.000Z"
    };
    const generated: Project = {
      projectId: "project_new_ai",
      workspaceId: "workspace_demo_1",
      title: "New",
      createdBy: "user_demo_1",
      createdAt: "2026-06-29T00:00:00.000Z"
    };

    expect(mergeGeneratedProjectList([older], generated)).toEqual([
      generated,
      older
    ]);
    expect(mergeGeneratedProjectList([generated, older], generated)).toEqual([
      generated,
      older
    ]);
  });

  it("creates a new project for an AI deck generation", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/workspaces/workspace_demo_1/projects")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ title: "새 주제" });
        return new Response(
          JSON.stringify({
            projectId: "project_new_ai",
            workspaceId: "workspace_demo_1",
            title: "새 주제",
            createdBy: "user_demo_1",
            createdAt: "2026-06-29T00:00:00.000Z"
          })
        );
      }

      if (url.endsWith("/projects/project_new_ai/deck")) {
        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            deck: body.deck,
            snapshot: {
              snapshotId: "snapshot_new_ai",
              projectId: "project_new_ai",
              deckId: "deck_new_ai",
              version: 1,
              reason: "deck-replaced",
              createdAt: "2026-06-29T00:00:00.000Z"
            },
            updatedAt: "2026-06-29T00:00:00.000Z"
          })
        );
      }

      return new Response("unexpected request", { status: 500 });
    });

    await expect(createGeneratedDeckProject("  새 주제  ", fetcher)).resolves.toMatchObject({
      projectId: "project_new_ai"
    });
    expect(getGeneratedDeckProjectTitle("   ")).toBe("AI 덱");
  });

  it("uses a selected project as the generate-deck target", async () => {
    const selected: Project = {
      projectId: "project_selected",
      workspaceId: "workspace_demo_1",
      title: "Selected",
      createdBy: "user_demo_1",
      createdAt: "2026-06-29T00:00:00.000Z"
    };
    const fetcher = vi.fn(async () => new Response("unexpected", { status: 500 }));

    await expect(
      resolveGenerateDeckTargetProject({
        fetcher,
        projects: [selected],
        selectedProjectId: selected.projectId,
        topic: "새 주제"
      })
    ).resolves.toEqual({
      created: false,
      project: selected,
      projectId: selected.projectId
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads a generated deck job result and renders slide evidence", () => {
    const job: Job = {
      jobId: "job-2",
      projectId: "project-a",
      type: "ai-deck-generation",
      status: "succeeded",
      progress: 100,
      message: "AI deck generation completed.",
      result: {
        deckId: "deck_ai_1",
        deck: {
          deckId: "deck_ai_1",
          projectId: "project-a",
          title: "AI 덱 생성 발표안",
          version: 1,
          metadata: {
            language: "ko",
            locale: "ko-KR",
            sourceType: "ai",
            generatedBy: "ai"
          },
          canvas: {
            preset: "wide-16-9",
            width: 1920,
            height: 1080,
            aspectRatio: "16:9"
          },
          slides: [
            {
              slideId: "slide_1",
              order: 1,
              title: "AI 덱 생성",
              thumbnailUrl: "",
              style: {},
              speakerNotes: "발표자 노트",
              elements: [],
              keywords: [],
              animations: [],
              aiNotes: {
                emphasisPoints: ["핵심 메시지"],
                sourceEvidence: [{ fileId: "file_1", note: "근거 후보" }]
              }
            }
          ]
        },
        warnings: ["AI가 참고자료/주제 밀도를 기준으로 1장이 적정하다고 판단했습니다."],
        validation: {
          passed: true,
          layoutIssues: [],
          contentIssues: [],
          designIssues: [
            {
              scope: "element",
              path: "slides.0.elements.0.props.data",
              message: "근거 데이터가 없어 빈 차트 자리 표시자를 생성했습니다."
            }
          ],
          presentationIssues: []
        }
      },
      error: null,
      createdAt: "2026-06-27T00:00:00.000Z",
      updatedAt: "2026-06-27T00:00:01.000Z"
    };
    const result = getGenerateDeckJobResult(job);

    expect(result?.deckId).toBe("deck_ai_1");
    if (!result) {
      throw new Error("Generated deck result was not parsed.");
    }
    expect(getGeneratedDeckProjectPath(result)).toBe("/project/project-a");
    expect(renderToStaticMarkup(<GeneratedDeckResult result={result} />)).toContain(
      "file_1"
    );
    expect(renderToStaticMarkup(<GeneratedDeckResult result={result} />)).toContain(
      "AI가 참고자료/주제 밀도를 기준으로 1장이 적정하다고 판단했습니다."
    );
    expect(renderToStaticMarkup(<GeneratedDeckResult result={result} />)).toContain(
      "근거 데이터가 없어 빈 차트 자리 표시자를 생성했습니다."
    );
  });
});
