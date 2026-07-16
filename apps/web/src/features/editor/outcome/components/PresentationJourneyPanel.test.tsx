import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  createPresentationJourneyViewModel,
  type PresentationJourneyInput,
} from "../presentationJourney";
import { PresentationJourneyPanel } from "./PresentationJourneyPanel";

describe("PresentationJourneyPanel", () => {
  it("renders the four steps in model order with visible status text", () => {
    const html = renderPanel(ownerInput());
    const steps = ["brief", "validation", "rehearsal", "presentation"];

    expect(html).toContain('aria-label="발표 준비 경로"');
    expect(html).toContain('data-testid="presentation-journey-panel"');
    expect(html).toContain("<ol");
    expect(
      steps.map((step) => html.indexOf(`data-journey-step="${step}"`)),
    ).toEqual(
      [
        ...steps.map((step) => html.indexOf(`data-journey-step="${step}"`)),
      ].sort((left, right) => left - right),
    );
    expect(html).toContain("발표 브리프가 준비되어 있습니다.");
    expect(html).toContain("Deck v3 기준 내보내기 위험 1개 · 경고 2개");
    expect(html).toContain("개인 리허설로 발표를 연습할 수 있습니다.");
    expect(html).toContain("저장된 Deck으로 발표를 시작할 수 있습니다.");
  });

  it("maps every model action to a stable E2E selector", () => {
    const ownerHtml = renderPanel(ownerInput());
    const viewerHtml = renderPanel(viewerInput());

    for (const selector of [
      "brief-edit",
      "validation-open",
      "rehearsal-start",
      "presentation-start",
    ]) {
      expect(ownerHtml).toContain(`data-journey-action="${selector}"`);
      expect(ownerHtml).toContain(
        `data-testid="presentation-journey-${selector}"`,
      );
    }
    for (const selector of ["brief-view", "validation-focus"]) {
      expect(viewerHtml).toContain(`data-journey-action="${selector}"`);
      expect(viewerHtml).toContain(
        `data-testid="presentation-journey-${selector}"`,
      );
    }
  });

  it("does not render a presentation action for a Viewer", () => {
    const html = renderPanel(viewerInput());

    expect(html).toContain('data-testid="presentation-journey-brief-view"');
    expect(html).toContain(
      'data-testid="presentation-journey-validation-focus"',
    );
    expect(html).toContain(
      'data-testid="presentation-journey-rehearsal-start"',
    );
    expect(html).not.toContain("presentation-journey-presentation-start");
    expect(html).not.toContain("발표 시작</button>");
  });

  it("disables every action while busy and exposes an atomic polite status", () => {
    const html = renderPanel(ownerInput(), {
      busy: true,
      statusMessage: "편집 내용을 저장하고 있습니다.",
    });

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(4);
    expect(html).toContain('data-testid="presentation-journey-status"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("편집 내용을 저장하고 있습니다.");
  });

  it("keeps an empty live region without a layout gap", () => {
    const html = renderPanel(ownerInput());

    expect(html).toContain('class="presentation-journey-status is-empty"');
    expect(html).toContain('data-testid="presentation-journey-status"');
  });

  it("does not nest interactive controls inside action buttons", () => {
    const html = renderPanel(ownerInput());
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];

    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      const content = button.replace(/^<button\b[^>]*>|<\/button>$/g, "");
      expect(content).not.toMatch(/<(?:a|button|input|select|textarea)\b/);
    }
  });
});

function renderPanel(
  input: PresentationJourneyInput,
  overrides: { busy?: boolean; statusMessage?: string } = {},
) {
  return renderToStaticMarkup(
    <PresentationJourneyPanel
      busy={overrides.busy ?? false}
      model={createPresentationJourneyViewModel(input)}
      onAction={vi.fn()}
      statusMessage={overrides.statusMessage}
    />,
  );
}

function ownerInput(): PresentationJourneyInput {
  return {
    briefState: "ready",
    capabilities: {
      canCreatePresentationSession: true,
      canEditBrief: true,
      canMutateDeck: true,
      canStartPersonalRehearsal: true,
    },
    quality: { deckVersion: 3, riskCount: 1, warningCount: 2 },
    saveState: "saved",
  };
}

function viewerInput(): PresentationJourneyInput {
  return {
    ...ownerInput(),
    capabilities: {
      canCreatePresentationSession: false,
      canEditBrief: false,
      canMutateDeck: false,
      canStartPersonalRehearsal: true,
    },
  };
}
