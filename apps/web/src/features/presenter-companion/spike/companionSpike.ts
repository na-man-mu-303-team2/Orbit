export const companionSpikeEventPrefix = "presentation-companion-spike";
export const companionSpikeQueryKey = "companionSpike";

export const companionSpikeEvents = {
  capabilities: `${companionSpikeEventPrefix}:capabilities`,
  create: `${companionSpikeEventPrefix}:create`,
  ink: `${companionSpikeEventPrefix}:ink`,
  inkApplied: `${companionSpikeEventPrefix}:ink-applied`,
  join: `${companionSpikeEventPrefix}:join`,
  metric: `${companionSpikeEventPrefix}:metric`,
  ping: `${companionSpikeEventPrefix}:ping`,
  presence: `${companionSpikeEventPrefix}:presence`,
  revoked: `${companionSpikeEventPrefix}:revoked`,
  resume: `${companionSpikeEventPrefix}:resume`,
  signal: `${companionSpikeEventPrefix}:signal`,
} as const;

export type CompanionSpikeHostKind = "presentation" | "rehearsal";

export type CompanionSpikePoint = {
  pressure: number;
  t: number;
  x: number;
  y: number;
};

export type CompanionSpikeInk = {
  phase: "end" | "move" | "start";
  points: CompanionSpikePoint[];
  sentAtMs: number;
  sequence: number;
  spikeId: string;
  strokeId: string;
};

export type CompanionSpikeCapabilities = {
  coalescedEvents: boolean;
  hoverObserved: boolean;
  pointerEvents: boolean;
  pressureObserved: boolean;
  screenHeight: number;
  screenWidth: number;
  spikeId: string;
  touchPoints: number;
  webRtc: boolean;
};

export type CompanionSpikeLatencySummary = {
  count: number;
  durationMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
};

export type CompanionSpikeSignal =
  | {
      signal: {
        description: RTCSessionDescriptionInit;
        kind: "description";
      };
      spikeId: string;
    }
  | {
      signal: {
        candidate: RTCIceCandidateInit;
        kind: "ice";
      };
      spikeId: string;
    }
  | {
      signal: { kind: "end" };
      spikeId: string;
    };

export type CompanionSpikeChannelMessage =
  | { ink: CompanionSpikeInk; type: "ink" }
  | {
      appliedAtMs: number;
      sequence: number;
      strokeId: string;
      type: "ink-applied";
    };

export function isCompanionSpikeEnabled(search?: string): boolean {
  const value =
    search ??
    (typeof window === "undefined" ? "" : window.location.search);
  return (
    new URLSearchParams(value).get(companionSpikeQueryKey)?.trim() === "1"
  );
}

export function companionSpikeChannelName(spikeId: string): string {
  return `orbit:companion-spike:${spikeId}`;
}

export function companionSpikeIdentity(spikeId: string) {
  return { deckId: "companion-spike", sessionId: spikeId };
}

export function companionSpikeUrl(origin: string, spikeId: string): string {
  return `${origin}/companion-spike/${encodeURIComponent(spikeId)}`;
}

export function calculateLatencySummary(
  samples: readonly number[],
  durationMs: number,
): CompanionSpikeLatencySummary {
  const ordered = samples
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .slice()
    .sort((left, right) => left - right);
  return {
    count: ordered.length,
    durationMs: Math.max(0, durationMs),
    maxMs: ordered.at(-1) ?? 0,
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
  };
}

export function collectCompanionSpikePoints(
  event: PointerEvent,
  bounds: Pick<DOMRect, "height" | "left" | "top" | "width">,
  strokeStartedAtMs: number,
): CompanionSpikePoint[] {
  const coalesced =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];
  const events = coalesced.length > 0 ? coalesced : [event];
  return events.slice(-64).map((sample) => ({
    pressure: clamp(sample.pressure || (sample.buttons > 0 ? 0.5 : 0), 0, 1),
    t: clamp(sample.timeStamp - strokeStartedAtMs, 0, 120_000),
    x: clamp((sample.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
    y: clamp((sample.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1),
  }));
}

export function drawCompanionSpikeInk(
  canvas: HTMLCanvasElement,
  ink: Pick<CompanionSpikeInk, "phase" | "points">,
  previousPoint?: CompanionSpikePoint,
): CompanionSpikePoint | undefined {
  const context = canvas.getContext("2d");
  if (!context || ink.points.length === 0) return previousPoint;
  const scale = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (
    canvas.width !== Math.round(width * scale) ||
    canvas.height !== Math.round(height * scale)
  ) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#ff3d71";

  let cursor =
    ink.phase === "start" ? ink.points[0] : previousPoint ?? ink.points[0];
  for (const point of ink.points) {
    const lineWidth = 2 + point.pressure * 7;
    context.beginPath();
    context.lineWidth = lineWidth;
    context.moveTo(cursor.x * width, cursor.y * height);
    context.lineTo(point.x * width, point.y * height);
    context.stroke();
    cursor = point;
  }
  return ink.phase === "end" ? undefined : cursor;
}

export function isCompanionSpikeInk(value: unknown): value is CompanionSpikeInk {
  if (!isRecord(value)) return false;
  return (
    (value.phase === "start" ||
      value.phase === "move" ||
      value.phase === "end") &&
    typeof value.spikeId === "string" &&
    typeof value.strokeId === "string" &&
    isNonNegativeNumber(value.sentAtMs) &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 0 &&
    Array.isArray(value.points) &&
    value.points.length > 0 &&
    value.points.length <= 64 &&
    value.points.every(isCompanionSpikePoint)
  );
}

export function isCompanionSpikeSignal(
  value: unknown,
): value is CompanionSpikeSignal {
  if (!isRecord(value) || typeof value.spikeId !== "string") return false;
  const signal = value.signal;
  if (!isRecord(signal) || typeof signal.kind !== "string") return false;
  if (signal.kind === "end") return true;
  if (signal.kind === "description") {
    const description = signal.description;
    return (
      isRecord(description) &&
      (description.type === "offer" || description.type === "answer") &&
      typeof description.sdp === "string"
    );
  }
  if (signal.kind === "ice") {
    return (
      isRecord(signal.candidate) &&
      typeof signal.candidate.candidate === "string"
    );
  }
  return false;
}

function percentile(ordered: readonly number[], ratio: number): number {
  if (ordered.length === 0) return 0;
  const index = Math.ceil(ordered.length * ratio) - 1;
  return ordered[clamp(index, 0, ordered.length - 1)] ?? 0;
}

function isCompanionSpikePoint(value: unknown): value is CompanionSpikePoint {
  if (!isRecord(value)) return false;
  return (
    isRatio(value.pressure) &&
    isRatio(value.x) &&
    isRatio(value.y) &&
    isNonNegativeNumber(value.t) &&
    value.t <= 120_000
  );
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRatio(value: unknown): value is number {
  return isNonNegativeNumber(value) && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
