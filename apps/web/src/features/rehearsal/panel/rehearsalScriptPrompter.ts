import type { ExtractedSentence } from "../speech/speechTrackingEvents";
import type { PrompterProgressSnapshot } from "../speech/prompterProgressTracker";

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
  coverageStatus: "covered" | "paraphrased" | null;
  isFocusTarget: boolean;
};

export function createRehearsalScriptPrompterRows(input: {
  sentences: readonly ExtractedSentence[];
  coveredSentenceIds: ReadonlySet<string> | readonly string[];
  coveredSentenceMatchKinds?: Readonly<Record<string, "covered" | "paraphrased">>;
  prompterProgress?: PrompterProgressSnapshot;
}): RehearsalScriptPrompterRow[] {
  const coveredSentenceIds =
    input.coveredSentenceIds instanceof Set
      ? input.coveredSentenceIds
      : new Set(input.coveredSentenceIds);
  const matchableSentences = input.sentences.filter((sentence) => sentence.matchable);
  const currentSentence = findCurrentMatchableSentence(
    matchableSentences,
    input.prompterProgress
  );
  const finalFocusSentence =
    !currentSentence && input.prompterProgress?.finalSentenceCommitted
      ? (matchableSentences.at(-1) ?? null)
      : null;
  const focusSentence = currentSentence ?? finalFocusSentence;
  const nextSentence = currentSentence
    ? findNextMatchableSentence(
        matchableSentences,
        currentSentence.sentenceId
      )
    : null;

  return input.sentences.map((sentence) => {
    const covered = coveredSentenceIds.has(sentence.sentenceId);
    const matchKind = input.coveredSentenceMatchKinds?.[sentence.sentenceId];
    const coverageStatus = covered
      ? matchKind === "paraphrased"
        ? "paraphrased"
        : "covered"
      : null;

    if (!sentence.matchable) {
      return {
        sentence,
        status: "unmatchable",
        coverageStatus,
        isFocusTarget: sentence.sentenceId === focusSentence?.sentenceId
      };
    }

    if (sentence.sentenceId === focusSentence?.sentenceId) {
      return {
        sentence,
        status: "current",
        coverageStatus,
        isFocusTarget: true
      };
    }

    if (sentence.sentenceId === nextSentence?.sentenceId) {
      return {
        sentence,
        status: "next",
        coverageStatus,
        isFocusTarget: false
      };
    }

    if (coverageStatus) {
      return {
        sentence,
        status: coverageStatus,
        coverageStatus,
        isFocusTarget: false
      };
    }

    return {
      sentence,
      status: "pending",
      coverageStatus,
      isFocusTarget: false
    };
  });
}

export function getRehearsalScriptFocusSentenceId(
  sentences: readonly ExtractedSentence[],
  prompterProgress?: PrompterProgressSnapshot
) {
  return (
    createRehearsalScriptPrompterRows({
      sentences,
      coveredSentenceIds: [],
      prompterProgress
    }).find((row) => row.isFocusTarget)?.sentence.sentenceId ?? null
  );
}

function findCurrentMatchableSentence(
  sentences: readonly ExtractedSentence[],
  prompterProgress?: PrompterProgressSnapshot
) {
  if (!prompterProgress) {
    return sentences[0] ?? null;
  }

  if (prompterProgress.currentSentenceId) {
    return (
      sentences.find(
        (sentence) =>
          sentence.sentenceId === prompterProgress.currentSentenceId
      ) ??
      sentences[0] ??
      null
    );
  }

  return prompterProgress.finalSentenceCommitted
    ? null
    : (sentences[0] ?? null);
}

function findNextMatchableSentence(
  sentences: readonly ExtractedSentence[],
  currentSentenceId: string
) {
  const currentIndex = sentences.findIndex(
    (sentence) => sentence.sentenceId === currentSentenceId
  );

  if (currentIndex === -1) {
    return null;
  }

  return sentences[currentIndex + 1] ?? null;
}
