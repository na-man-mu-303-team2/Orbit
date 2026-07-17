import { createActivitySlide, createDemoDeck } from "@orbit/editor-core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AudienceSatisfactionForm } from "./AudienceSatisfactionPage";
import { createSatisfactionDraft } from "./activityFormModel";

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
});
