import { describe, expect, it, vi } from "vitest";

import { configureHttpTrustProxy } from "./http-trust-proxy";

describe("configureHttpTrustProxy", () => {
  it("does not trust forwarded addresses for direct deployments", () => {
    const app = { set: vi.fn() };

    configureHttpTrustProxy(app as never, 0);

    expect(app.set).toHaveBeenCalledWith("trust proxy", false);
  });

  it("trusts exactly the configured ALB hop", () => {
    const app = { set: vi.fn() };

    configureHttpTrustProxy(app as never, 1);

    expect(app.set).toHaveBeenCalledWith("trust proxy", 1);
  });
});
