import type {
  ActivitySessionResultItem,
  PresentationRunStatus,
} from "@orbit/shared";

export function isPresentationAnalysisPending(status?: PresentationRunStatus) {
  return (
    status === "created" || status === "uploading" || status === "processing"
  );
}

export function countAudienceResponses(items: ActivitySessionResultItem[]) {
  return items.reduce(
    (total, item) =>
      total + (item.result?.responseCount ?? item.run.responseCount),
    0,
  );
}
