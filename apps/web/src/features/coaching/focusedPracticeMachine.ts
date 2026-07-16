export type FocusedPracticeClientState =
  | "loading" | "ready" | "recording" | "uploading" | "processing" | "result" | "failed" | "terminal";

const transitions: Record<FocusedPracticeClientState, FocusedPracticeClientState[]> = {
  loading: ["ready", "processing", "failed", "terminal"],
  ready: ["recording", "terminal"],
  recording: ["uploading", "ready", "failed"],
  uploading: ["processing", "failed"],
  processing: ["result", "failed", "terminal"],
  result: ["recording", "terminal"],
  failed: ["ready", "terminal"],
  terminal: [],
};

export function transitionFocusedPractice(state: FocusedPracticeClientState, next: FocusedPracticeClientState) {
  if (!transitions[state].includes(next)) throw new Error(`Invalid focused practice transition: ${state} -> ${next}`);
  return next;
}

export function shouldPollFocusedPractice(state: FocusedPracticeClientState) {
  return state === "processing" || state === "loading";
}
