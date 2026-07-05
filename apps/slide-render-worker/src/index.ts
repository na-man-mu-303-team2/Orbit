import type { Deck } from "@orbit/shared";
import { renderSlideSnapshot } from "@orbit/slide-renderer";
import type { StoragePort } from "@orbit/storage";

export type SlideRenderJob = {
  deck: Deck;
  effectState?: Record<string, unknown>;
  sessionId: string;
  slideId: string;
};

export type SlideRenderJobResult = {
  contentHash: string;
  key: string;
  slideId: string;
  url: string;
};

export async function handleSlideRenderJob(
  job: SlideRenderJob,
  storage: StoragePort,
): Promise<SlideRenderJobResult> {
  const snapshot = renderSlideSnapshot({
    deck: job.deck,
    slideId: job.slideId,
    effectState: job.effectState ?? {},
  });
  const key = `audience-slide-snapshots/${job.sessionId}/${job.slideId}-${snapshot.contentHash}.svg`;
  const object = await storage.putObject({
    key,
    body: snapshot.body,
    contentType: snapshot.contentType,
    purpose: "audience-slide-snapshot",
  });

  return {
    contentHash: snapshot.contentHash,
    key: object.key,
    slideId: job.slideId,
    url: object.url,
  };
}
