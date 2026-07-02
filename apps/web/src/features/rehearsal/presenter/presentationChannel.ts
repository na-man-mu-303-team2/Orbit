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

export type PresentationChannelMessage =
  | PresenterSnapshotMessage
  | PresenterStateMessage
  | PresenterHeartbeatMessage
  | SlideWindowReadyMessage
  | SlideWindowHeartbeatMessage;

export function createPresentationSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("-");
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getPresentationChannelName(identity: PresentationChannelIdentity) {
  return [
    presentationChannelPrefix,
    encodeURIComponent(identity.deckId),
    encodeURIComponent(identity.sessionId)
  ].join(":");
}

export function createSlideWindowDeckSnapshot(deck: Deck): SlideWindowDeckSnapshot {
  return {
    canvas: deck.canvas,
    deckId: deck.deckId,
    metadata: deck.metadata,
    projectId: deck.projectId,
    slides: deck.slides.map(createSlideWindowSlideSnapshot),
    targetDurationMinutes: deck.targetDurationMinutes,
    theme: deck.theme,
    title: deck.title,
    version: deck.version
  };
}

function createSlideWindowSlideSnapshot(slide: Deck["slides"][number]): Deck["slides"][number] {
  return {
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
    title: slide.title
  };
}

export function isPresentationChannelMessage(
  value: unknown
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
      return isPresenterSlideshowState(value.state) && isStringArray(value.triggerAnimationIds);
    case "presenter-heartbeat":
    case "slide-window-ready":
    case "slide-window-heartbeat":
      return true;
    default:
      return false;
  }
}

export function matchesPresentationChannelIdentity(
  message: PresentationChannelMessage,
  identity: PresentationChannelIdentity
) {
  return message.deckId === identity.deckId && message.sessionId === identity.sessionId;
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
    type: "presenter-snapshot"
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
    type: "presenter-state"
  };
}

export function createPresenterHeartbeatMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now()
): PresenterHeartbeatMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "presenter-heartbeat"
  };
}

export function createSlideWindowReadyMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now()
): SlideWindowReadyMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "slide-window-ready"
  };
}

export function createSlideWindowHeartbeatMessage(
  identity: PresentationChannelIdentity,
  sentAt = Date.now()
): SlideWindowHeartbeatMessage {
  return {
    deckId: identity.deckId,
    sentAt,
    sessionId: identity.sessionId,
    type: "slide-window-heartbeat"
  };
}

function isPresenterSlideshowState(value: unknown): value is PresenterSlideshowState {
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
        typeof highlight.active === "boolean"
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
