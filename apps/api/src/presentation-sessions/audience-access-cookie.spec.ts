import type { OrbitConfig } from "@orbit/config";
import { describe, expect, it } from "vitest";

import { createAudienceAccessToken, verifyAudienceAccessToken } from "./audience-access-cookie";

const config = {
  SESSION_SECRET: "test-session-secret",
  APP_ENV: "test"
} as OrbitConfig;
const session = {
  sessionId: "session_1",
  projectId: "project_1",
  expiresAt: "2027-07-31T00:00:00.000Z"
};

describe("audience access cookie", () => {
  it("preserves an existing audience ID for the same session", () => {
    const token = createAudienceAccessToken(
      config,
      session,
      "test-agent",
      "audience_existing"
    );

    expect(verifyAudienceAccessToken(config, token, "test-agent")?.audienceId).toBe(
      "audience_existing"
    );
  });

  it("rejects a token replayed with a different user agent", () => {
    const token = createAudienceAccessToken(config, session, "test-agent");

    expect(verifyAudienceAccessToken(config, token, "other-agent")).toBeNull();
  });
});
