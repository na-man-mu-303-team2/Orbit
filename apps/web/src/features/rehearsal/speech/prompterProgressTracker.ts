export type PrompterProgressPhase = "tracking" | "candidate" | "committed";

export type PrompterProgressSentence = {
  sentenceId: string;
  index: number;
  matchable: boolean;
  isFinalTrigger: boolean;
};

export type PrompterProgressEvidence = {
  sentenceId: string;
  revision: number;
  candidate: boolean;
  commitEligible: boolean;
  source: "lexical" | "semantic-assisted";
  atMs: number;
};

export type PrompterBoundary = {
  type: "stt-final" | "pause-started";
  atMs: number;
};

export type PrompterProgressSnapshot = {
  slideId: string;
  revision: number;
  phase: PrompterProgressPhase;
  currentSentenceId: string | null;
  candidateSentenceId: string | null;
  candidateSinceMs: number | null;
  committedSentenceIds: string[];
  lastCommittedSentenceId: string | null;
  lastCommitSource: "lexical" | "semantic-assisted" | "manual" | null;
  finalSentenceCommitted: boolean;
};

export type PrompterProgressTracker = {
  acceptEvidence: (evidence: PrompterProgressEvidence) => boolean;
  acceptBoundary: (boundary: PrompterBoundary) => boolean;
  manualNext: (atMs: number) => boolean;
  manualPrevious: (atMs: number) => boolean;
  reset: () => void;
  snapshot: () => PrompterProgressSnapshot;
};

export function createPrompterProgressTracker(options: {
  slideId: string;
  sentences: readonly PrompterProgressSentence[];
  maxEvidenceAgeMs?: number;
}): PrompterProgressTracker {
  const sentences = options.sentences
    .filter((sentence) => sentence.matchable)
    .sort((left, right) => left.index - right.index);
  const maxEvidenceAgeMs = options.maxEvidenceAgeMs ?? 1_500;
  let currentIndex = 0;
  let revision = 0;
  let phase: PrompterProgressPhase = "tracking";
  let latestEvidence: PrompterProgressEvidence | null = null;
  let candidateSinceMs: number | null = null;
  let committedSentenceIds: string[] = [];
  let lastCommittedSentenceId: string | null = null;
  let lastCommitSource: PrompterProgressSnapshot["lastCommitSource"] = null;

  function acceptEvidence(evidence: PrompterProgressEvidence) {
    const currentSentence = sentences[currentIndex];
    if (
      !currentSentence ||
      evidence.sentenceId !== currentSentence.sentenceId ||
      evidence.revision !== revision
    ) {
      return false;
    }

    latestEvidence = evidence;
    if (evidence.candidate) {
      phase = "candidate";
      candidateSinceMs ??= evidence.atMs;
    } else {
      clearCandidate();
    }

    return true;
  }

  function acceptBoundary(boundary: PrompterBoundary) {
    if (!isFreshCommitEvidence(boundary.atMs)) {
      if (latestEvidence && boundary.atMs - latestEvidence.atMs > maxEvidenceAgeMs) {
        clearCandidate();
      }
      return false;
    }

    return commitCurrent(latestEvidence?.source ?? "lexical");
  }

  function manualNext(_atMs: number) {
    return commitCurrent("manual");
  }

  function manualPrevious(_atMs: number) {
    if (sentences.length === 0) {
      return false;
    }

    const targetIndex = Math.max(
      Math.min(currentIndex - 1, sentences.length - 1),
      0
    );
    const targetSentence = sentences[targetIndex];
    if (!targetSentence) {
      return false;
    }

    currentIndex = targetIndex;
    committedSentenceIds = committedSentenceIds.filter((sentenceId) => {
      const sentence = sentences.find((candidate) => candidate.sentenceId === sentenceId);
      return sentence ? sentence.index < targetSentence.index : false;
    });
    lastCommittedSentenceId = committedSentenceIds.at(-1) ?? null;
    lastCommitSource = null;
    revision += 1;
    clearCandidate();
    return true;
  }

  function reset() {
    currentIndex = 0;
    committedSentenceIds = [];
    lastCommittedSentenceId = null;
    lastCommitSource = null;
    revision += 1;
    clearCandidate();
  }

  function snapshot(): PrompterProgressSnapshot {
    const currentSentence = sentences[currentIndex] ?? null;
    return {
      slideId: options.slideId,
      revision,
      phase,
      currentSentenceId: currentSentence?.sentenceId ?? null,
      candidateSentenceId:
        phase === "candidate" ? (latestEvidence?.sentenceId ?? null) : null,
      candidateSinceMs,
      committedSentenceIds: [...committedSentenceIds],
      lastCommittedSentenceId,
      lastCommitSource,
      finalSentenceCommitted:
        sentences.length > 0 && currentIndex >= sentences.length
    };
  }

  function isFreshCommitEvidence(atMs: number) {
    if (!latestEvidence?.candidate || !latestEvidence.commitEligible) {
      return false;
    }

    const ageMs = atMs - latestEvidence.atMs;
    return ageMs >= 0 && ageMs <= maxEvidenceAgeMs;
  }

  function commitCurrent(
    source: Exclude<PrompterProgressSnapshot["lastCommitSource"], null>
  ) {
    const currentSentence = sentences[currentIndex];
    if (!currentSentence) {
      return false;
    }

    committedSentenceIds = [...committedSentenceIds, currentSentence.sentenceId];
    lastCommittedSentenceId = currentSentence.sentenceId;
    lastCommitSource = source;
    currentIndex += 1;
    revision += 1;
    latestEvidence = null;
    candidateSinceMs = null;
    phase = "committed";
    return true;
  }

  function clearCandidate() {
    latestEvidence = null;
    candidateSinceMs = null;
    phase = "tracking";
  }

  return {
    acceptEvidence,
    acceptBoundary,
    manualNext,
    manualPrevious,
    reset,
    snapshot
  };
}
