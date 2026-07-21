export type RealtimeSttTurnMetric = {
  sequence: number;
  speechStartedAtMs: number;
  committedAtMs: number | null;
  firstDeltaAtMs: number | null;
  completedAtMs: number | null;
};

export type RealtimeSttMetricSummary = {
  completedTurns: number;
  firstDeltaLatencyMedianMs: number | null;
  firstDeltaLatencyP95Ms: number | null;
  commitToFinalMedianMs: number | null;
  commitToFinalP95Ms: number | null;
  onsetToFinalMedianMs: number | null;
  onsetToFinalP95Ms: number | null;
};

export type RealtimeSttDiagnosticEvent = {
  type: string;
  atMs: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export function summarizeRealtimeSttMetrics(
  turns: readonly RealtimeSttTurnMetric[]
): RealtimeSttMetricSummary {
  const completedTurns = turns.filter((turn) => turn.completedAtMs !== null);
  const firstDeltaLatencies = turns.flatMap((turn) =>
    turn.firstDeltaAtMs === null
      ? []
      : [Math.max(turn.firstDeltaAtMs - turn.speechStartedAtMs, 0)]
  );
  const commitToFinalLatencies = completedTurns.flatMap((turn) =>
    turn.committedAtMs === null || turn.completedAtMs === null
      ? []
      : [Math.max(turn.completedAtMs - turn.committedAtMs, 0)]
  );
  const onsetToFinalLatencies = completedTurns.flatMap((turn) =>
    turn.completedAtMs === null
      ? []
      : [Math.max(turn.completedAtMs - turn.speechStartedAtMs, 0)]
  );

  return {
    completedTurns: completedTurns.length,
    firstDeltaLatencyMedianMs: percentile(firstDeltaLatencies, 50),
    firstDeltaLatencyP95Ms: percentile(firstDeltaLatencies, 95),
    commitToFinalMedianMs: percentile(commitToFinalLatencies, 50),
    commitToFinalP95Ms: percentile(commitToFinalLatencies, 95),
    onsetToFinalMedianMs: percentile(onsetToFinalLatencies, 50),
    onsetToFinalP95Ms: percentile(onsetToFinalLatencies, 95)
  };
}

export class RealtimeSttDiagnosticRingBuffer {
  private readonly events: RealtimeSttDiagnosticEvent[] = [];

  constructor(private readonly capacity = 200) {}

  push(event: RealtimeSttDiagnosticEvent) {
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
  }

  read() {
    return this.events.map((event) => ({ ...event }));
  }

  clear() {
    this.events.length = 0;
  }
}

function percentile(values: readonly number[], target: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((target / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(index, 0)] ?? 0);
}
