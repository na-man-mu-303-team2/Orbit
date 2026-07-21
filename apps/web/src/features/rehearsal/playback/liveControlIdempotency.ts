export type LiveControlEvidenceScope = {
  sessionId: string;
  slideId: string;
  slideRevision: number | string;
  utteranceId: string;
  contentIndex: number;
};

export type LiveControlIdempotencyGate = {
  claim: (scope: LiveControlEvidenceScope, targetId: string) => boolean;
  isClaimed: (scope: LiveControlEvidenceScope, targetId: string) => boolean;
  reset: () => void;
  size: () => number;
};

export function createLiveControlIdempotencyGate(options: {
  maxEntries?: number;
} = {}): LiveControlIdempotencyGate {
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? 2_048));
  const claimedKeys = new Set<string>();

  return {
    claim(scope, targetId) {
      const key = createLiveControlIdempotencyKey(scope, targetId);
      if (claimedKeys.has(key)) {
        return false;
      }

      claimedKeys.add(key);
      while (claimedKeys.size > maxEntries) {
        const oldestKey = claimedKeys.values().next().value;
        if (typeof oldestKey !== "string") {
          break;
        }
        claimedKeys.delete(oldestKey);
      }
      return true;
    },
    isClaimed(scope, targetId) {
      return claimedKeys.has(createLiveControlIdempotencyKey(scope, targetId));
    },
    reset() {
      claimedKeys.clear();
    },
    size() {
      return claimedKeys.size;
    }
  };
}

export function createLiveControlIdempotencyKey(
  scope: LiveControlEvidenceScope,
  targetId: string
) {
  return JSON.stringify([
    scope.sessionId,
    scope.slideId,
    String(scope.slideRevision),
    scope.utteranceId,
    scope.contentIndex,
    targetId
  ]);
}
