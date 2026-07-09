import type { Deck } from "@orbit/shared";
import type { PresenterSlideshowState } from "./presenterStateStore";

export const presentationChannelPrefix = "orbit:presenter-screen";

export type PresentationChannelIdentity = {
  deckId: string;
  sessionId: string;
};

export type SlideWindowDeckSnapshot = Deck;

export type PresenterSnapshotMessage = {
  deck: SlideWindowDeckSnapshot;
  deckId: string;
  sentAt: number;
  sessionId: string;
  state: PresenterSlideshowState;
  triggerAnimationIds: string[];
  type: "presenter-snapshot";
};

export type PresenterStateMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  state: PresenterSlideshowState;
  triggerAnimationIds: string[];
  type: "presenter-state";
};

export type PresenterHeartbeatMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "presenter-heartbeat";
};

export type SlideWindowReadyMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "slide-window-ready";
};

export type SlideWindowHeartbeatMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "slide-window-heartbeat";
};

export type PresenterRemoteReadyMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "presenter-remote-ready";
};

export type PresenterRemoteHeartbeatMessage = {
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "presenter-remote-heartbeat";
};

export type PresenterRemoteCommand =
  | { action: "goto"; slideIndex: number; stepIndex?: number }
  | { action: "next-step" }
  | { action: "prev" }
  | { action: "timer-pause" }
  | { action: "timer-reset" }
  | { action: "timer-start" };

export type PresenterCommandMessage = {
  command: PresenterRemoteCommand;
  deckId: string;
  sentAt: number;
  sessionId: string;
  type: "presenter-command";
};

export type PresentationChannelMessage =
  | PresenterSnapshotMessage
  | PresenterStateMessage
  | PresenterHeartbeatMessage
  | SlideWindowReadyMessage
  | SlideWindowHeartbeatMessage
  | PresenterRemoteReadyMessage
  | PresenterRemoteHeartbeatMessage
  | PresenterCommandMessage;

export function createPresentationSessionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return Array.from(values, (value) =>
      value.toString(16).padStart(8, "0"),
    ).join("-");
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPresentationChannelName(
  identity: PresentationChannelIdentity,
) {
  return [
    presentationChannelPrefix,
    encodeURIComponent(identity.deckId),
    encodeURIComponent(identity.sessionId),
  ].join(":");
}

export function createSlideWindowDeckSnapshot(
  deck: Deck,
): SlideWindowDeckSnapshot {
  return {
    canvas: deck.canvas,
    deckId: deck.deckId,
    metadata: deck.metadata,
    projectId: deck.projectId,
    slides: deck.slides.map(createSlideWindowSlideSnapshot),
    targetDurationMinutes: deck.targetDurationMinutes,
    theme: deck.theme,
    title: deck.title,
    version: deck.version,
  };
}

function createSlideWindowSlideSnapshot(
  slide: Deck["slides"][number],
): Deck["slides"][number] {
  return {
    actions: [],
    animations: slide.animations,
    elements: slide.elements,
    estimatedSeconds: slide.estimatedSeconds,
    keywords: [],
    order: slide.order,
    // 슬라이드 창은 렌더링 전용이므로 발표 대본과 추적 키워드를 받지 않는다.
    speakerNotes: "",
    slideId: slide.slideId,
    style: slide.style,
    thumbnailUrl: slide.thumbnailUrl,
    title: slide.title,
  };
}

export function isPresentationChannelMessage(
  value: unknown,
): value is PresentationChannelMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.deckId !== "string" ||
    typeof value.sessionId !== "string" ||
    typeof value.sentAt !== "number"
  ) {
    return false;
  }

  switch (value.type) {
    case "presenter-snapshot":
      return (
        isRecord(value.deck) &&
        isPresenterSlideshowState(value.state) &&
        isStringArray(value.triggerAnimationIds)
      );
    case "presenter-state":
      return (
        isPresenterSlideshowState(value.state) &&
        isStringArray(value.triggerAnimationIds)
      );
    case "presenter-heartbeat":
    case "slide-window-ready":
    case "slide-window-heartbeat":
    case "presenter-remote-ready":
    case "presenter-remote-heartbeat":
      return true;
    case "presenter-command":
      return isPresenterRemoteCommand(value.command);
    default:
      return false;
  }
}

export function matchesPresentationChannelIdentity(
  message: PresentationChannelMessage,
  identity: PresentationChannelIdentity,
) {
  return (
    message.deckId === identity.deckId &&
    message.sessionId === identity.sessionId
  );
}

export function createPresenterSnapshotMessage(args: {
  deck: Deck;
  identity: PresentationChannelIdentity;
  sentAt?: number;
  state: PresenterSlideshowState;
  triggerAnimationIds?: Iterable<string>;
}): PresenterSnapshotMessage {
  return {
    deck: createSlideWindowDeckSnapshot(args.deck),
    deckId: args.identity.deckId,
    sentAt: args.sentAt ?? Date.now(),
    sessionId: args.identity.sessionId,
    state: args.state,
    triggerAnimationIds: Array.from(args.triggerAnimationIds ?? []),
    type: "presenter-snapshot",
  };
}

