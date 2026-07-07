import type { Keyword } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExtractedSentence, SpeechTrackerSnapshot } from "../speech/speechTrackingEvents";
import type { RehearsalTimingSnapshot, TimingAdviceState } from "./rehearsalTiming";
import {
  RehearsalPanel,
  getRehearsalScriptFocusSentenceId
} from "./RehearsalPanel";

describe("RehearsalPanel", () => {
  it("renders rehearsal timers, keyword state, script state, and advice", () => {
    const html = renderPanel({ mode: "rehearsal" });

    expect(html).toContain("04:30");
    expect(html).toContain("00:50 / 00:45");
    expect(html).toContain("OpenAI");
    expect(html).toContain("49%");
    expect(html).toContain("WPM");
  });

  it("hides rehearsal-only advice in live mode without adding a mode toggle", () => {
    const html = renderPanel({ mode: "live" });

    expect(html).toContain("OpenAI");
    expect(html).not.toContain("WPM");
    expect(html).not.toContain("rehearsal-panel-advice");
  });

  it("does not render transcript text in the default panel DOM", () => {
    const html = renderPanel({
      transcriptText: "This transcript should stay out of the panel DOM."
    });

    expect(html).not.toContain("This transcript should stay out");
    expect(html).not.toContain("transcript");
  });

  it("marks the script region as auto-following by default", () => {
    const html = renderPanel();

    expect(html).toContain('data-auto-scroll="true"');
  });

  it("highlights direct keywords and aliases inside script sentences", () => {
    const html = renderPanel({
      keywords: [
        {
          keywordId: "kw_ai",
          text: "OpenAI",
          synonyms: ["AI lab"],
          abbreviations: ["OAI"],
          required: true,
          keywordRole: "required-message" as const
        }
      ],
      sentences: [
        {
          sentenceId: "sentence_aliases",
          text: "OpenAI, AI lab, and OAI should all be highlighted.",
          index: 0,
          isFinalTrigger: true,
          matchable: true,
          candidates: []
        }
      ]
    });

    expect(html).toContain('<span class="keyword-mark ">');
    expect(html).toContain("<strong>OpenAI</strong>");
    expect(html).toContain("<strong>AI lab</strong>");
    expect(html).toContain("<strong>OAI</strong>");
    expect(html).not.toContain("<button");
  });

  it("selects the next matchable script sentence as the auto-scroll focus", () => {
    expect(
      getRehearsalScriptFocusSentenceId(sentences, new Set(["sentence_1"]))
    ).toBe("sentence_3");
    expect(
      getRehearsalScriptFocusSentenceId(sentences, [
        "sentence_1",
        "sentence_3"
      ])
    ).toBe("sentence_3");
    expect(getRehearsalScriptFocusSentenceId(sentences, [])).toBe(
      "sentence_1"
    );
    expect(getRehearsalScriptFocusSentenceId([], [])).toBeNull();
  });
});

function renderPanel(
  overrides: {
    mode?: "rehearsal" | "live";
    transcriptText?: string;
    keywords?: Keyword[];
    sentences?: ExtractedSentence[];
  } = {}
) {
  void overrides.transcriptText;

  return renderToStaticMarkup(
    <RehearsalPanel
      mode={overrides.mode ?? "rehearsal"}
      timing={timing}
      wordsPerMinute={140}
      adviceState={adviceState}
      keywords={overrides.keywords ?? keywords}
      sentences={overrides.sentences ?? sentences}
      snapshot={snapshot}
    />
  );
}

const timing: RehearsalTimingSnapshot = {
  deckTargetSeconds: 600,
  elapsedSeconds: 330,
  remainingSeconds: 270,
  currentSlideElapsedSeconds: 50,
  currentSlideTargetSeconds: 45,
  currentSlideOvertime: true
};

const adviceState: TimingAdviceState = {
  pace: "too-fast",
  slideOvertime: true
};

const keywords: Keyword[] = [
  {
    keywordId: "kw_ai",
    text: "OpenAI",
    synonyms: [],
    abbreviations: [],
    required: true,
    keywordRole: "required-message" as const
  },
  {
    keywordId: "kw_privacy",
    text: "privacy",
    synonyms: [],
    abbreviations: [],
    required: true,
    keywordRole: "required-message" as const
  }
];

const sentences: ExtractedSentence[] = [
  {
    sentenceId: "sentence_1",
    text: "OpenAI helps presenters rehearse.",
    index: 0,
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_2",
    text: "ok",
    index: 1,
    isFinalTrigger: false,
    matchable: false,
    candidates: []
  },
  {
    sentenceId: "sentence_3",
    text: "privacy is the closing topic.",
    index: 2,
    isFinalTrigger: true,
    matchable: true,
    candidates: []
  }
];

const snapshot: SpeechTrackerSnapshot = {
  slideId: "slide_1",
  coveredSentenceIds: ["sentence_1"],
  matchableSentenceCount: 2,
  sentenceCoverage: 0.5,
  wordCoverage: 0.45,
  effectiveCoverage: 0.49,
  finalSentenceSpoken: false,
  hitKeywordIds: ["kw_ai"],
  provisionalMissingKeywordIds: ["kw_privacy"]
};
