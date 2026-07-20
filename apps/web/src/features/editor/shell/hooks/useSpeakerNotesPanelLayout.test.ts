import { describe, expect, it } from "vitest";

import {
  getSpeakerNotesPanelMaxHeight,
  minSpeakerNotesPanelHeight,
  reportSpeakerNotesPanelHeight,
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

  it("uses a 360px report baseline without exceeding a short viewport", () => {
    expect(reportSpeakerNotesPanelHeight).toBe(360);
    expect(Math.min(reportSpeakerNotesPanelHeight, getSpeakerNotesPanelMaxHeight(480)))
      .toBe(320);
  });
});
