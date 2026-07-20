export type PresentationRuntimePhase =
  | "preflight"
  | "starting"
  | "active"
  | "finishing"
  | "failed";

export function shouldWarnBeforePresentationUnload(phase: PresentationRuntimePhase) {
  return phase === "active" || phase === "finishing";
}
