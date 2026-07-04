import type { CueMatch } from "./cueMatcher";

export type CueEngineCommand =
  | {
      type: "set-highlight";
      active: true;
      cueId: string;
      elementId: string;
      slideId: string;
    }
  | {
      type: "next-step";
      animationId: string;
      cueId: string;
      slideId: string;
    }
  | {
      type: "mark-advance-cue-matched";
      cueId: string;
      slideId: string;
    };

export type CueEngine = {
  executeMatches: (matches: readonly CueMatch[]) => CueEngineCommand[];
  resetForSlideVisit: () => void;
};

export function createCueEngine(): CueEngine {
  const executedCueIds = new Set<string>();

  function executeMatches(matches: readonly CueMatch[]) {
    const commands: CueEngineCommand[] = [];

    for (const match of matches) {
      if (executedCueIds.has(match.cueId)) {
        continue;
      }

      executedCueIds.add(match.cueId);
      switch (match.action.type) {
        case "highlight":
          commands.push({
            type: "set-highlight",
            active: true,
            cueId: match.cueId,
            elementId: match.action.elementId,
            slideId: match.slideId
          });
          break;
        case "animation":
          commands.push({
            type: "next-step",
            animationId: match.action.animationId,
            cueId: match.cueId,
            slideId: match.slideId
          });
          break;
        case "advance-slide":
          commands.push({
            type: "mark-advance-cue-matched",
            cueId: match.cueId,
            slideId: match.slideId
          });
          break;
      }
    }

    return commands;
  }

  return {
    executeMatches,
    resetForSlideVisit: () => {
      executedCueIds.clear();
    }
  };
}
