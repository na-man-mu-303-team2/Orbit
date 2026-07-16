import { describe, expect, it } from "vitest";

import {
  createPresentationJourneyViewModel,
  type PresentationJourneyInput,
} from "./presentationJourney";

describe("createPresentationJourneyViewModel", () => {
  it("returns the four presentation journey steps in their fixed order", () => {
    const journey = createPresentationJourneyViewModel(ownerInput());

    expect(journey.steps.map((step) => step.id)).toEqual([
      "brief",
      "validation",
      "rehearsal",
      "presentation",
    ]);
    expect(journey.steps.map((step) => step.label)).toEqual([
      "브리프",
      "검사",
      "리허설",
      "발표",
    ]);
  });

  it("returns the editable action set for an Owner or Editor", () => {
    const journey = createPresentationJourneyViewModel(ownerInput());

    expect(journey.steps.map((step) => step.action)).toEqual([
      { id: "edit-brief", label: "브리프 편집" },
      { id: "open-validation", label: "검사 열기" },
      { id: "start-rehearsal", label: "개인 리허설" },
      { id: "start-presentation", label: "발표 시작" },
    ]);
  });

  it("returns only read and personal rehearsal actions for a Viewer", () => {
    const journey = createPresentationJourneyViewModel({
      ...ownerInput(),
      capabilities: {
        canCreatePresentationSession: false,
        canEditBrief: false,
        canMutateDeck: false,
        canStartPersonalRehearsal: true,
      },
    });

    expect(journey.steps.map((step) => step.action)).toEqual([
      { id: "view-brief", label: "브리프 보기" },
      { id: "focus-validation", label: "검사 보기" },
      { id: "start-rehearsal", label: "개인 리허설" },
      undefined,
    ]);
    expect(journey.steps[3]?.statusText).toBe(
      "보기 전용에서는 발표 세션을 시작할 수 없습니다.",
    );
  });

  it("fails closed when no canonical capability is granted", () => {
    const journey = createPresentationJourneyViewModel({
      ...ownerInput(),
      capabilities: {
        canCreatePresentationSession: false,
        canEditBrief: false,
        canMutateDeck: false,
        canStartPersonalRehearsal: false,
      },
    });

    expect(journey.steps.every((step) => step.action === undefined)).toBe(true);
  });

  it.each([
    ["loading", "브리프를 확인하는 중입니다."],
    ["ready", "발표 브리프가 준비되어 있습니다."],
    ["missing", "발표 브리프가 아직 없습니다."],
    ["error", "브리프 상태를 불러오지 못했습니다."],
  ] as const)("maps the %s Brief state to visible status text", (briefState, text) => {
    const journey = createPresentationJourneyViewModel({
      ...ownerInput(),
      briefState,
    });

    expect(journey.steps[0]?.statusText).toBe(text);
  });

  it("reports whole-Deck warning and risk counts for the supplied Deck version", () => {
    const journey = createPresentationJourneyViewModel({
      ...ownerInput(),
      quality: { deckVersion: 17, riskCount: 2, warningCount: 5 },
    });

    expect(journey.steps[1]?.statusText).toBe(
      "Deck v17 기준 내보내기 위험 2개 · 경고 5개",
    );
  });

  it.each([
    ["saved", "저장된 Deck으로 발표를 시작할 수 있습니다."],
    ["pending", "편집 내용을 저장한 뒤 발표를 시작합니다."],
    ["saving", "편집 내용을 저장하고 있습니다."],
    ["error", "저장 문제를 해결한 뒤 발표를 시작할 수 있습니다."],
    ["conflict", "저장 충돌을 해결한 뒤 발표를 시작할 수 있습니다."],
  ] as const)("maps the %s save category to presentation guidance", (saveState, text) => {
    const journey = createPresentationJourneyViewModel({
      ...ownerInput(),
      saveState,
    });

    expect(journey.steps[3]?.statusText).toBe(text);
  });

  it("does not fabricate a completion percentage or rehearsal completion", () => {
    const serialized = JSON.stringify(createPresentationJourneyViewModel(ownerInput()));

    expect(serialized).not.toMatch(/%|완료율|리허설 완료/);
  });
});

function ownerInput(): PresentationJourneyInput {
  return {
    briefState: "ready",
    capabilities: {
      canCreatePresentationSession: true,
      canEditBrief: true,
      canMutateDeck: true,
      canStartPersonalRehearsal: true,
    },
    quality: { deckVersion: 3, riskCount: 0, warningCount: 1 },
    saveState: "saved",
  };
}
