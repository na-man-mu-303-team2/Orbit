import type { Keyword } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExtractedSentence, SpeechTrackerSnapshot } from "../speech/speechTrackingEvents";
import type { RehearsalTimingSnapshot, TimingAdviceState } from "./rehearsalTiming";
import {
  RehearsalPanel
} from "./RehearsalPanel";
import { getRehearsalScriptFocusSentenceId } from "./rehearsalScriptPrompter";

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
    expect(html).toContain("presenter-script-row--covered");
    expect(html).toContain("presenter-script-row--current");
    expect(html).toContain("presenter-script-row--next");
    expect(html).toContain("체크됨");
  });

  it("distinguishes semantic paraphrase coverage in the script rows", () => {
    const html = renderPanel({
      snapshot: {
        ...snapshot,
        coveredSentenceMatchKinds: {
          sentence_1: "paraphrased"
        }
      }
    });

    expect(html).toContain("presenter-script-row--paraphrased");
    expect(html).toContain("의미 전달");
  });

  it("highlights direct keywords and aliases inside script sentences", () => {
    const html = renderPanel({
      keywords: [
        {
          keywordId: "kw_ai",
          text: "OpenAI",
          synonyms: ["AI lab"],
          abbreviations: ["OAI"],
          required: true
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

    expect(html).toContain('<span class="keyword-mark " data-keyword-id="kw_ai">');
    expect(html).toContain("<strong>OpenAI</strong>");
    expect(html).toContain("<strong>AI lab</strong>");
    expect(html).toContain("<strong>OAI</strong>");
    expect(html).not.toContain("<button");
  });

  it("only highlights targeted keyword occurrences inside script sentences", () => {
    const html = renderPanel({
      highlightedKeywordOccurrences: [
        {
          occurrenceId: "kwo_slide_1_kw_keyword_21_28",
          keywordId: "kw_keyword",
          start: 21,
          end: 28
        }
      ],
      keywords: [
        {
          keywordId: "kw_keyword",
          text: "keyword",
          synonyms: [],
          abbreviations: [],
          required: true
        }
      ],
      sentences: [
        {
          sentenceId: "sentence_1",
          text: "keyword first",
          index: 0,
          isFinalTrigger: false,
          matchable: true,
          candidates: []
        },
        {
          sentenceId: "sentence_2",
          text: "final keyword",
          index: 1,
          isFinalTrigger: true,
          matchable: true,
          candidates: []
        }
      ],
      speakerNotes: "keyword first. final keyword."
    });

    expect(html.match(/class="keyword-mark "/g)).toHaveLength(1);
    expect(html).not.toContain("keyword-note-token");
    expect(html.match(/<strong>keyword<\/strong>/g)).toHaveLength(1);
    expect(html).toContain('data-occurrence-id="kwo_slide_1_kw_keyword_21_28"');
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
    ).toBe("sentence_4");
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
    highlightedKeywordOccurrences?: Array<{
      occurrenceId: string;
      keywordId: string;
      start: number;
      end: number;
    }>;
    speakerNotes?: string;
    sentences?: ExtractedSentence[];
    snapshot?: SpeechTrackerSnapshot;
  } = {}
) {
  void overrides.transcriptText;

  return renderToStaticMarkup(
    <RehearsalPanel
      mode={overrides.mode ?? "rehearsal"}
      timing={timing}
      wordsPerMinute={140}
      adviceState={adviceState}
      highlightedKeywordOccurrences={overrides.highlightedKeywordOccurrences}
      keywords={overrides.keywords ?? keywords}
      sentences={overrides.sentences ?? sentences}
      speakerNotes={overrides.speakerNotes}
      snapshot={overrides.snapshot ?? snapshot}
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
    required: true
  },
  {
    keywordId: "kw_privacy",
    text: "privacy",
    synonyms: [],
    abbreviations: [],
    required: true
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
    isFinalTrigger: false,
    matchable: true,
    candidates: []
  },
  {
    sentenceId: "sentence_4",
    text: "Final line summarizes the next action.",
    index: 3,
    isFinalTrigger: true,
    matchable: true,
    candidates: []
  }
];

const snapshot: SpeechTrackerSnapshot = {
  slideId: "slide_1",
  coveredSentenceIds: ["sentence_1"],
  coveredSentenceMatchKinds: {
    sentence_1: "covered"
  },
  matchableSentenceCount: 3,
  sentenceCoverage: 1 / 3,
  wordCoverage: 0.45,
  effectiveCoverage: 0.49,
  finalSentenceSpoken: false,
  hitKeywordIds: ["kw_ai"],
  provisionalMissingKeywordIds: ["kw_privacy"]
};
