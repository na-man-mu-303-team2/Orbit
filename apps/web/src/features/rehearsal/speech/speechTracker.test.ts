import { describe, expect, it } from "vitest";

import { createSpeechTracker } from "./speechTracker";

describe("SpeechTracker", () => {
  it("partial 전사에서도 키워드를 즉시 체크하고 final 문장 진행과 함께 유지한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes:
        "오르빗 리허설 화면은 발표 흐름을 점검합니다. 마지막 결론은 실시간 피드백입니다.",
      keywords: [
        {
          keywordId: "kw_orbit",
          text: "오르빗",
          synonyms: [],
          abbreviations: []
        }
      ]
    });

    const partialEvents = tracker.acceptResult({
        text: "오르빗 리허설 화면",
        isFinal: false,
        timestampMs: [0, 500]
      });
    expect(partialEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "sentence-covered",
          sentenceId: "sentence_1",
          matchKind: "covered"
        })
      ])
    );
    expect(partialEvents).toContainEqual({
      type: "keyword-hit",
      slideId: "slide_1",
      keywordId: "kw_orbit",
      atMs: 500
    });
    expect(tracker.snapshot()).toMatchObject({
      effectiveCoverage: 0.5,
      hitKeywordIds: ["kw_orbit"],
      prompterProgress: {
        phase: "candidate",
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      },
      finalSentenceCommitted: false
    });

    const events = tracker.acceptResult({
      text: "오르빗 리허설 화면은 발표 흐름을 점검합니다",
      isFinal: true,
      timestampMs: [500, 1500]
    });

    expect(events.map((event) => event.type)).not.toContain("keyword-hit");
    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 0.5,
      finalSentenceSpoken: false,
      hitKeywordIds: ["kw_orbit"],
      prompterProgress: {
        currentSentenceId: "sentence_2",
        committedSentenceIds: ["sentence_1"]
      }
    });
  });

  it("마지막 문장 발화와 hybrid coverage를 함께 계산한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      threshold: 0.7,
      speakerNotes:
        "첫 내용은 제품 맥락을 설명합니다. 두 번째 내용은 사용 흐름을 보여줍니다. 마지막 결론은 실시간 피드백입니다.",
      keywords: []
    });

    const events = tracker.acceptResult({
      text:
        "제품 맥락을 설명합니다. 사용 흐름을 보여줍니다. 마지막 결론은 실시간 피드백입니다.",
      isFinal: true,
      timestampMs: [0, 2000]
    });
    const coverage = events.find((event) => event.type === "coverage-updated");

    expect(events.map((event) => event.type)).toContain("last-sentence-spoken");
    expect(coverage).toMatchObject({
      sentenceCoverage: 1,
      effectiveCoverage: 1
    });
    expect(coverage?.type === "coverage-updated" ? coverage.wordCoverage : 0).toBeGreaterThan(
      0.6
    );
    expect(tracker.snapshot()).toMatchObject({
      finalSentenceSpoken: true,
      finalSentenceCommitted: false,
      prompterProgress: {
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      }
    });
  });

  it("threshold 근처에서만 어절 보조 신호를 +/-10%p로 반영한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      threshold: 0.7,
      speakerNotes:
        "오르빗 화면은 자료를 정리합니다. 리허설 흐름은 시간을 점검합니다. 마지막 결론은 피드백입니다.",
      keywords: []
    });

    tracker.acceptResult({
      text:
        "오르빗 화면은 자료를 정리합니다. 리허설 흐름은 시간을 점검합니다. 마지막 결론은 다른 표현입니다.",
      isFinal: true,
      timestampMs: [0, 2000]
    });

    const snapshot = tracker.snapshot();
    expect(snapshot.sentenceCoverage).toBeCloseTo(2 / 3, 5);
    expect(snapshot.wordCoverage).toBeGreaterThan(snapshot.sentenceCoverage);
    expect(snapshot.effectiveCoverage).toBeLessThanOrEqual(
      snapshot.sentenceCoverage + 0.1
    );
    expect(snapshot.effectiveCoverage).toBeGreaterThan(snapshot.sentenceCoverage);
  });

  it("슬라이드 이탈 시 잠정 missing을 내고 복귀하면 전환 판정 상태만 리셋한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: "오르빗 리허설 화면을 설명합니다.",
      keywords: [
        {
          keywordId: "kw_orbit",
          text: "오르빗",
          synonyms: [],
          abbreviations: []
        },
        {
          keywordId: "kw_timer",
          text: "타이머",
          synonyms: [],
          abbreviations: []
        }
      ]
    });

    tracker.acceptResult({
      text: "오르빗 리허설 화면을 설명합니다",
      isFinal: true,
      timestampMs: [0, 1000]
    });
    expect(tracker.exitSlide(1500)).toContainEqual({
      type: "keyword-missing",
      slideId: "slide_1",
      keywordId: "kw_timer",
      provisional: true,
      atMs: 1500
    });

    tracker.resetForSlideVisit();

    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 0,
      effectiveCoverage: 0,
      hitKeywordIds: ["kw_orbit"],
      finalSentenceCommitted: false,
      prompterProgress: {
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      }
    });
  });

  it("제어 문구와 겹치는 대본 문장은 coverage 후보에서 제외한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: "다음 슬라이드. 제품 가치를 설명합니다.",
      controlPhrases: ["다음 슬라이드"],
      keywords: []
    });

    expect(tracker.snapshot().matchableSentenceCount).toBe(1);

    const commandEvents = tracker.acceptResult({
      text: "다음 슬라이드",
      isFinal: true,
      timestampMs: [0, 500]
    });

    expect(commandEvents.map((event) => event.type)).not.toContain(
      "sentence-covered"
    );
    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 0,
      effectiveCoverage: 0
    });

    tracker.acceptResult({
      text: "제품 가치를 설명합니다",
      isFinal: true,
      timestampMs: [500, 1500]
    });

    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 1,
      effectiveCoverage: 1
    });
  });

  it("speaker notes 줄 단위로 script coverage를 갱신한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: [
        "첫 줄은 제품 맥락을 설명합니다. 같은 줄 보충 설명입니다.",
        "둘째 줄은 리허설 흐름을 보여줍니다.",
        "다음 슬라이드"
      ].join("\n"),
      controlPhrases: ["다음 슬라이드"],
      keywords: []
    });

    expect(tracker.snapshot().matchableSentenceCount).toBe(2);

    tracker.acceptResult({
      text: "제품 맥락을 설명합니다",
      isFinal: true,
      timestampMs: [0, 800]
    });

    expect(tracker.snapshot()).toMatchObject({
      coveredSentenceIds: ["sentence_1"],
      sentenceCoverage: 0.5
    });

    tracker.acceptResult({
      text: "리허설 흐름을 보여줍니다",
      isFinal: true,
      timestampMs: [800, 1600]
    });

    expect(tracker.snapshot()).toMatchObject({
      coveredSentenceIds: ["sentence_1", "sentence_2"],
      sentenceCoverage: 1,
      finalSentenceSpoken: false
    });
  });

  it("semantic sentence match는 중복 없이 sentence coverage와 마지막 문장 이벤트를 만든다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      threshold: 0.7,
      speakerNotes: "첫 내용은 제품 맥락입니다. 마지막 결론은 피드백입니다.",
      keywords: []
    });

    tracker.acceptResult({
      text: "같은 뜻의 다른 표현입니다",
      isFinal: true,
      timestampMs: [0, 1000]
    });

    const firstEvents = tracker.acceptSemanticSentenceMatch({
      sentenceId: "sentence_1",
      transcript: "같은 뜻의 다른 표현입니다",
      similarity: 0.82,
      atMs: 1100
    });
    const duplicateEvents = tracker.acceptSemanticSentenceMatch({
      sentenceId: "sentence_1",
      transcript: "같은 뜻의 다른 표현입니다",
      similarity: 0.84,
      atMs: 1200
    });
    const finalEvents = tracker.acceptSemanticSentenceMatch({
      sentenceId: "sentence_2",
      transcript: "마지막을 다르게 말했습니다",
      similarity: 0.9,
      atMs: 1500
    });

    expect(firstEvents.map((event) => event.type)).toEqual([
      "sentence-covered",
      "coverage-updated"
    ]);
    expect(firstEvents[0]).toMatchObject({
      type: "sentence-covered",
      matchKind: "paraphrased",
      similarity: 0.82
    });
    expect(duplicateEvents).toEqual([]);
    expect(finalEvents.map((event) => event.type)).toEqual([
      "sentence-covered",
      "last-sentence-spoken",
      "coverage-updated"
    ]);
    expect(tracker.snapshot()).toMatchObject({
      sentenceCoverage: 1,
      finalSentenceSpoken: true,
      prompterProgress: {
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      },
      finalSentenceCommitted: false
    });
  });

  it("partial lexical evidence는 final boundary 전까지 프롬프터를 넘기지 않는다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes:
        "첫 문장은 제품 맥락과 사용자 문제를 설명합니다. 둘째 문장은 해결 흐름을 정리합니다.",
      keywords: []
    });

    tracker.acceptResult({
      text: "첫 문장은 제품 맥락과 사용자 문제를 설명합니다",
      isFinal: false,
      timestampMs: [0, 900]
    });

    expect(tracker.snapshot()).toMatchObject({
      prompterProgress: {
        phase: "candidate",
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      }
    });

    tracker.acceptResult({
      text: "첫 문장은 제품 맥락과 사용자 문제를 설명합니다",
      isFinal: true,
      timestampMs: [900, 1200]
    });

    expect(tracker.snapshot()).toMatchObject({
      prompterProgress: {
        phase: "committed",
        currentSentenceId: "sentence_2",
        committedSentenceIds: ["sentence_1"]
      }
    });
  });

  it("manual API는 coverage를 변경하지 않고 프롬프터 위치만 이동한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes:
        "첫 문장은 제품 맥락을 설명합니다. 둘째 문장은 해결 흐름을 정리합니다.",
      keywords: []
    });

    expect(tracker.manualNextPrompter(1_000)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      coveredSentenceIds: [],
      prompterProgress: {
        currentSentenceId: "sentence_2",
        committedSentenceIds: ["sentence_1"]
      }
    });

    expect(tracker.manualPreviousPrompter(1_100)).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      coveredSentenceIds: [],
      prompterProgress: {
        currentSentenceId: "sentence_1",
        committedSentenceIds: []
      }
    });
  });

  it("pause boundary는 충분한 lexical candidate가 있을 때만 현재 문장을 commit한다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: "오르빗 리허설 화면은 발표 흐름을 점검합니다.",
      keywords: []
    });

    tracker.acceptResult({
      text: "오르빗 리허설 화면은 발표 흐름을 점검합니다",
      isFinal: false,
      timestampMs: [0, 800]
    });

    expect(
      tracker.acceptPrompterBoundary({ type: "pause-started", atMs: 900 })
    ).toBe(true);
    expect(tracker.snapshot()).toMatchObject({
      finalSentenceCommitted: true,
      prompterProgress: {
        currentSentenceId: null,
        committedSentenceIds: ["sentence_1"]
      }
    });
  });

  it("semantic coverage event는 transcript, speakerNotes, similarity 원문을 노출하지 않는다", () => {
    const tracker = createSpeechTracker({
      slideId: "slide_1",
      speakerNotes: "보안상 대본 원문입니다.",
      keywords: []
    });

    const events = tracker.acceptSemanticSentenceMatch({
      sentenceId: "sentence_1",
      transcript: "보안상 final transcript입니다",
      similarity: 0.88,
      matchKind: "paraphrased",
      lexicalOverlap: 0.2,
      atMs: 1000
    });

    for (const event of events) {
      expect(Object.keys(event)).not.toContain("transcript");
      expect(Object.keys(event)).not.toContain("speakerNotes");
      expect(JSON.stringify(event)).not.toContain("보안상 final transcript");
      expect(JSON.stringify(event)).not.toContain("보안상 대본 원문");
    }
  });
});
