/**
 * Splits speaker notes with the same rules used by presenter speech tracking.
 * The returned zero-based index is the canonical sentenceIndex for a sentence target.
 */
export function splitFocusedPracticeSentences(speakerNotes: string): string[] {
  const normalized = speakerNotes
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/…+/g, "…")
    .trim();

  if (!normalized) return [];

  const explicitLines = normalized
    .split("\n")
    .map(formatFocusedPracticeSentence)
    .filter(Boolean);
  if (explicitLines.length > 1) return explicitLines;

  const sentences: string[] = [];
  let current = "";
  for (let index = 0; index < normalized.length; index += 1) {
    current += normalized[index] ?? "";
    if (!isSentenceBoundary(normalized, index)) continue;
    addSentence(sentences, current);
    current = "";
  }
  addSentence(sentences, current);
  return sentences;
}

/** Canonical UTF-8 input for a sentence target's SHA-256 textSnapshotHash. */
export function normalizeFocusedPracticeSentenceText(value: string): string {
  return formatFocusedPracticeSentence(value.normalize("NFC"));
}

function isSentenceBoundary(text: string, index: number) {
  const char = text[index] ?? "";
  const next = text[index + 1] ?? "";
  const previous = text[index - 1] ?? "";

  if (char === "\n") return true;
  if (char === "." && /\d/.test(previous) && /\d/.test(next)) return false;
  return /[.!?。！？…]/u.test(char);
}

function addSentence(sentences: string[], rawSentence: string) {
  const sentence = formatFocusedPracticeSentence(rawSentence);
  if (sentence) sentences.push(sentence);
}

function formatFocusedPracticeSentence(rawSentence: string) {
  return rawSentence
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.!?。！？…]+$/u, "");
}
