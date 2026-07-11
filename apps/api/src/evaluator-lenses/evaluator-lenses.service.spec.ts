import { describe, expect, it } from "vitest";

import { EvaluatorLensesService } from "./evaluator-lenses.service";

describe("EvaluatorLensesService", () => {
  it("returns the fixed revisioned three-lens registry", () => {
    const result = new EvaluatorLensesService().list();

    expect(result.items.map((lens) => lens.ref.lensId)).toEqual([
      "general-novice",
      "decision-maker",
      "strict-reviewer",
    ]);
    expect(result.items.every((lens) => lens.ref.revision === 1)).toBe(true);
  });
});
