import type { QueryClient } from "@tanstack/react-query";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AuthUser = {
  userId: string;
  email?: string;
  displayName?: string;
};

export const authMeQueryKey = ["auth", "me"] as const;

export async function fetchCurrentUser(fetcher: Fetcher = fetch): Promise<AuthUser | null> {
  const response = await fetcher("/api/v1/auth/me", {
    credentials: "include"
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Unauthenticated");
  }
  const payload = (await response.json()) as AuthUser | { user: AuthUser };
  return "user" in payload ? payload.user : payload;
}

export function markAuthLoggedOut(queryClient: QueryClient) {
  queryClient.setQueryData<AuthUser | null>(authMeQueryKey, null);
}
