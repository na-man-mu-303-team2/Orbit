import { authSessionCookieName } from "../auth/auth.constants";
import type { AuthService } from "../auth/auth.service";
import type { SignedCookieRequest } from "../auth/current-user";
import { describe, expect, it, vi } from "vitest";

import { RehearsalFocusProfilesController } from "./rehearsal-focus-profiles.controller";
import type { RehearsalFocusProfilesService } from "./rehearsal-focus-profiles.service";

describe("RehearsalFocusProfilesController", () => {
  it("passes the authenticated user to read and write operations", async () => {
    const fixture = createController();
    const body = { expectedRevision: 0, items: [] };

    await fixture.controller.get("project_1", signedRequest());
    await fixture.controller.put("project_1", body, signedRequest());

    expect(fixture.focusProfiles.get).toHaveBeenCalledWith(
      "project_1",
      "user_1",
    );
    expect(fixture.focusProfiles.put).toHaveBeenCalledWith(
      "project_1",
      "user_1",
      body,
    );
  });

  it("does not call the service without a signed session", async () => {
    const fixture = createController();

    await expect(
      fixture.controller.get("project_1", {
        signedCookies: {},
      } as unknown as SignedCookieRequest),
    ).rejects.toThrow("Authentication required");
    expect(fixture.focusProfiles.get).not.toHaveBeenCalled();
  });
});

function createController() {
  const auth = {
    me: vi.fn(async () => ({
      user: { userId: "user_1", email: "user@example.com" },
    })),
  } as unknown as AuthService;
  const focusProfiles = {
    get: vi.fn(async () => ({ profile: null })),
    put: vi.fn(async () => ({ profile: null })),
  };
  return {
    controller: new RehearsalFocusProfilesController(
      auth,
      focusProfiles as unknown as RehearsalFocusProfilesService,
    ),
    focusProfiles,
  };
}

function signedRequest(): SignedCookieRequest {
  return {
    signedCookies: { [authSessionCookieName]: "session_1" },
  } as unknown as SignedCookieRequest;
}
