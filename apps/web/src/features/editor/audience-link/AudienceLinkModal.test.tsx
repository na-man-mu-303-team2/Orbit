import type { PresentationSession } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AudienceLinkReopenAction,
  getAudienceEntryPrimaryAction,
} from "./AudienceLinkModal";

const baseSession: PresentationSession = {
  sessionId: "session_1",
  projectId: "project_1",
  deckId: "deck_1",
  presenterUserId: "user_1",
  joinCode: "123456",
  status: "live",
  entryStatus: "open",
  audienceSlideRenderMode: "image-first",
  createdAt: "2026-07-05T00:00:00.000Z",
  startedAt: null,
  endedAt: null,
  surveyClosesAt: null,
  rawDataDeleteAfter: "2026-08-04T00:00:00.000Z",
};

describe("AudienceLinkModal", () => {
  it("keeps a closed current session on the reopen path instead of create", () => {
    expect(
      getAudienceEntryPrimaryAction({
        ...baseSession,
        entryStatus: "closed",
      }),
    ).toBe("reopen");
    expect(getAudienceEntryPrimaryAction(baseSession)).toBe("none");
    expect(getAudienceEntryPrimaryAction(null)).toBe("create");
  });

  it("renders a reopen action for a closed current session", () => {
    const html = renderToStaticMarkup(
      <AudienceLinkReopenAction
        disabled={false}
        isLoading={false}
        onReopen={() => undefined}
      />,
    );

    expect(html).toContain("입장 다시 열기");
    expect(html).toContain('class="audience-link-primary"');
    expect(html).not.toContain("QR코드 생성");
  });
});
