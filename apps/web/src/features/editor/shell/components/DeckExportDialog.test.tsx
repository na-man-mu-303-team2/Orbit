import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  createDeckExportRequest,
  DeckExportDialog,
  sessionExportOptionLabel
} from "./DeckExportDialog";

describe("DeckExportDialog", () => {
  it("defaults to an explicit format without implicitly selecting a session", () => {
    expect(createDeckExportRequest("png", "")).toEqual({ format: "png" });
    expect(createDeckExportRequest("pptx", "session_1")).toEqual({
      format: "pptx",
      presentationSessionId: "session_1"
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <DeckExportDialog
          deckId="deck_1"
          errorMessage=""
          initialFormat="png"
          onClose={() => undefined}
          onExport={async () => true}
          open
          pending={false}
          projectId="project_1"
          statusMessage=""
        />
      </QueryClientProvider>
    );
    expect(html).toContain("PNG ZIP");
    expect(html).toContain("포함하지 않음");
    expect(html).toContain("모든 장표를 PNG로 묶은 ZIP");
  });

  it("labels archived sessions without exposing result content", () => {
    expect(
      sessionExportOptionLabel({
        createdAt: "2026-07-17T00:00:00.000Z",
        sessionId: "session_abcdefgh",
        status: "ended"
      })
    ).toContain("종료 · abcdefgh");
  });
});
