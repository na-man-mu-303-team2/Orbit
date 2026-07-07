import type { RehearsalRunMeta } from "@orbit/shared";
import type { AdviceEventType } from "./speechTrackingConfig";

export type RehearsalLogSlide = {
  slideId: string;
  keywordIds: readonly string[];
};

export type RehearsalLogCollectorOptions = {
  slides: readonly RehearsalLogSlide[];
  now?: () => Date;
  adviceReentryCooldownMs?: number;
};

export type RehearsalLogCollector = {
  enterSlide: (slideId: string) => void;
  recordKeywordHit: (slideId: string, keywordId: string) => void;
  recordProvisionalMissing: (slideId: string, keywordId: string) => void;
  setAdviceState: (type: AdviceEventType, active: boolean) => void;
  finalize: () => RehearsalRunMeta;
};

type AdviceState = {
  active: boolean;
  lastRecordedAtMs: number | null;
};

export function createRehearsalLogCollector(
  options: RehearsalLogCollectorOptions
): RehearsalLogCollector {
  const now = options.now ?? (() => new Date());
  const cooldownMs = options.adviceReentryCooldownMs ?? 15000;
  const slideTimeline: RehearsalRunMeta["slideTimeline"] = [];
  const keywordHits = new Map<string, Set<string>>();
  const provisionalMissing = new Map<string, Set<string>>();
  const adviceState = new Map<AdviceEventType, AdviceState>();
  const adviceEvents: RehearsalRunMeta["adviceEvents"] = [];

  function enterSlide(slideId: string) {
    slideTimeline.push({
      slideId,
      enteredAt: now().toISOString()
    });
  }

  function recordKeywordHit(slideId: string, keywordId: string) {
    getSet(keywordHits, slideId).add(keywordId);
  }

  function recordProvisionalMissing(slideId: string, keywordId: string) {
    getSet(provisionalMissing, slideId).add(keywordId);
  }

  function setAdviceState(type: AdviceEventType, active: boolean) {
    const current = adviceState.get(type) ?? {
      active: false,
      lastRecordedAtMs: null
    };
    const currentTime = now();
    const currentMs = currentTime.getTime();

    if (active && !current.active) {
      const canRecord =
        current.lastRecordedAtMs === null ||
        currentMs - current.lastRecordedAtMs >= cooldownMs;
      if (canRecord) {
        adviceEvents.push({ type, at: currentTime.toISOString() });
        current.lastRecordedAtMs = currentMs;
      }
    }

    current.active = active;
    adviceState.set(type, current);
  }

  function finalize(): RehearsalRunMeta {
    const missedKeywords: RehearsalRunMeta["missedKeywords"] = [];

    for (const slide of options.slides) {
      const hits = keywordHits.get(slide.slideId) ?? new Set<string>();
      for (const keywordId of slide.keywordIds) {
        if (!hits.has(keywordId)) {
          missedKeywords.push({ slideId: slide.slideId, keywordId });
        }
      }
    }

    return {
      endedAt: now().toISOString(),
      slideTimeline: [...slideTimeline],
      missedKeywords,
      adviceEvents: [...adviceEvents]
    };
  }

  return {
    enterSlide,
    recordKeywordHit,
    recordProvisionalMissing,
    setAdviceState,
    finalize
  };
}

function getSet(map: Map<string, Set<string>>, key: string) {
  const current = map.get(key);
  if (current) {
    return current;
  }

  const next = new Set<string>();
  map.set(key, next);
  return next;
}
