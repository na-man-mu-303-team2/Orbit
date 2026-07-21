export const koreanFillerClassifierVersion =
  "korean-filler-classifier-v2" as const;

export type KoreanFillerEvidenceKind =
  | "standalone-token"
  | "pause-boundary"
  | "punctuation-isolation"
  | "repetition-or-restart"
  | "not-in-script";

export type KoreanFillerOccurrence = {
  utteranceId: string;
  surface: string;
  normalized: string;
  category: "vocalized-pause" | "hesitation" | "discourse-marker";
  charStart: number;
  charEnd: number;
  offsetScope: "utterance";
  evidenceKinds: KoreanFillerEvidenceKind[];
  slideId: string | null;
};

export type KoreanDisfluencyOccurrence = {
  utteranceId: string;
  surface: string;
  normalized: string;
  kind: "repetition" | "stutter" | "restart";
  charStart: number;
  charEnd: number;
  offsetScope: "utterance";
  slideId: string | null;
};

type ClassifierInput = {
  utteranceId: string;
  transcript: string;
  slideId: string | null;
  scriptText?: string | null;
};

type Token = {
  text: string;
  normalized: string;
  start: number;
  end: number;
};

const definiteFillers = new Map<
  string,
  KoreanFillerOccurrence["category"]
>([
  ["음", "vocalized-pause"],
  ["어", "vocalized-pause"],
  ["으", "vocalized-pause"],
  ["으음", "vocalized-pause"],
  ["음음", "vocalized-pause"],
  ["엄", "vocalized-pause"],
] as const);

const ambiguousFillers = new Map<
  string,
  KoreanFillerOccurrence["category"]
>([
  ["아", "hesitation"],
  ["그", "hesitation"],
  ["저", "hesitation"],
  ["저기", "hesitation"],
  ["뭐", "hesitation"],
  ["그러니까", "discourse-marker"],
  ["약간", "discourse-marker"],
  ["이제", "discourse-marker"],
] as const);

const fillerPhrases = [
  { tokens: ["그", "뭐지"], normalized: "그뭐지" },
  { tokens: ["뭐", "랄까"], normalized: "뭐랄까" },
  { tokens: ["뭐랄까"], normalized: "뭐랄까" },
  { tokens: ["그니까"], normalized: "그니까" },
] as const;

export function classifyKoreanFillerUtterance(input: ClassifierInput): {
  fillerOccurrences: KoreanFillerOccurrence[];
  disfluencyOccurrences: KoreanDisfluencyOccurrence[];
} {
  const tokens = tokenize(input.transcript);
  const consumed = new Set<number>();
  const fillerOccurrences: KoreanFillerOccurrence[] = [];
  const script = normalize(input.scriptText ?? "");

  for (const phrase of fillerPhrases) {
    for (let index = 0; index <= tokens.length - phrase.tokens.length; index += 1) {
      const phraseIndexes = phrase.tokens.map((_, offset) => index + offset);
      if (phraseIndexes.some((tokenIndex) => consumed.has(tokenIndex))) continue;
      if (
        !phrase.tokens.every(
          (expected, offset) =>
            tokens[index + offset]?.normalized === expected,
        )
      ) {
        continue;
      }
      const first = tokens[index];
      const last = tokens[index + phrase.tokens.length - 1];
      if (!first || !last) continue;
      phraseIndexes.forEach((tokenIndex) => consumed.add(tokenIndex));
      fillerOccurrences.push(
        occurrence(input, first.start, last.end, phrase.normalized, "hesitation", [
          "standalone-token",
          ...contextEvidence(input.transcript, first, last, index, tokens, script),
        ]),
      );
    }
  }

  tokens.forEach((token, index) => {
    if (consumed.has(index)) return;
    const definiteCategory = definiteFillers.get(token.normalized);
    if (definiteCategory) {
      fillerOccurrences.push(
        occurrence(
          input,
          token.start,
          token.end,
          token.normalized,
          definiteCategory,
          [
            "standalone-token",
            ...contextEvidence(
              input.transcript,
              token,
              token,
              index,
              tokens,
              script,
            ),
          ],
        ),
      );
      return;
    }

    const ambiguousCategory = ambiguousFillers.get(token.normalized);
    if (!ambiguousCategory) return;
    const contextual = contextEvidence(
      input.transcript,
      token,
      token,
      index,
      tokens,
      script,
    );
    if (new Set(contextual).size < 2) return;
    fillerOccurrences.push(
      occurrence(
        input,
        token.start,
        token.end,
        token.normalized,
        ambiguousCategory,
        ["standalone-token", ...contextual],
      ),
    );
  });

  return {
    fillerOccurrences: fillerOccurrences.sort(
      (left, right) => left.charStart - right.charStart,
    ),
    disfluencyOccurrences: classifyDisfluencies(input, tokens),
  };
}

