import type { EditorCapabilities } from "../shell/editorCapabilities";

export type PresentationJourneyBriefState =
  | "loading"
  | "ready"
  | "missing"
  | "error";

export type PresentationJourneySaveState =
  | "saved"
  | "pending"
  | "saving"
  | "error"
  | "conflict";

export type PresentationJourneyCapabilities = Pick<
  EditorCapabilities,
  | "canEditBrief"
  | "canMutateDeck"
  | "canStartPersonalRehearsal"
  | "canCreatePresentationSession"
>;

export type PresentationJourneyActionId =
  | "edit-brief"
  | "view-brief"
  | "open-validation"
  | "focus-validation"
  | "start-rehearsal"
  | "start-presentation";

export type PresentationJourneyStepId =
  | "brief"
  | "validation"
  | "rehearsal"
  | "presentation";

export type PresentationJourneyAction = {
  id: PresentationJourneyActionId;
  label: string;
};

export type PresentationJourneyStep = {
  action?: PresentationJourneyAction;
  id: PresentationJourneyStepId;
  label: string;
  statusText: string;
};

export type PresentationJourneyInput = {
  briefState: PresentationJourneyBriefState;
  capabilities: PresentationJourneyCapabilities;
  quality: {
    deckVersion: number;
    riskCount: number;
    warningCount: number;
  };
  saveState: PresentationJourneySaveState;
};

export type PresentationJourneyViewModel = {
  steps: [
    PresentationJourneyStep,
    PresentationJourneyStep,
    PresentationJourneyStep,
    PresentationJourneyStep,
  ];
};

export function createPresentationJourneyViewModel(
  input: PresentationJourneyInput,
): PresentationJourneyViewModel {
  const canEdit = input.capabilities.canEditBrief && input.capabilities.canMutateDeck;
  const isViewer =
    input.capabilities.canStartPersonalRehearsal &&
    !input.capabilities.canEditBrief &&
    !input.capabilities.canMutateDeck &&
    !input.capabilities.canCreatePresentationSession;

  return {
    steps: [
      {
        ...(canEdit
          ? { action: action("edit-brief", "브리프 편집") }
          : isViewer
            ? { action: action("view-brief", "브리프 보기") }
            : {}),
        id: "brief",
        label: "브리프",
        statusText: briefStatusText(input.briefState),
      },
      {
        ...(input.capabilities.canMutateDeck
          ? { action: action("open-validation", "검사 열기") }
          : isViewer
            ? { action: action("focus-validation", "검사 보기") }
            : {}),
        id: "validation",
        label: "검사",
        statusText: qualityStatusText(input.quality),
      },
      {
        ...(input.capabilities.canStartPersonalRehearsal
          ? { action: action("start-rehearsal", "개인 리허설") }
          : {}),
        id: "rehearsal",
        label: "리허설",
        statusText: input.capabilities.canStartPersonalRehearsal
          ? "개인 리허설로 발표를 연습할 수 있습니다."
          : "개인 리허설을 시작할 수 없습니다.",
      },
      {
        ...(input.capabilities.canCreatePresentationSession &&
        input.capabilities.canMutateDeck
          ? { action: action("start-presentation", "발표 시작") }
          : {}),
        id: "presentation",
        label: "발표",
        statusText: presentationStatusText(input.saveState, isViewer),
      },
    ],
  };
}

function action(
  id: PresentationJourneyActionId,
  label: string,
): PresentationJourneyAction {
  return { id, label };
}

function briefStatusText(state: PresentationJourneyBriefState) {
  switch (state) {
    case "loading":
      return "브리프를 확인하는 중입니다.";
    case "ready":
      return "발표 브리프가 준비되어 있습니다.";
    case "missing":
      return "발표 브리프가 아직 없습니다.";
    case "error":
      return "브리프 상태를 불러오지 못했습니다.";
  }
}

function qualityStatusText(input: PresentationJourneyInput["quality"]) {
  const riskCount = normalizedCount(input.riskCount);
  const warningCount = normalizedCount(input.warningCount);
  return `Deck v${input.deckVersion} 기준 내보내기 위험 ${riskCount}개 · 경고 ${warningCount}개`;
}

function presentationStatusText(
  saveState: PresentationJourneySaveState,
  isViewer: boolean,
) {
  if (isViewer) {
    return "보기 전용에서는 발표 세션을 시작할 수 없습니다.";
  }

  switch (saveState) {
    case "saved":
      return "저장된 Deck으로 발표를 시작할 수 있습니다.";
    case "pending":
      return "편집 내용을 저장한 뒤 발표를 시작합니다.";
    case "saving":
      return "편집 내용을 저장하고 있습니다.";
    case "error":
      return "저장 문제를 해결한 뒤 발표를 시작할 수 있습니다.";
    case "conflict":
      return "저장 충돌을 해결한 뒤 발표를 시작할 수 있습니다.";
  }
}

function normalizedCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
