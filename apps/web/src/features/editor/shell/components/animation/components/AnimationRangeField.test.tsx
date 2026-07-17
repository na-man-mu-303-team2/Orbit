import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./AnimationRangeField.tsx", import.meta.url),
  "utf8"
);

describe("AnimationRangeField gesture commits", () => {
  it("keeps pointer movement local and commits once at gesture end", () => {
    expect(source).toContain(
      "onChange={(event) => updateDraft(Number(event.target.value))}"
    );
    expect(source).toContain(
      "onPointerUp={(event) => commit(Number(event.currentTarget.value))}"
    );
    expect(source).toContain("lastCommittedValueRef.current = normalizedValue");
    expect(source).not.toContain(
      "onChange={(event) => commit(Number(event.target.value))}"
    );
  });
});
