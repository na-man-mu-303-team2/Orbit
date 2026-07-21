type RecordingClockSegment = {
  startedAtMs: number;
  endedAtMs: number | null;
};

export type RecordingClock = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  elapsedMs: () => number;
  elapsedMsAt: (wallClockMs: number) => number;
};

export function createRecordingClock(
  now: () => number = () => Date.now(),
): RecordingClock {
  const segments: RecordingClockSegment[] = [];
  let stopped = false;

  function openSegment(atMs: number) {
    if (stopped || segments.some((segment) => segment.endedAtMs === null)) {
      return;
    }
    segments.push({ startedAtMs: atMs, endedAtMs: null });
  }

  function closeSegment(atMs: number) {
    let active: RecordingClockSegment | undefined;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      if (segments[index]?.endedAtMs === null) {
        active = segments[index];
        break;
      }
    }
    if (active) {
      active.endedAtMs = Math.max(atMs, active.startedAtMs);
    }
  }

  return {
    start: () => openSegment(now()),
    pause: () => closeSegment(now()),
    resume: () => openSegment(now()),
    stop: () => {
      closeSegment(now());
      stopped = true;
    },
    elapsedMs: () => elapsedMsAt(now()),
    elapsedMsAt,
  };

  function elapsedMsAt(wallClockMs: number) {
    return Math.round(
      segments.reduce((total, segment) => {
        const endMs = segment.endedAtMs ?? wallClockMs;
        const boundedEndMs = Math.min(Math.max(endMs, segment.startedAtMs), wallClockMs);
        return total + Math.max(boundedEndMs - segment.startedAtMs, 0);
      }, 0),
    );
  }
}
