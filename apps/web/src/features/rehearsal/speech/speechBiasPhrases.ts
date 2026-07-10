import { defaultSpeechTrackingConfig } from "./speechTrackingConfig";
import { normalizeSpeechText } from "./phraseExtractor";

export type SpeechBiasSource =
  | "control-phrase"
  | "final-trigger"
  | "cue-trigger"
  | "keyword"
  | "synonym"
  | "abbreviation"
  | "context-item"
  | "representative-phrase"
  | "legacy";

export type SpeechBiasTerm = {
  text: string;
  source: SpeechBiasSource;
  weight: number;
  keywordId?: string;
  canonicalText?: string;
};

export type SpeechBiasKeyword = {
  keywordId: string;
  text: string;
  synonyms: readonly string[];
  abbreviations: readonly string[];
};

export type BuildSpeechTrackingBiasPhrasesInput = {
  budget?: number;
  controlPhrases?: readonly string[];
  finalTriggerPhrases?: readonly string[];
  cuePhrases?: readonly string[];
  keywords?: readonly SpeechBiasKeyword[];
  contextPhrases?: readonly string[];
  representativePhrases?: readonly string[];
  legacyPhrases?: readonly string[];
};

export function buildSpeechTrackingBiasPhrases(
  input: BuildSpeechTrackingBiasPhrasesInput
): SpeechBiasTerm[] {
  const budget = Math.max(
    0,
    input.budget ?? defaultSpeechTrackingConfig.biasPhraseBudget
  );
  const terms: SpeechBiasTerm[] = [];
  const seen = new Set<string>();

  const addTerm = (term: SpeechBiasTerm) => {
    if (terms.length >= budget) {
      return;
    }

    const text = normalizeDisplayText(term.text);
    const key = normalizeSpeechText(text);
    if (!text || !key || seen.has(key)) {
      return;
    }

    seen.add(key);
    terms.push({ ...term, text });
  };

  // P3-D13 우선순위: 명령/종결/큐/키워드는 레거시 slide context보다 먼저 예산을 확보한다.
  for (const phrase of input.controlPhrases ?? []) {
    addTerm({ text: phrase, source: "control-phrase", weight: 1 });
  }

  for (const phrase of input.finalTriggerPhrases ?? []) {
    addTerm({ text: phrase, source: "final-trigger", weight: 0.98 });
  }

  for (const phrase of input.cuePhrases ?? []) {
    addTerm({ text: phrase, source: "cue-trigger", weight: 0.96 });
  }

  for (const keyword of input.keywords ?? []) {
    addTerm({
      text: keyword.text,
      source: "keyword",
      weight: 0.94,
      keywordId: keyword.keywordId,
      canonicalText: keyword.text
    });
    for (const synonym of keyword.synonyms) {
      addTerm({
        text: synonym,
        source: "synonym",
        weight: 0.92,
        keywordId: keyword.keywordId,
        canonicalText: keyword.text
      });
    }
    for (const abbreviation of keyword.abbreviations) {
      addTerm({
        text: abbreviation,
        source: "abbreviation",
        weight: 0.9,
        keywordId: keyword.keywordId,
        canonicalText: keyword.text
      });
    }
  }

  for (const phrase of input.contextPhrases ?? []) {
    addTerm({ text: phrase, source: "context-item", weight: 0.88 });
  }

  for (const phrase of input.representativePhrases ?? []) {
    addTerm({ text: phrase, source: "representative-phrase", weight: 0.75 });
  }

  for (const phrase of input.legacyPhrases ?? []) {
    addTerm({ text: phrase, source: "legacy", weight: 0.45 });
  }

  return terms;
}

function normalizeDisplayText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
