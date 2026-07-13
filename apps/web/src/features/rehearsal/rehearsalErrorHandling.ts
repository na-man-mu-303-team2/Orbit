export const rehearsalDeckInvalidMessage =
  "발표 자료를 리허설용으로 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.";

type ValidationIssueLog = {
  code: string;
  path: Array<string | number>;
};

type ValidationLogContext = {
  deckId: string;
  projectId: string;
};

const rehearsalApiErrorMessages: Record<string, string> = {
  REHEARSAL_DECK_INVALID: rehearsalDeckInvalidMessage,
  REHEARSAL_DECK_VERSION_MISMATCH:
    "발표 자료가 변경되었습니다. 새로고침한 뒤 다시 시도해 주세요."
};

export function getRehearsalValidationIssues(cause: unknown): ValidationIssueLog[] | null {
  if (!isRecord(cause) || !Array.isArray(cause.issues)) {
    return null;
  }

  const issues = cause.issues.flatMap((issue): ValidationIssueLog[] => {
    if (!isRecord(issue) || typeof issue.code !== "string" || !Array.isArray(issue.path)) {
      return [];
    }

    const path = issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number"
    );
    return [{ code: issue.code, path }];
  });

  return issues.length > 0 ? issues : null;
}

export function logRehearsalValidationFailure(
  cause: unknown,
  context: ValidationLogContext,
  logger: (entry: string) => void = (entry) => console.error(entry)
) {
  const issues = getRehearsalValidationIssues(cause);
  if (!issues) {
    return false;
  }

  logger(
    JSON.stringify({
      event: "rehearsal.snapshot.validation_failed",
      projectId: context.projectId,
      deckId: context.deckId,
      issues
    })
  );
  return true;
}

export async function readRehearsalErrorMessage(response: Response, fallback: string) {
  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as { code?: unknown };
    if (typeof payload.code === "string") {
      return rehearsalApiErrorMessages[payload.code] ?? fallback;
    }
  } catch {
    // Raw server responses are intentionally not exposed to the user.
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