function occurrence(
  input: ClassifierInput,
  start: number,
  end: number,
  normalized: string,
  category: KoreanFillerOccurrence["category"],
  evidenceKinds: KoreanFillerEvidenceKind[],
): KoreanFillerOccurrence {
  return {
    utteranceId: input.utteranceId,
    surface: input.transcript.slice(start, end),
    normalized,
    category,
    charStart: start,
    charEnd: end,
    offsetScope: "utterance",
    evidenceKinds: [...new Set(evidenceKinds)],
    slideId: input.slideId,
  };
}

function contextEvidence(
  transcript: string,
  first: Token,
  last: Token,
  index: number,
  tokens: readonly Token[],
  script: string,
): KoreanFillerEvidenceKind[] {
  const evidence: KoreanFillerEvidenceKind[] = [];
  if (index === 0 || index + 1 === tokens.length) evidence.push("pause-boundary");
  const before = transcript.slice(Math.max(first.start - 2, 0), first.start);
  const after = transcript.slice(last.end, last.end + 2);
  if (/[,.;:!?…、，。！？]/u.test(before) || /[,.;:!?…、，。！？]/u.test(after)) {
    evidence.push("punctuation-isolation");
  }
  const previous = tokens[index - 1];
  const next = tokens[index + 1];
  if (
    previous?.normalized === first.normalized ||
    next?.normalized === last.normalized ||
    previous?.normalized === "다시" ||
    next?.normalized === "다시"
  ) {
    evidence.push("repetition-or-restart");
  }
  const normalizedSurface = normalize(transcript.slice(first.start, last.end));
  if (script && normalizedSurface && !script.includes(normalizedSurface)) {
    evidence.push("not-in-script");
  }
  return evidence;
}

function classifyDisfluencies(
  input: ClassifierInput,
  tokens: readonly Token[],
): KoreanDisfluencyOccurrence[] {
  const occurrences: KoreanDisfluencyOccurrence[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    if (
      !previous ||
      !current ||
      !(
        previous.normalized === current.normalized ||
        (previous.normalized.length >= 2 &&
          current.normalized.startsWith(previous.normalized))
      )
    ) {
      continue;
    }
    occurrences.push(
      disfluency(input, previous.start, current.end, "repetition"),
    );
  }
  for (const match of input.transcript.matchAll(/([\p{L}])\s*[-·]\s*\1[\p{L}]+/gu)) {
    const start = match.index;
    occurrences.push(
      disfluency(input, start, start + match[0].length, "stutter"),
    );
  }
  for (const match of input.transcript.matchAll(/(?:아니|잠깐)[,\s]+(?:그게\s+아니라|다시)/gu)) {
    const start = match.index;
    occurrences.push(
      disfluency(input, start, start + match[0].length, "restart"),
    );
  }
  return occurrences.sort((left, right) => left.charStart - right.charStart);
}

function disfluency(
  input: ClassifierInput,
  start: number,
  end: number,
  kind: KoreanDisfluencyOccurrence["kind"],
): KoreanDisfluencyOccurrence {
  const surface = input.transcript.slice(start, end);
  return {
    utteranceId: input.utteranceId,
    surface,
    normalized: normalize(surface),
    kind,
    charStart: start,
    charEnd: end,
    offsetScope: "utterance",
    slideId: input.slideId,
  };
}

function tokenize(transcript: string): Token[] {
  return [...transcript.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    text: match[0],
    normalized: normalize(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}
