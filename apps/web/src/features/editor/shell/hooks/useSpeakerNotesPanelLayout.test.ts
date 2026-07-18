import { describe, expect, it } from "vitest";

import {
  getSpeakerNotesPanelMaxHeight,
  minSpeakerNotesPanelHeight,
} from "./useSpeakerNotesPanelLayout";

describe("getSpeakerNotesPanelMaxHeight", () => {
  it("allows the bottom panel to expand to two thirds of the viewport", () => {
    expect(getSpeakerNotesPanelMaxHeight(900)).toBe(600);
    expect(getSpeakerNotesPanelMaxHeight(1080)).toBe(720);
  });

  it("preserves the minimum panel height on short viewports", () => {
    expect(getSpeakerNotesPanelMaxHeight(120)).toBe(
      minSpeakerNotesPanelHeight,
    );
  });
});
