export const slidePracticeMetricDefinitionVersion = 3 as const;
export const slidePracticeContentHashVersion = "slide-text-v1" as const;

export const slidePracticeMetricTargets = {
  activeSpeechMinimumMs: 5_000,
  syllablesPerSecond: { min: 3.5, max: 4.8 },
  loudnessDb: { min: -45, max: -30 },
  pauseRatio: { min: 0.12, max: 0.55 },
  pitchSpanHz: { min: 45, max: 160 },
  loudnessMadDbMaximum: 3.0,
} as const;

export type LoudnessStability = "stable" | "unstable" | "unmeasured";

export function classifyLoudnessStability(
  loudnessMadDb: number | null,
): LoudnessStability {
  if (loudnessMadDb === null) return "unmeasured";
  return loudnessMadDb <= slidePracticeMetricTargets.loudnessMadDbMaximum
    ? "stable"
    : "unstable";
}

export function distanceToTargetRange(
  value: number,
  target: { min: number; max: number },
) {
  if (value < target.min) return target.min - value;
  if (value > target.max) return value - target.max;
  return 0;
}

export function isWithinTargetRange(
  value: number | null,
  target: { min: number; max: number },
) {
  return value !== null && value >= target.min && value <= target.max;
}
