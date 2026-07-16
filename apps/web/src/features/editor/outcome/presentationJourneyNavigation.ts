export type PresentationJourneyDestination =
  | "brief"
  | "rehearsal"
  | "presentation";

export type PresentationJourneySaveBlockedReason =
  | "save-error"
  | "version-conflict"
  | "content-changed";

export type PresentationJourneySaveOutcome =
  | { status: "saved" }
  | {
      reason: PresentationJourneySaveBlockedReason;
      recoveryMessage: string;
      status: "blocked";
    };

export type PresentationJourneyNavigationBlockedReason =
  | PresentationJourneySaveBlockedReason
  | "preparation-error";

export type PresentationJourneyNavigationResult =
  | {
      destination: PresentationJourneyDestination;
      status: "navigated";
    }
  | {
      destination: PresentationJourneyDestination;
      status: "ignored-duplicate";
    }
  | {
      destination: PresentationJourneyDestination;
      reason: PresentationJourneyNavigationBlockedReason;
      recoveryMessage: string;
      status: "blocked";
    };

export type PresentationJourneyNavigationDependencies = {
  navigate: (destination: PresentationJourneyDestination) => void | Promise<void>;
  prepare?: (destination: PresentationJourneyDestination) => void | Promise<void>;
  save: (
    destination: PresentationJourneyDestination,
  ) => PresentationJourneySaveOutcome | Promise<PresentationJourneySaveOutcome>;
};

export type PresentationJourneyNavigationCoordinator = {
  navigate: (
    destination: PresentationJourneyDestination,
  ) => Promise<PresentationJourneyNavigationResult>;
};

export function createPresentationJourneyNavigationCoordinator(
  dependencies: PresentationJourneyNavigationDependencies,
): PresentationJourneyNavigationCoordinator {
  let isNavigationInFlight = false;

  return {
    navigate(destination) {
      if (isNavigationInFlight) {
        return Promise.resolve({
          destination,
          status: "ignored-duplicate",
        });
      }

      isNavigationInFlight = true;
      return runNavigation(dependencies, destination).finally(() => {
        isNavigationInFlight = false;
      });
    },
  };
}

async function runNavigation(
  dependencies: PresentationJourneyNavigationDependencies,
  destination: PresentationJourneyDestination,
): Promise<PresentationJourneyNavigationResult> {
  let saveOutcome: PresentationJourneySaveOutcome;
  try {
    saveOutcome = await dependencies.save(destination);
  } catch (error) {
    return blockedResult(
      destination,
      "save-error",
      errorMessage(error, "편집 내용을 저장하지 못했습니다. 다시 시도해 주세요."),
    );
  }

  if (saveOutcome.status === "blocked") {
    return blockedResult(
      destination,
      saveOutcome.reason,
      saveOutcome.recoveryMessage,
    );
  }

  if (dependencies.prepare) {
    try {
      await dependencies.prepare(destination);
    } catch (error) {
      return blockedResult(
        destination,
        "preparation-error",
        errorMessage(error, "이동 준비에 실패했습니다. 다시 시도해 주세요."),
      );
    }
  }

  await dependencies.navigate(destination);
  return { destination, status: "navigated" };
}

function blockedResult(
  destination: PresentationJourneyDestination,
  reason: PresentationJourneyNavigationBlockedReason,
  recoveryMessage: string,
): PresentationJourneyNavigationResult {
  return {
    destination,
    reason,
    recoveryMessage,
    status: "blocked",
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
