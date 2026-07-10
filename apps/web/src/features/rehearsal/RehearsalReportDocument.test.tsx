import { deckSchema, type Deck, type RehearsalReport } from "@orbit/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RehearsalReportDocument } from "./RehearsalReportDocument";

describe("RehearsalReportDocument", () => {
  it("groups utterance outcomes with slide context and bounded ad-lib text", () => {
    const html = renderToStaticMarkup(
      <RehearsalReportDocument
        deck={deck}
        prevReports={[]}
        projectId="project_a"
        report={reportFixture({
          utteranceOutcomes: [
            { slideId: "slide_1", kind: "covered", sentenceId: "sentence_1" },
            {
              slideId: "slide_1",
              kind: "paraphrased",
              sentenceId: "sentence_2",
              similarity: 0.93
            },
            {
              slideId: "slide_1",
              kind: "ad-lib",
              text: "고객 사례를 하나 더 설명했습니다.",
              sentenceId: "sentence_2",
              similarity: 0.87
            },
            { slideId: "slide_2", kind: "missed", sentenceId: "sentence_1" }
          ],
          semanticCueDecisions: [
            {
              slideId: "slide_1",
              cueId: "scue_intro_1",
              label: "covered",
              finalScore: 0.82,
              matchedBy: "nli",
              measurementMode: "full",
              fallbackUsed: false,
              entailmentScore: 0.91,
              premise: "보고서에 그대로 노출하지 않을 전사 근거",
              hypothesis: "보고서에 그대로 노출하지 않을 가설",
              provider: "browser-transformersjs",
              modelId: "model",
              reasonCodes: ["nli-entailment", "concept-coverage"]
            }
          ]
        })}
        run={{
          runId: "run_1",
          projectId: "project_a",
          deckId: "deck_a",
          jobId: null,
          audioFileId: null,
          rawAudioDeletedAt: null,
          status: "succeeded",
          error: null,
          createdAt: "2026-07-03T00:00:00.000Z",
          updatedAt: "2026-07-03T00:00:00.000Z"
        }}
        runNumber={1}
        totalRunCount={1}
      />
    );

    expect(html).toContain("발화 커버리지");
    expect(html).toContain("그대로 말한 문장");
    expect(html).toContain("바꿔 말한 문장");
    expect(html).toContain("추가로 말한 애드리브");
    expect(html).toContain("설명하지 않은 문장");
    expect(html).toContain("도입 문장입니다");
    expect(html).toContain("핵심 메시지를 다르게 설명합니다");
    expect(html).toContain("고객 사례를 하나 더 설명했습니다.");
    expect(html).toContain("마무리 문장입니다");
    expect(html).toContain("슬라이드 1 · Opening");
    expect(html).toContain("93%");
    expect(html).toContain("Semantic cue evidence");
    expect(html).toContain("scue_intro_1");
    expect(html).toContain("82%");
    expect(html).toContain("nli-entailment");
    expect(html).not.toContain("보고서에 그대로 노출하지 않을 전사 근거");
    expect(html).not.toContain("보고서에 그대로 노출하지 않을 가설");
  });
});

const deck: Deck = deckSchema.parse({
  deckId: "deck_a",
  projectId: "project_a",
  title: "Outcome deck",
  version: 1,
  targetDurationMinutes: 5,
  canvas: {
    preset: "wide-16-9",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9"
  },
  theme: {
    name: "Test",
    fontFamily: "Inter",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    accentColor: "#2563eb",
    palette: {
      primary: "#2563eb",
      secondary: "#10b981",
      surface: "#ffffff",
      muted: "#f3f4f6",
      border: "#dbe3f0"
    },
    typography: {
      headingFontFamily: "Inter",
      bodyFontFamily: "Inter",
      titleSize: 48,
      headingSize: 32,
      bodySize: 22,
      captionSize: 14
    },
    effects: {
      borderRadius: 8,
      shadow: {
        color: "#111827",
        blur: 16,
        offsetX: 0,
        offsetY: 8,
        opacity: 0.15
      }
    }
  },
  slides: [
    {
      slideId: "slide_1",
      order: 1,
      title: "Opening",
      estimatedSeconds: 60,
      style: {},
      speakerNotes: "도입 문장입니다. 핵심 메시지를 다르게 설명합니다.",
      elements: [],
      animations: [],
      keywords: []
    },
    {
      slideId: "slide_2",
      order: 2,
      title: "Closing",
      estimatedSeconds: 45,
      style: {},
      speakerNotes: "마무리 문장입니다.",
      elements: [],
      animations: [],
      keywords: []
    }
  ]
});

function reportFixture(patch: Partial<RehearsalReport> = {}): RehearsalReport {
  return {
    reportId: "report_run-1",
    runId: "run_1",
    projectId: "project_a",
    deckId: "deck_a",
    transcriptRetained: false,
    transcript: null,
    metrics: {
      durationSeconds: 90,
      wordsPerMinute: 120,
      fillerWordCount: 0,
      pauseCount: 0,
      keywordCoverage: 1,
      keywordCoverageMeasurement: { state: "measured" }
    },
    speedSamples: [],
    fillerWordDetails: [],
    pauseDetails: [],
    missedKeywords: [],
    utteranceOutcomes: [],
    semanticCueDecisions: [],
    semanticEvaluation: {
      state: "unavailable",
      measurementMode: "none",
      reasons: ["evaluation_not_run"],
      retryable: false
    },
    semanticCueOutcomes: [],
    slideTimings: [],
    slideInsights: [],
    qnaSummary: {
      questionCount: 0,
      questionSummary: "",
      unclearTopics: []
    },
    coaching: null,
    generatedAt: "2026-07-03T00:00:10.000Z",
    ...patch
  };
}
