export type SemanticScriptSentence = {
  sentenceId: string;
  text: string;
  index: number;
  startOffset: number;
  endOffset: number;
  isFinalTrigger: boolean;
};

export function splitSpeakerNotesIntoSemanticSentences(
  speakerNotes: string
): SemanticScriptSentence[] {
  const normalized = speakerNotes
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .trim();
  const sentences: Array<
    Omit<SemanticScriptSentence, "sentenceId" | "index" | "isFinalTrigger">
  > = [];
  let startOffset = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    if (!isSemanticSentenceBoundary(normalized, index)) {
      continue;
    }

    const text = normalizeSentenceText(normalized.slice(startOffset, index + char.length));
    if (text) {
      sentences.push({ text, startOffset, endOffset: index + char.length });
    }

    startOffset = index + char.length;
    while (/\s/.test(normalized[startOffset] ?? "")) {
      startOffset += 1;
    }
  }

  const trailing = normalizeSentenceText(normalized.slice(startOffset));
  if (trailing) {
    sentences.push({
      text: trailing,
      startOffset,
      endOffset: normalized.length
    });
  }

  return sentences.map((sentence, index) => ({
    ...sentence,
    sentenceId: `sentence_${index + 1}`,
    index,
    isFinalTrigger: index === sentences.length - 1
  }));
}

function normalizeSentenceText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isSemanticSentenceBoundary(text: string, index: number) {
  const char = text[index] ?? "";
  if (!".?!。？！…".includes(char)) {
    return false;
  }

  if (char !== ".") {
    return true;
  }

  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  const isDecimalPoint = /\d/.test(previous) && /\d/.test(next);
  const isBoundary = next === "" || /\s/.test(next);
  return !isDecimalPoint && isBoundary;
}
