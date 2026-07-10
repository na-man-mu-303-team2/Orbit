export const semanticCueRuntimeConfig = {
  candidateWeights: {
    lexical: 0.2,
    conceptCoverage: 0.25,
    retrieval: 0.45,
    importance: 0.1
  },
  candidateEligibility: {
    lexical: 0.2,
    retrieval: 0.55
  },
  maxCandidates: 3
} as const;
