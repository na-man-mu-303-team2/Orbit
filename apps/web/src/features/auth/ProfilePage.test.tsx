import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { updateProfileDisplayName } from "./auth-session";
import { ProfilePage } from "./ProfilePage";

describe("ProfilePage", () => {
  it("renders the current nickname and read-only email", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ProfilePage
          onNavigate={() => undefined}
          user={{
            displayName: "발표 장인",
            email: "person@example.com",
            userId: "user_1"
          }}
        />
      </QueryClientProvider>
    );

    expect(html).toContain("발표 장인");
    expect(html).toContain("person@example.com");
    expect(html).toContain('readOnly=""');
  });

  it("updates the profile through the authenticated API contract", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: {
        displayName: "새 닉네임",
        email: "person@example.com",
        userId: "user_1"
      }
    }), { status: 200 }));

    await expect(updateProfileDisplayName("새 닉네임", fetcher)).resolves.toMatchObject({
      displayName: "새 닉네임"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/auth/profile",
      expect.objectContaining({ method: "PATCH", credentials: "include" })
    );
  });

  it("maps duplicate nickname conflicts to a user-facing message", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Nickname already in use"
    }), { status: 409 }));

    await expect(updateProfileDisplayName("Orbit", fetcher)).rejects.toThrow(
      "이미 사용 중인 닉네임입니다."
    );
  });
});
