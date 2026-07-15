import type { CreateRehearsalRunRequest } from "@orbit/shared";

type SlideSnapshots = NonNullable<CreateRehearsalRunRequest["slideSnapshots"]>;

type PreparedSlideSnapshots = {
  deckId: string;
  deckVersion: number;
  projectId: string;
  snapshots: SlideSnapshots;
};

const storageKeyPrefix = "orbit.rehearsalSlideSnapshots.v1";

export class PreparedRehearsalSlideSnapshotsError extends Error {
  constructor() {
    super(
      "슬라이드 snapshot 준비 정보가 만료되었거나 올바르지 않습니다. 프로젝트에서 리허설을 다시 시작해 주세요.",
    );
    this.name = "PreparedRehearsalSlideSnapshotsError";
  }
}

export function storePreparedRehearsalSlideSnapshots(input: PreparedSlideSnapshots) {
  const preparationId = crypto.randomUUID();
  sessionStorage.setItem(
    `${storageKeyPrefix}:${preparationId}`,
    JSON.stringify(input),
  );
  return preparationId;
}

export function readPreparedRehearsalSlideSnapshots(input: {
  deckId: string;
  deckVersion: number;
  preparationId?: string;
  projectId: string;
}): SlideSnapshots | undefined {
  if (!input.preparationId) {
    return undefined;
  }

  const key = `${storageKeyPrefix}:${input.preparationId}`;
  const serialized = sessionStorage.getItem(key);
  if (!serialized) {
    throw new PreparedRehearsalSlideSnapshotsError();
  }

  try {
    const prepared = JSON.parse(serialized) as unknown;
    if (
      !isPreparedSlideSnapshots(prepared) ||
      prepared.projectId !== input.projectId ||
      prepared.deckId !== input.deckId ||
      prepared.deckVersion !== input.deckVersion
    ) {
      throw new PreparedRehearsalSlideSnapshotsError();
    }

    return prepared.snapshots;
  } catch (cause) {
    sessionStorage.removeItem(key);
    if (cause instanceof PreparedRehearsalSlideSnapshotsError) {
      throw cause;
    }
    throw new PreparedRehearsalSlideSnapshotsError();
  }
}

export function clearPreparedRehearsalSlideSnapshots(preparationId?: string) {
  if (!preparationId) return;
  sessionStorage.removeItem(`${storageKeyPrefix}:${preparationId}`);
}

function isPreparedSlideSnapshots(value: unknown): value is PreparedSlideSnapshots {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) {
    return false;
  }

  const seenSlideIds = new Set<string>();
  const snapshotsAreValid = value.snapshots.every((snapshot) => {
    if (
      !isRecord(snapshot) ||
      typeof snapshot.fileId !== "string" ||
      snapshot.fileId.trim().length === 0 ||
      typeof snapshot.slideId !== "string" ||
      snapshot.slideId.trim().length === 0 ||
      seenSlideIds.has(snapshot.slideId)
    ) {
      return false;
    }
    seenSlideIds.add(snapshot.slideId);
    return true;
  });

  return (
    snapshotsAreValid &&
    typeof value.projectId === "string" &&
    value.projectId.length > 0 &&
    typeof value.deckId === "string" &&
    value.deckId.length > 0 &&
    typeof value.deckVersion === "number" &&
    Number.isInteger(value.deckVersion) &&
    value.deckVersion > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
