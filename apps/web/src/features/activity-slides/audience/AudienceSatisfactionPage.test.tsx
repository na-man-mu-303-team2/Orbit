import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import { activityPublicResultSchema, activityRunSchema } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AudiencePublicResultCard,
  AudienceSatisfactionForm,
  getAudienceActivityStatusCopy,
  loadAudienceActivityRefresh
} from "./AudienceSatisfactionPage";
import { createSatisfactionDraft } from "./activityFormModel";
import { activityApi } from "../api/activityApi";

const definition = createActivitySlide(
  createDemoDeck(),
  "satisfaction"
).activity;

describe("AudienceSatisfactionForm", () => {
  it("renders accessible rating targets and the optional free-text field", () => {
    const html = renderToStaticMarkup(
      <AudienceSatisfactionForm
        definition={definition}
        draft={createSatisfactionDraft(null)}
        isSubmitting={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(html).toContain('type="radio"');
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html).toContain("발표가 전반적으로 유익했나요?");
    expect(html).toContain("추가 의견이 있다면 알려주세요.");
    expect(html).toContain("응답 제출");
    expect(html).not.toContain("speakerNotes");
  });

  it("reloads the current Activity when the active pointer disappears", async () => {
    const current = audienceActivity("closed");
    vi.spyOn(activityApi, "getAudienceActiveActivity").mockResolvedValue({ activity: null });
    vi.spyOn(activityApi, "getAudienceActivity").mockResolvedValue(current);

    await expect(
      loadAudienceActivityRefresh("session_1", definition.activityId)
    ).resolves.toEqual(current);
    expect(activityApi.getAudienceActivity).toHaveBeenCalledWith(
      "session_1",
      definition.activityId
    );
  });

  it("distinguishes a draft Activity from a closed response window", () => {
    expect(getAudienceActivityStatusCopy("draft")).toEqual({
      title: "발표자가 응답을 준비하고 있습니다",
      description: "응답이 열리면 이 화면에 자동으로 표시됩니다."
    });
    expect(getAudienceActivityStatusCopy("closed").title).toBe(
      "응답이 마감되었습니다"
    );
  });

  it("renders public aggregates after the current run reveals results", () => {
    const html = renderToStaticMarkup(
      <AudiencePublicResultCard current={audienceActivity("results")} />
    );

    expect(html).toContain(`${definition.title} 결과`);
    expect(html).toContain("공개 결과");
    expect(html).toContain("4.5");
  });
});

function audienceActivity(status: "closed" | "results") {
  const run = activityRunSchema.parse({
    activityRunId: "activity_run_1",
    presentationSessionId: "session_1",
    activityId: definition.activityId,
    sourceSlideId: "slide_activity_1",
    version: 1,
    supersedesActivityRunId: null,
    definitionSnapshot: definition,
    definitionFingerprint: "fingerprint_1",
    status,
    revision: status === "results" ? 3 : 2,
    isCurrent: true,
    responseCount: 2,
    openedAt: "2026-07-17T00:00:00.000Z",
    closedAt: "2026-07-17T00:01:00.000Z",
    revealedAt: status === "results" ? "2026-07-17T00:02:00.000Z" : null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:02:00.000Z"
  });
  return {
    activityId: definition.activityId,
    run,
    ownResponse: null,
    publicResult:
      status === "results"
        ? activityPublicResultSchema.parse({
            activityRunId: run.activityRunId,
            activityId: run.activityId,
            status: "results",
            revision: run.revision,
            responseCount: 2,
            aggregates: [{
              questionId: definition.questions[0]!.questionId,
              type: "rating",
              responseCount: 2,
              average: 4.5,
              choices: []
            }],
            approvedTextEntries: []
          })
        : null
  };
}
