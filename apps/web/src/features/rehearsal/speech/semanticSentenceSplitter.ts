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
    if (normalized[index] !== ".") {
      continue;
    }

    const previous = normalized[index - 1] ?? "";
    const next = normalized[index + 1] ?? "";
    const isDecimalPoint = /\d/.test(previous) && /\d/.test(next);
    const isBoundary = next === "" || /\s/.test(next);
    if (isDecimalPoint || !isBoundary) {
      continue;
    }

    const text = normalizeSentenceText(normalized.slice(startOffset, index + 1));
    if (text) {
      sentences.push({ text, startOffset, endOffset: index + 1 });
    }

    startOffset = index + 1;
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
