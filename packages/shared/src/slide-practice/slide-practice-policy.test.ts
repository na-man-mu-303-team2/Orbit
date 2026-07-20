import { describe, expect, it } from "vitest";

import {
  classifyLoudnessStability,
  distanceToTargetRange,
  isWithinTargetRange,
  slidePracticeMetricTargets,
} from "./slide-practice-policy";

describe("slide practice metric v3 policy", () => {
  it.each([
    [2.99, "stable"],
    [3.0, "stable"],
    [3.01, "unstable"],
    [null, "unmeasured"],
  ] as const)("classifies loudness MAD %s as %s", (value, expected) => {
    expect(classifyLoudnessStability(value)).toBe(expected);
  });

  it("measures improvement by distance to a target range", () => {
    const target = slidePracticeMetricTargets.syllablesPerSecond;
    expect(distanceToTargetRange(3, target)).toBeCloseTo(0.5);
    expect(distanceToTargetRange(4.2, target)).toBe(0);
    expect(distanceToTargetRange(5, target)).toBeCloseTo(0.2);
  });

  it("requires a measured value to be inside the target range", () => {
    expect(isWithinTargetRange(null, slidePracticeMetricTargets.pauseRatio)).toBe(false);
    expect(isWithinTargetRange(0.12, slidePracticeMetricTargets.pauseRatio)).toBe(true);
    expect(isWithinTargetRange(0.55, slidePracticeMetricTargets.pauseRatio)).toBe(true);
  });
});
