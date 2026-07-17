import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  authMeQueryKey,
  fetchCurrentUser,
  markAuthLoggedOut
} from "./features/auth/auth-session";

describe("authentication cache", () => {
  it("treats an unauthorized current-user response as logged out", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await expect(fetchCurrentUser(fetcher)).resolves.toBeNull();
  });

  it("replaces a cached user with an explicit logged-out state", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authMeQueryKey, { userId: "user-1" });

    markAuthLoggedOut(queryClient);

    expect(queryClient.getQueryData(authMeQueryKey)).toBeNull();
  });
});
