import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInitialProjectDeck,
  buildAssetUploadRequest,
  createProject,
  deleteProject,
  fetchProjects,
  getAssetValidationMessage,
  updateProjectPin,
  uploadProjectAsset,
} from "./ProjectAssetWorkspace";

const pptxMime =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ORBIT-93 project asset upload helpers", () => {
  it("loads the current user's project pin state from the project list API", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            projectId: "project_pinned",
            workspaceId: "workspace_demo_1",
            title: "Pinned project",
            createdBy: "user_1",
            createdAt: "2026-07-18T00:00:00.000Z",
            isPinned: true,
            pinnedAt: "2026-07-20T00:00:00.000Z",
            tags: [],
            generation: null,
          },
        ]),
      ),
    );

    await expect(fetchProjects(fetcher)).resolves.toEqual([
      expect.objectContaining({ projectId: "project_pinned", isPinned: true }),
    ]);
  });

  it("creates an initial blank deck after creating a project", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/workspaces/workspace_demo_1/projects")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            title: "새 프레젠테이션",
          });

          return new Response(
            JSON.stringify({
              projectId: "project_smoke",
              workspaceId: "workspace_demo_1",
              title: "새 프레젠테이션",
              createdBy: "user_smoke",
              createdAt: "2026-06-29T00:00:00.000Z",
            }),
          );
        }

        if (url.endsWith("/projects/project_smoke/deck")) {
          expect(init?.method).toBe("PUT");
          const body = JSON.parse(String(init?.body));

          expect(body.snapshotReason).toBe("deck-replaced");
          expect(body.deck).toMatchObject({
            deckId: "deck_smoke",
            projectId: "project_smoke",
            title: "새 프레젠테이션",
            slides: [
              expect.objectContaining({
                slideId: "slide_1",
                elements: [],
              }),
            ],
          });

          return new Response(
            JSON.stringify({
              deck: body.deck,
              snapshot: {
                snapshotId: "snapshot_smoke",
                projectId: "project_smoke",
                deckId: "deck_smoke",
                version: 1,
                reason: "deck-replaced",
                createdAt: "2026-06-29T00:00:00.000Z",
              },
              updatedAt: "2026-06-29T00:00:00.000Z",
            }),
          );
        }

        return new Response("unexpected request", { status: 500 });
      },
    );

    await expect(
      createProject("새 프레젠테이션", fetcher),
    ).resolves.toMatchObject({
      projectId: "project_smoke",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("builds a schema-valid blank deck for the created project", () => {
    const deck = buildInitialProjectDeck({
      projectId: "project_new",
      workspaceId: "workspace_demo_1",
      title: "팀 발표",
      createdBy: "user_smoke",
      createdAt: "2026-06-29T00:00:00.000Z",
    });

    expect(deck).toMatchObject({
      deckId: "deck_new",
      projectId: "project_new",
      title: "팀 발표",
      slides: [
        expect.objectContaining({
          elements: [],
          order: 1,
        }),
      ],
    });
  });

  it("새 덱의 기본 테마에 Redesign 팔레트를 적용한다", () => {
    const paletteByToken: Record<string, string> = {
      "--redesign-color-background": "#ffffff",
      "--redesign-color-on-surface": "#111114",
      "--redesign-color-outline-variant": "#d6d6dc",
      "--redesign-color-primary": "#0090ff",
      "--redesign-color-primary-container": "#e0f3ff",
      "--redesign-color-primary-fixed-dim": "#8dd4ff",
      "--redesign-color-secondary": "#8b3dff",
      "--redesign-color-surface": "#ffffff",
      "--redesign-color-surface-container": "#f1f1f4",
    };
    vi.stubGlobal("document", { documentElement: {} });
    vi.stubGlobal("window", {
      getComputedStyle: () => ({
        getPropertyValue: (token: string) => paletteByToken[token] ?? "",
      }),
    });

    const deck = buildInitialProjectDeck({
      projectId: "project_redesign",
      workspaceId: "workspace_demo_1",
      title: "Redesign 발표",
      createdBy: "user_smoke",
      createdAt: "2026-06-29T00:00:00.000Z",
    });

    expect(deck.theme.palette).toEqual({
      border: "#d6d6dc",
      muted: "#f1f1f4",
      primary: "#0090ff",
      secondary: "#8b3dff",
      surface: "#ffffff",
    });
    expect(deck.theme.accentColor).toBe("#0090ff");
    expect(deck.slides[0]?.style.accentColor).toBe("#0090ff");
  });

  it("deletes a project through the workspace project API", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "/api/v1/workspaces/workspace_demo_1/projects/project_smoke",
        );
        expect(init?.method).toBe("DELETE");
        expect(init?.credentials).toBe("include");

        return new Response(JSON.stringify({ projectId: "project_smoke" }));
      },
    );

    await expect(deleteProject("project_smoke", fetcher)).resolves.toEqual({
      projectId: "project_smoke",
    });
  });

  it("updates the current user's project pin through the workspace API", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "/api/v1/workspaces/workspace_demo_1/projects/project_smoke/pin",
        );
        expect(init?.method).toBe("PATCH");
        expect(init?.credentials).toBe("include");
        expect(JSON.parse(String(init?.body))).toEqual({ isPinned: true });

        return new Response(
          JSON.stringify({
            projectId: "project_smoke",
            isPinned: true,
            pinnedAt: "2026-07-20T00:00:00.000Z",
          }),
        );
      },
    );

    await expect(updateProjectPin("project_smoke", true, fetcher)).resolves.toEqual({
      projectId: "project_smoke",
      isPinned: true,
      pinnedAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("builds an upload request from the shared file contract", () => {
    const file = new File(["deck"], "deck.pptx", { type: pptxMime });

    expect(buildAssetUploadRequest(file, "pptx-import")).toEqual({
      originalName: "deck.pptx",
      mimeType: pptxMime,
      size: 4,
      purpose: "pptx-import",
    });
  });

  it("rejects unsupported or oversized files before API calls", () => {
    const unsupported = new File(["binary"], "setup.exe", {
      type: "application/x-msdownload",
    });
    const oversized = new File(["binary"], "large.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(oversized, "size", {
      value: 51 * 1024 * 1024,
    });

    expect(getAssetValidationMessage(unsupported)).toContain("PDF");
    expect(getAssetValidationMessage(oversized)).toContain("50 MB");
  });

  it("requests upload URL, uploads to storage, and completes metadata", async () => {
    const file = new File(["%PDF"], "smoke.pdf", { type: "application/pdf" });
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/assets/upload-url")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            originalName: "smoke.pdf",
            mimeType: "application/pdf",
            size: 4,
            purpose: "reference-material",
          });

          return new Response(
            JSON.stringify({
              fileId: "file_smoke",
              projectId: "project_smoke",
              uploadUrl: "http://storage.local/upload",
              method: "PUT",
              headers: { "content-type": "application/pdf" },
              expiresAt: "2026-06-27T01:15:00.000Z",
              purpose: "reference-material",
            }),
          );
        }

        if (url === "http://storage.local/upload") {
          expect(init?.method).toBe("PUT");
          expect(init?.body).toBe(file);
          return new Response(null, { status: 200 });
        }

        if (url.endsWith("/assets/complete")) {
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({
            fileId: "file_smoke",
          });

          return new Response(
            JSON.stringify({
              fileId: "file_smoke",
              projectId: "project_smoke",
              originalName: "smoke.pdf",
              mimeType: "application/pdf",
              size: 4,
              url: "http://storage.local/file_smoke",
              purpose: "reference-material",
              createdAt: "2026-06-27T01:00:00.000Z",
            }),
          );
        }

        return new Response("unexpected request", { status: 500 });
      },
    );

    await expect(
      uploadProjectAsset("project_smoke", file, "reference-material", fetcher),
    ).resolves.toMatchObject({
      fileId: "file_smoke",
      originalName: "smoke.pdf",
      purpose: "reference-material",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
