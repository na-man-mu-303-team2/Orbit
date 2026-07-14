import type { ExtractedSentence } from "../speech/speechTrackingEvents";

export type RehearsalScriptPrompterRowStatus =
  | "covered"
  | "current"
  | "next"
  | "paraphrased"
  | "pending"
  | "unmatchable";

export type RehearsalScriptPrompterRow = {
  sentence: ExtractedSentence;
  status: RehearsalScriptPrompterRowStatus;
  isFocusTarget: boolean;
};

export function createRehearsalScriptPrompterRows(input: {
  sentences: readonly ExtractedSentence[];
  coveredSentenceIds: ReadonlySet<string> | readonly string[];
  coveredSentenceMatchKinds?: Readonly<Record<string, "covered" | "paraphrased">>;
}): RehearsalScriptPrompterRow[] {
  const coveredSentenceIds =
    input.coveredSentenceIds instanceof Set
      ? input.coveredSentenceIds
      : new Set(input.coveredSentenceIds);
  const matchableSentences = input.sentences.filter((sentence) => sentence.matchable);
  const currentSentence =
    matchableSentences.find(
      (sentence) => !coveredSentenceIds.has(sentence.sentenceId)
    ) ?? null;
  const lastCoveredSentence = findLastCoveredMatchableSentence(
    matchableSentences,
    coveredSentenceIds
  );
  const focusSentence = currentSentence ?? lastCoveredSentence;
  const nextSentence = currentSentence
    ? findNextMatchableSentence(
        matchableSentences,
        currentSentence.sentenceId,
        coveredSentenceIds
      )
    : null;

  return input.sentences.map((sentence) => {
    const covered = coveredSentenceIds.has(sentence.sentenceId);
    const matchKind = input.coveredSentenceMatchKinds?.[sentence.sentenceId];

    if (!sentence.matchable) {
      return {
        sentence,
        status: "unmatchable",
        isFocusTarget: sentence.sentenceId === focusSentence?.sentenceId
      };
    }

    if (sentence.sentenceId === currentSentence?.sentenceId) {
      return {
        sentence,
        status: "current",
        isFocusTarget: true
      };
    }

    if (covered) {
      return {
        sentence,
        status: matchKind === "paraphrased" ? "paraphrased" : "covered",
        isFocusTarget: sentence.sentenceId === focusSentence?.sentenceId
      };
    }

    if (sentence.sentenceId === nextSentence?.sentenceId) {
      return {
        sentence,
        status: "next",
        isFocusTarget: false
      };
    }

    return {
      sentence,
      status: "pending",
      isFocusTarget: false
    };
  });
}

export function getRehearsalScriptFocusSentenceId(
  sentences: readonly ExtractedSentence[],
  coveredSentenceIds: ReadonlySet<string> | readonly string[]
) {
  return (
    createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds
    }).find((row) => row.isFocusTarget)?.sentence.sentenceId ?? null
  );
}

function findLastCoveredMatchableSentence(
  sentences: readonly ExtractedSentence[],
  coveredSentenceIds: ReadonlySet<string>
) {
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index];
    if (sentence && coveredSentenceIds.has(sentence.sentenceId)) {
      return sentence;
    }
  }

  return null;
}

function findNextMatchableSentence(
  sentences: readonly ExtractedSentence[],
  currentSentenceId: string,
  coveredSentenceIds: ReadonlySet<string>
) {
  const currentIndex = sentences.findIndex(
    (sentence) => sentence.sentenceId === currentSentenceId
  );

  if (currentIndex === -1) {
    return null;
  }

  return (
    sentences
      .slice(currentIndex + 1)
      .find((sentence) => !coveredSentenceIds.has(sentence.sentenceId)) ?? null
  );
}
