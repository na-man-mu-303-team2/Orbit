import {
  putRehearsalFocusProfileRequestSchema,
  rehearsalFocusProfileRevisionConflictSchema,
  rehearsalFocusProfileSchema,
  type PutRehearsalFocusProfileRequest,
  type RehearsalFocusProfile,
  type RehearsalFocusProfileRevisionConflict,
} from "@orbit/shared";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchRehearsalFocusProfile(
  projectId: string,
  fetcher: Fetcher = fetch,
): Promise<RehearsalFocusProfile | null> {
  const response = await fetcher(focusProfileUrl(projectId), {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("연습 목표를 불러오지 못했습니다.");
  }
  return parseProfileResponse(await response.json());
}

export async function putRehearsalFocusProfile(
  projectId: string,
  input: PutRehearsalFocusProfileRequest,
  fetcher: Fetcher = fetch,
): Promise<RehearsalFocusProfile> {
  const request = putRehearsalFocusProfileRequestSchema.parse(input);
  const response = await fetcher(focusProfileUrl(projectId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const conflict =
      rehearsalFocusProfileRevisionConflictSchema.safeParse(payload);
    if (response.status === 409 && conflict.success) {
      throw new RehearsalFocusProfileConflictError(conflict.data);
    }
    throw new Error("연습 목표를 저장하지 못했습니다.");
  }
  const profile = parseProfileResponse(payload);
  if (!profile) {
    throw new Error("저장된 연습 목표 응답이 비어 있습니다.");
  }
  return profile;
}

export class RehearsalFocusProfileConflictError extends Error {
  readonly currentProfile: RehearsalFocusProfile;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(conflict: RehearsalFocusProfileRevisionConflict) {
    super(
      "다른 변경이 먼저 저장됐습니다. 입력 내용과 서버의 최신 목표를 비교해 다시 확인해 주세요.",
    );
    this.name = "RehearsalFocusProfileConflictError";
    this.currentProfile = conflict.currentProfile;
    this.expectedRevision = conflict.expectedRevision;
    this.actualRevision = conflict.actualRevision;
  }
}

function focusProfileUrl(projectId: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-focus-profile`;
}

function parseProfileResponse(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("profile" in payload)) {
    throw new Error("연습 목표 응답 형식이 올바르지 않습니다.");
  }
  const profile = (payload as { profile: unknown }).profile;
  return profile === null ? null : rehearsalFocusProfileSchema.parse(profile);
}