export function createPresenterStateMessage(args: {
  identity: PresentationChannelIdentity;
  sentAt?: number;
  state: PresenterSlideshowState;
  triggerAnimationIds?: Iterable<string>;
}): PresenterStateMessage {
  return {
    deckId: args.identity.deckId,
    sentAt: args.sentAt ?? Date.now(),
    sessionId: args.identity.sessionId,
    state: args.state,
    triggerAnimationIds: Array.from(args.triggerAnimationIds ?? []),
    type: "presenter-state",
  };
}

export function createPresenterHeartbeatMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now(),
): PresenterHeartbeatMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "presenter-heartbeat",
  };
}

export function createSlideWindowReadyMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now(),
): SlideWindowReadyMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "slide-window-ready",
  };
}

export function createSlideWindowHeartbeatMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now(),
): SlideWindowHeartbeatMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "slide-window-heartbeat",
  };
}

export function createPresenterRemoteReadyMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now(),
): PresenterRemoteReadyMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "presenter-remote-ready",
  };
}

export function createPresenterRemoteHeartbeatMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now(),
): PresenterRemoteHeartbeatMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "presenter-remote-heartbeat",
  };
}

export function createPresenterCommandMessage(args: {
  command: PresenterRemoteCommand;
  identity: PresentationChannelIdentity;
  sentAt?: number;
}): PresenterCommandMessage {
  return {
    command: args.command,
    deckId: args.identity.deckId,
    sentAt: args.sentAt ?? Date.now(),
    sessionId: args.identity.sessionId,
    type: "presenter-command",
  };
}

function isPresenterSlideshowState(
  value: unknown,
): value is PresenterSlideshowState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.slideId === "string" &&
    typeof value.slideIndex === "number" &&
    typeof value.stepIndex === "number" &&
    Array.isArray(value.highlights) &&
    value.highlights.every(
      (highlight) =>
        isRecord(highlight) &&
        typeof highlight.elementId === "string" &&
        typeof highlight.active === "boolean",
    ) &&
    (value.speech === undefined || isPresenterSpeechState(value.speech)) &&
    (value.timing === undefined || isPresenterTimingState(value.timing))
  );
}

function isPresenterSpeechState(value: unknown) {
  return (
    isRecord(value) &&
    isStringArray(value.coveredSentenceIds) &&
    typeof value.matchableSentenceCount === "number" &&
    isSemanticUtteranceDebugState(value.semanticDebug) &&
    typeof value.semanticMatchingEnabled === "boolean" &&
    (value.snapshot === null || isSpeechTrackerSnapshot(value.snapshot))
  );
}

function isSemanticUtteranceDebugState(value: unknown) {
  return (
    isRecord(value) &&
    isSemanticDebugStatus(value.status) &&
    (value.slideId === null || typeof value.slideId === "string") &&
    typeof value.transcript === "string" &&
    typeof value.isFinal === "boolean" &&
    Array.isArray(value.topMatches) &&
    value.topMatches.every(isSemanticUtteranceMatch) &&
    (value.error === null || typeof value.error === "string")
  );
}

function isSemanticDebugStatus(value: unknown) {
  return (
    value === "idle" ||
    value === "loading-model" ||
    value === "indexing-script" ||
    value === "matching" ||
    value === "ready" ||
    value === "error"
  );
}

function isSemanticUtteranceMatch(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.rank === "number" &&
    typeof value.sentenceId === "string" &&
    typeof value.sentenceIndex === "number" &&
    typeof value.text === "string" &&
    typeof value.similarity === "number" &&
    typeof value.covered === "boolean"
  );
}

function isSpeechTrackerSnapshot(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.slideId === "string" &&
    isStringArray(value.coveredSentenceIds) &&
    typeof value.matchableSentenceCount === "number" &&
    typeof value.sentenceCoverage === "number" &&
    typeof value.wordCoverage === "number" &&
    typeof value.effectiveCoverage === "number" &&
    typeof value.finalSentenceSpoken === "boolean" &&
    isStringArray(value.hitKeywordIds) &&
    isStringArray(value.provisionalMissingKeywordIds)
  );
}

function isPresenterTimingState(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.canStartLiveStt === "boolean" &&
    typeof value.currentSlideElapsedSeconds === "number" &&
    typeof value.currentSlideTargetSeconds === "number" &&
    typeof value.displayedSeconds === "number" &&
    typeof value.elapsedSeconds === "number" &&
    typeof value.isLiveSttActive === "boolean" &&
    typeof value.isRunning === "boolean" &&
    typeof value.liveStatus === "string" &&
    (value.mode === "stopwatch" || value.mode === "timer") &&
    typeof value.timerDurationSeconds === "number"
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isPresenterRemoteCommand(
  value: unknown,
): value is PresenterRemoteCommand {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.action === "next-step" ||
    value.action === "prev" ||
    value.action === "timer-pause" ||
    value.action === "timer-reset" ||
    value.action === "timer-start"
  ) {
    return true;
  }

  return (
    value.action === "goto" &&
    isNonNegativeInteger(value.slideIndex) &&
    (value.stepIndex === undefined || isNonNegativeInteger(value.stepIndex))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
