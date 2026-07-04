import type { AudienceSessionLookupResponse } from "@orbit/shared";

export async function getAudienceSessionAccess(
  joinCode: string,
): Promise<AudienceSessionLookupResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/join/${encodeURIComponent(joinCode)}`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error("입장 링크 또는 비밀번호를 확인해 주세요.");
  }

  return response.json() as Promise<AudienceSessionLookupResponse>;
}

export async function verifyAudienceSessionPasscode(args: {
  passcode: string;
  sessionId: string;
}): Promise<AudienceSessionLookupResponse> {
  const response = await fetch(
    `/api/v1/presentation-sessions/join/${encodeURIComponent(args.sessionId)}`,
    {
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "GET",
    },
  );

  if (!response.ok) {
    throw new Error("입장 링크 또는 비밀번호를 확인해 주세요.");
  }

  return response.json() as Promise<AudienceSessionLookupResponse>;
}
