import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPptxNotesPreview } from "./deckPersistenceApi";

describe("fetchPptxNotesPreview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches one slide through the protected project endpoint", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            notesPreview: {
              slideId: "slide_a",
              status: "available",
              assetUrl:
                "/api/v1/projects/project-a/assets/file_preview_a/content",
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await expect(
      fetchPptxNotesPreview("project-a", "slide_a"),
    ).resolves.toEqual({
      slideId: "slide_a",
      status: "available",
      assetUrl: "/api/v1/projects/project-a/assets/file_preview_a/content",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project-a/deck/slides/slide_a/notes-preview",
    );
  });

  it("encodes project and slide IDs in the request path", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            notesPreview: {
              slideId: "slide_a",
              status: "unavailable",
              assetUrl: null,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);

    await fetchPptxNotesPreview("project/a", "slide/a");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/projects/project%2Fa/deck/slides/slide%2Fa/notes-preview",
    );
  });
});
